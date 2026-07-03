"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { animate, AnimatePresence, motion } from "framer-motion";
import {
  FileDown,
  AlertTriangle,
  Loader2,
  Check,
  CheckCircle2,
  Landmark,
} from "lucide-react";
import Background from "@/components/Background";
import Header from "@/components/Header";
import ScoreRing from "@/components/ui/ScoreRing";
import Reveal from "@/components/ui/Reveal";
import PulseLine from "@/components/ui/PulseLine";
import ServicesCTA from "@/components/ServicesCTA";
import { BrandMark } from "@/components/Brand";
import type { ProResult, PrepLevel } from "@/lib/types";

const FASES = [
  "Verificando tu pago",
  "Abriendo tu expediente",
  "Leyendo cada página",
  "Auditando elemento por elemento",
  "Redactando tu informe",
  "Generando tu PDF",
];

const FASES_MS = 24_000;
const POLL_MS = 5000;
const POLL_MAX = 96; // ~8 minutos

const PREP: Record<PrepLevel, { label: string; color: string; bg: string }> = {
  A: { label: "Listo para presentar", color: "text-good", bg: "bg-good/10" },
  B: { label: "Necesita trabajo dirigido", color: "text-gold-deep", bg: "bg-gold/15" },
  C: { label: "Riesgo alto · busca representación", color: "text-bad", bg: "bg-bad/10" },
};

export default function ResultadoPage() {
  return (
    <Suspense>
      <Resultado />
    </Suspense>
  );
}

function Resultado() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const devJob = params.get("dev_job");

  const [result, setResult] = useState<Extract<ProResult, { status: "done" }> | null>(
    null,
  );
  const [fase, setFase] = useState(0);
  const [pct, setPct] = useState(0);
  const [fatal, setFatal] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const meta = useRef<{ nombre?: string; fileNames?: string[] }>({});

  useEffect(() => {
    try {
      meta.current = JSON.parse(sessionStorage.getItem("pro-meta") ?? "{}");
    } catch {
      meta.current = {};
    }
  }, []);

  useEffect(() => {
    if (!sessionId && !devJob) {
      setFatal("Falta la referencia del pago. Vuelve a la página del informe.");
      return;
    }
    let cancelled = false;
    setFatal(null);
    setResult(null);
    setFase(0);

    const faseTimer = setInterval(
      () => setFase((f) => Math.min(f + 1, FASES.length - 1)),
      FASES_MS / FASES.length,
    );
    const counter = animate(0, 97, {
      duration: 150,
      ease: [0.3, 0.6, 0.4, 1],
      onUpdate: (v) => setPct(Math.round(v)),
    });

    async function run() {
      try {
        const start = await fetch("/api/pro/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sessionId ? { sessionId } : { devJobId: devJob }),
        });
        const started = (await start.json().catch(() => ({}))) as {
          jobId?: string;
          error?: string;
        };
        if (!start.ok || !started.jobId) {
          throw new Error(started.error ?? "No pudimos verificar el pago.");
        }

        for (let i = 0; i < POLL_MAX; i++) {
          if (cancelled) return;
          const res = await fetch(`/api/pro/run?id=${started.jobId}`, {
            cache: "no-store",
          });
          if (res.status !== 202) {
            const data = (await res.json().catch(() => null)) as ProResult | null;
            if (data?.status === "done") {
              if (!cancelled) setResult(data);
              return;
            }
            if (data?.status === "error") throw new Error(data.error);
          }
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
        throw new Error("El informe está tardando más de lo normal. Recarga esta página en unos minutos: tu pago quedó registrado.");
      } catch (err) {
        if (!cancelled) setFatal((err as Error).message);
      }
    }
    run();

    return () => {
      cancelled = true;
      counter.stop();
      clearInterval(faseTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, sessionId, devJob]);

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <Background />
      <Header />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-8 sm:px-6">
        {fatal !== null ? (
          <ErrorView message={fatal} onRetry={() => setAttempt((a) => a + 1)} />
        ) : result === null ? (
          <Procesando fase={fase} pct={pct} fileNames={meta.current.fileNames} />
        ) : (
          <Listo result={result} />
        )}
      </main>
    </div>
  );
}

