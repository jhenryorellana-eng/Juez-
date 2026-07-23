"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { animate } from "framer-motion";
import { FileDown, AlertTriangle, Loader2, CheckCircle2, Landmark } from "lucide-react";
import Background from "@/components/Background";
import Header from "@/components/Header";
import ScoreRing from "@/components/ui/ScoreRing";
import Reveal from "@/components/ui/Reveal";
import ServicesCTA from "@/components/ServicesCTA";
import AnalyzingPanel from "@/components/AnalyzingPanel";
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
          <AnalyzingPanel
            fases={FASES}
            fase={fase}
            pct={pct}
            fileNames={meta.current.fileNames}
          />
        ) : (
          <Listo result={result} />
        )}
      </main>
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
            "Análisis dedicado de tu miedo creíble (credible fear)",
            "Casos ganados y panorama de solicitantes de tu país (con fuentes oficiales)",
            `${informe.debilidades.length} debilidades desarrolladas con su estrategia de corrección`,
            "Guía de detalles: cómo relatar tu historia como la busca un juez",
            `${informe.normas.length} normas legales y precedentes aplicables a tu caso`,
            "Plan de reforzamiento completo y recomendación final de USA Latino Prime",
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
