"use client";

import { useEffect, useRef, useState } from "react";
import { animate, AnimatePresence, motion } from "framer-motion";
import { upload } from "@vercel/blob/client";
import { Loader2, AlertTriangle, FileText, Check } from "lucide-react";
import { useJuez } from "@/lib/store";
import { ANALYSIS_PHASES, MIN_ANALYSIS_MS, DIRECT_TOTAL_BYTES } from "@/lib/analysis";
import { BrandMark } from "@/components/Brand";
import PulseLine from "@/components/ui/PulseLine";
import type { VerdictResponse } from "@/lib/types";

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_TRIES = 90; // ~6 minutos

type JobStatus =
  | { status: "pending" }
  | { status: "done"; verdict: VerdictResponse }
  | { status: "error"; error: string };

export default function AnalyzingCard() {
  const { files, setVerdict, goTo } = useJuez();
  const [phase, setPhase] = useState(0);
  const [pct, setPct] = useState(0);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (files.length === 0) {
      goTo("upload");
      return;
    }
    let cancelled = false;
    setError(null);
    setPhase(0);
    setPct(0);
    setUploadingIdx(null);

    const stepMs = MIN_ANALYSIS_MS / ANALYSIS_PHASES.length;
    intervalRef.current = setInterval(() => {
      setPhase((p) => Math.min(p + 1, ANALYSIS_PHASES.length - 1));
    }, stepMs);

    const counter = animate(0, 99, {
      duration: MIN_ANALYSIS_MS / 1000,
      ease: [0.4, 0, 0.2, 1],
      onUpdate: (v) => setPct(Math.round(v)),
    });

    async function evaluateDirect(): Promise<VerdictResponse> {
      const body = new FormData();
      for (const f of files) body.append("file", f);
      const res = await fetch("/api/evaluate", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "request_failed");
      return data as VerdictResponse;
    }

    async function evaluateViaBlob(): Promise<VerdictResponse> {
      // 1) Subida directa del navegador a Vercel Blob (evita el límite de 4.5 MB).
      const refs: Array<{ url: string; name: string }> = [];
      for (const [i, f] of files.entries()) {
        if (cancelled) throw new Error("cancelled");
        setUploadingIdx(i);
        const blob = await upload(`casos/${f.name}`, f, {
          access: "public",
          handleUploadUrl: "/api/upload",
        });
        refs.push({ url: blob.url, name: f.name });
      }
      setUploadingIdx(null);

      // 2) Arranca el análisis en segundo plano.
      const start = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: refs }),
      });
      const started = await start.json().catch(() => ({}));
      if (!start.ok || !started.jobId) {
        throw new Error(started.error ?? "request_failed");
      }

      // 3) Consulta el resultado (sobrevive a cortes del navegador móvil).
      for (let i = 0; i < POLL_MAX_TRIES; i++) {
        if (cancelled) throw new Error("cancelled");
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const res = await fetch(`/api/evaluate?id=${started.jobId}`, { cache: "no-store" });
        if (res.status === 202) continue;
        const data = (await res.json().catch(() => null)) as JobStatus | null;
        if (!data) continue;
        if (data.status === "done") return data.verdict;
        if (data.status === "error") throw new Error(data.error);
      }
      throw new Error("El análisis está tardando demasiado. Inténtalo de nuevo.");
    }

    async function run() {
      const minDelay = new Promise((r) => setTimeout(r, MIN_ANALYSIS_MS));
      try {
        const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
        const verdict =
          totalBytes <= DIRECT_TOTAL_BYTES
            ? await evaluateDirect()
            : await evaluateViaBlob();
        await minDelay;
        if (cancelled) return;
        setVerdict(verdict, Boolean(verdict.demo));
        goTo("verdict");
      } catch (err) {
        if (cancelled) return;
        const msg = (err as Error).message;
        // "" muestra el mensaje genérico; un texto concreto se muestra tal cual.
        setError(msg && msg !== "request_failed" ? msg : "");
      }
    }
    run();

    return () => {
      cancelled = true;
      counter.stop();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (files.length === 0) return null;

  if (error !== null) {
    return (
      <ErrorView
        message={error || undefined}
        onRetry={() => setAttempt((a) => a + 1)}
        onBack={() => goTo("upload")}
      />
    );
  }

  const active = ANALYSIS_PHASES[phase];
  const statusLabel =
    uploadingIdx !== null
      ? `Subiendo documento ${uploadingIdx + 1} de ${files.length}`
      : "Analizando tu expediente";

  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      <div className="glass p-6 sm:p-7">
        <div className="flex flex-col items-center text-center">
          <ThinkingEmblem />

          <span className="pill mt-6">
            <span className="flex gap-1">
              <Dot delay="0s" />
              <Dot delay="0.15s" />
              <Dot delay="0.3s" />
            </span>
            {statusLabel}
          </span>

          <div className="mt-4 min-h-[58px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={phase}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
              >
                <h2 className="font-display text-[23px] font-bold tracking-tight text-ink sm:text-[25px]">
                  {active.label}
                </h2>
                <p className="mt-1 text-[15px] text-ink-muted">{active.detail}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <Console files={files} phase={phase} pct={pct} uploadingIdx={uploadingIdx} />
      </div>
    </div>
  );
}