function Procesando({
  fase,
  pct,
  fileNames,
}: {
  fase: number;
  pct: number;
  fileNames?: string[];
}) {
  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      <div className="glass p-7 sm:p-8">
        <div className="flex flex-col items-center text-center">
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

          <span className="pill mt-6">
            <Loader2 className="h-4 w-4 animate-spin text-gold-deep" />
            Preparando tu informe premium
          </span>

          <div className="mt-4 min-h-[40px]">
            <AnimatePresence mode="wait">
              <motion.h2
                key={fase}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
                className="font-display text-[23px] font-bold tracking-tight text-ink"
              >
                {FASES[fase]}
              </motion.h2>
            </AnimatePresence>
          </div>
          <p className="mt-1 text-[15px] text-ink-muted">
            Esto puede tardar unos minutos. No cierres esta página.
          </p>
        </div>

        <div className="console-grid mt-6 rounded-2xl bg-navy-dark p-4 shadow-navy">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-mono text-[11px] font-bold uppercase tracking-wide text-white/70">
              {fileNames?.length
                ? `${fileNames.length} documento${fileNames.length > 1 ? "s" : ""} del caso`
                : "Expediente del caso"}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-blink" />
              En vivo
            </span>
          </div>
          <PulseLine loop className="mt-2 h-10 w-full" />
          <div className="my-3 h-px bg-white/10" />
          <div className="space-y-1.5">
            {FASES.slice(0, fase + 1)
              .slice(-3)
              .map((f, i, arr) => (
                <p
                  key={f}
                  className={`flex items-center gap-2 font-mono text-[12px] ${
                    i === arr.length - 1 ? "font-bold text-white" : "text-white/45"
                  }`}
                >
                  {i === arr.length - 1 ? (
                    <span className="text-gold">›</span>
                  ) : (
                    <Check className="h-3 w-3 text-gold" strokeWidth={3} />
                  )}
                  {f}
                  {i === arr.length - 1 && (
                    <span className="h-3.5 w-[7px] bg-gold animate-blink" />
                  )}
                </p>
              ))}
          </div>
          <div className="my-3 h-px bg-white/10" />
          <div className="flex items-center justify-between font-mono text-[11px] font-bold text-white/55">
            <span>PROCESANDO</span>
            <span className="text-gold">{String(pct).padStart(2, "0")}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Listo({ result }: { result: Extract<ProResult, { status: "done" }> }) {
  const { informe, cliente, pdfUrl } = result;
  const prep = PREP[informe.prepLevel];

  return (
    <div className="flex flex-1 flex-col space-y-4 py-4">
      <Reveal className="glass flex flex-col items-center px-6 py-9 text-center">
        <span className="sys-label mb-3">Informe premium · USA Latino Prime</span>
        <h1 className="text-balance font-display text-[26px] font-bold leading-tight tracking-tight text-ink">
          Tu informe está listo{cliente.nombre ? `, ${primerNombre(cliente.nombre)}` : ""}
        </h1>
        <div className="mt-6">
          <ScoreRing value={informe.score} level={informe.level} />
        </div>
        <div className={`mt-6 inline-flex items-center gap-2.5 rounded-full px-4 py-2 ${prep.bg}`}>
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full bg-white font-display text-[15px] font-bold shadow-sm ${prep.color}`}
          >
            {informe.prepLevel}
          </span>
          <span className={`text-[14px] font-bold ${prep.color}`}>{prep.label}</span>
        </div>
        <p className="mt-5 text-balance text-[16px] leading-relaxed text-ink-soft">
          {informe.headline}
        </p>

        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gold px-6 py-[18px] text-[19px] font-bold text-navy shadow-gold transition-transform active:scale-[0.98]"
        >
          <FileDown className="h-6 w-6" />
          Descargar mi informe (PDF)
        </a>
        <p className="mt-3 text-[13px] text-ink-muted">
          Guárdalo: es tu documento personal de {cliente.nombre ? "" : "tu "}caso.
        </p>
      </Reveal>

      <Reveal delay={0.12} className="glass p-6">
        <h3 className="mb-4 flex items-center gap-2.5 font-display text-[17px] font-bold tracking-tight text-ink">
          <CheckCircle2 className="h-5 w-5 text-good" />
          Tu informe incluye
        </h3>
        <ul className="space-y-2.5">
          {[
            `Estado actual del caso y materia: ${informe.materia}`,
            `${informe.debilidades.length} debilidades desarrolladas con su estrategia de corrección`,
            `${informe.normas.length} normas legales y precedentes aplicables a tu caso`,
            "Plan de reforzamiento completo y beneficios esperados",
            "Recomendación final personalizada de USA Latino Prime",
          ].map((t, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-navy" />
              {t}
            </li>
          ))}
        </ul>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-navy/10 bg-white/60 px-4 py-2 text-[13px] font-semibold text-navy">
          <Landmark className="h-4 w-4 text-gold-deep" />
          Con el escrutinio de un juez de inmigración
        </div>
      </Reveal>

      <Reveal delay={0.2}>
        <ServicesCTA />
      </Reveal>

      <Reveal delay={0.26}>
        <p className="px-3 text-center text-[13px] leading-relaxed text-ink-muted">
          Este informe es una herramienta de preparación educativa; no constituye
          asesoría legal. Consulta a un abogado de inmigración o representante
          acreditado.
        </p>
      </Reveal>
    </div>
  );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      <div className="glass flex flex-col items-center p-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-bad/10 text-bad">
          <AlertTriangle className="h-7 w-7" />
        </span>
        <h2 className="mt-6 font-display text-[24px] font-bold tracking-tight text-ink">
          No pudimos completar tu informe
        </h2>
        <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">{message}</p>
        <button onClick={onRetry} className="btn-lg mt-7">
          <Loader2 className="h-5 w-5" />
          Reintentar
        </button>
      </div>
    </div>
  );
}

function primerNombre(completo: string): string {
  return completo.trim().split(/\s+/)[0] ?? completo;
}