function ThinkingEmblem() {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <span className="absolute inset-2 rounded-full bg-navy/15 animate-pulse-ring" />
      <span
        className="absolute inset-2 rounded-full bg-gold/25 animate-pulse-ring"
        style={{ animationDelay: "0.9s" }}
      />
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(255,195,35,0.9) 90deg, rgba(1,45,106,0.9) 200deg, transparent 320deg)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 2.6, ease: "linear", repeat: Infinity }}
      />
      <span className="absolute inset-[5px] rounded-full bg-white/90 backdrop-blur-sm" />
      <BrandMark className="relative h-[58px] w-[58px] rounded-2xl" />
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 rounded-full bg-gold-deep animate-bounce-dot"
      style={{ animationDelay: delay }}
    />
  );
}

/** Consola oscura: monitor de pulso + registro del sistema + telemetría del caso. */
function Console({
  files,
  phase,
  pct,
  uploadingIdx,
}: {
  files: File[];
  phase: number;
  pct: number;
  uploadingIdx: number | null;
}) {
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  const pages = Math.min(600, Math.max(1, Math.round(totalBytes / 45_000)));
  const hechos = Math.round((14 * pct) / 100);
  const fechas = Math.round((7 * pct) / 100);
  const pag = Math.max(1, Math.round((pages * Math.min(pct * 1.6, 100)) / 100));

  const headerLabel =
    files.length === 1 ? files[0].name : `${files.length} documentos del caso`;

  const visible = ANALYSIS_PHASES.slice(Math.max(0, phase - 2), phase + 1);

  return (
    <div className="console-grid mt-6 overflow-hidden rounded-2xl bg-navy-dark p-4 shadow-navy">
      {/* Cabecera del monitor */}
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wide text-white/70">
          <FileText className="h-3.5 w-3.5 shrink-0 text-gold" />
          <span className="truncate">{headerLabel}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
          <span className="h-1.5 w-1.5 rounded-full bg-gold animate-blink" />
          En vivo
        </span>
      </div>

      {/* Monitor de pulso */}
      <PulseLine loop className="mt-2 h-10 w-full" />

      <div className="my-3 h-px bg-white/10" />

      {/* Registro del sistema */}
      <div className="min-h-[66px] space-y-1.5">
        {uploadingIdx !== null ? (
          <TypedLine
            text={`Subiendo ${files[uploadingIdx]?.name ?? "documento"} (${uploadingIdx + 1}/${files.length})`}
          />
        ) : (
          visible.map((p, i) => {
            const isActive = i === visible.length - 1;
            return isActive ? (
              <TypedLine key={p.label} text={p.label} />
            ) : (
              <p
                key={p.label}
                className="flex items-center gap-2 font-mono text-[12px] text-white/45"
              >
                <Check className="h-3 w-3 text-gold" strokeWidth={3} />
                {p.label}
              </p>
            );
          })
        )}
      </div>

      <div className="my-3 h-px bg-white/10" />

      {/* Telemetría + progreso */}
      <div className="flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-wide text-white/55">
        <span>
          Docs <span className="text-gold">{pad(files.length)}</span>
        </span>
        <span>
          Hechos <span className="text-gold">{pad(hechos)}</span>
        </span>
        <span>
          Fechas <span className="text-gold">{pad(fechas)}</span>
        </span>
        <span>
          Pág <span className="text-gold">{pad(pag)}</span>
        </span>
        <span className="text-gold">{pad(pct)}%</span>
      </div>
      <SegmentBar pct={pct} />
    </div>
  );
}

/** Línea de terminal que se escribe sola, con cursor. */
function TypedLine({ text }: { text: string }) {
  const [len, setLen] = useState(0);
  useEffect(() => {
    setLen(0);
    const id = setInterval(() => {
      setLen((l) => {
        if (l >= text.length) {
          clearInterval(id);
          return l;
        }
        return l + 1;
      });
    }, 22);
    return () => clearInterval(id);
  }, [text]);

  return (
    <p className="flex items-center gap-2 font-mono text-[12px] font-bold text-white">
      <span className="text-gold">›</span>
      <span className="min-w-0 truncate">{text.slice(0, len)}</span>
      <span className="h-3.5 w-[7px] shrink-0 bg-gold animate-blink" />
    </p>
  );
}

const SEGMENTS = 26;

function SegmentBar({ pct }: { pct: number }) {
  const filled = Math.round((pct / 100) * SEGMENTS);
  return (
    <div className="mt-2 flex gap-[3px]">
      {Array.from({ length: SEGMENTS }).map((_, i) => (
        <span
          key={i}
          className={`h-2.5 flex-1 rounded-[2px] transition-colors duration-300 ${
            i < filled
              ? i === filled - 1
                ? "bg-gold animate-blink"
                : "bg-gold/80"
              : "bg-white/10"
          }`}
        />
      ))}
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ErrorView({
  message,
  onRetry,
  onBack,
}: {
  message?: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      <div className="glass flex flex-col items-center p-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-bad/10 text-bad">
          <AlertTriangle className="h-7 w-7" />
        </span>
        <h2 className="mt-6 font-display text-[24px] font-bold tracking-tight text-ink">
          No pudimos completar el diagnóstico
        </h2>
        <p className="mt-2 text-[16px] text-ink-soft">
          {message || "Hubo un problema al procesar tus documentos."}
        </p>
        <div className="mt-7 w-full space-y-3">
          <button onClick={onRetry} className="btn-lg">
            <Loader2 className="h-5 w-5" />
            Reintentar
          </button>
          <button onClick={onBack} className="btn-ghost-lg w-full">
            Volver atrás
          </button>
        </div>
      </div>
    </div>
  );
}
