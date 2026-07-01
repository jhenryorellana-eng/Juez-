"use client";

import { useEffect, useRef, useState } from "react";
import { animate, AnimatePresence, motion } from "framer-motion";
import { Loader2, AlertTriangle, ScanLine } from "lucide-react";
import { useJuez } from "@/lib/store";
import { ANALYSIS_PHASES, MIN_ANALYSIS_MS } from "@/lib/cases";
import { BrandMark } from "@/components/Brand";
import type { VerdictResponse } from "@/lib/types";

export default function AnalyzingCard() {
  const { caseTypeId, answers, story, setVerdict, goTo } = useJuez();
  const [phase, setPhase] = useState(0);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setPhase(0);
    setPct(0);

    const stepMs = MIN_ANALYSIS_MS / ANALYSIS_PHASES.length;
    intervalRef.current = setInterval(() => {
      setPhase((p) => Math.min(p + 1, ANALYSIS_PHASES.length - 1));
    }, stepMs);

    const counter = animate(0, 99, {
      duration: MIN_ANALYSIS_MS / 1000,
      ease: [0.4, 0, 0.2, 1],
      onUpdate: (v) => setPct(Math.round(v)),
    });

    async function run() {
      const minDelay = new Promise((r) => setTimeout(r, MIN_ANALYSIS_MS));
      try {
        const res = await fetch("/api/verdict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseTypeId, answers, story }),
        });
        if (!res.ok) throw new Error("request_failed");
        const data = (await res.json()) as VerdictResponse;
        await minDelay;
        if (cancelled) return;
        setVerdict(data, Boolean(data.demo));
        goTo("verdict");
      } catch {
        if (!cancelled) setError(true);
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

  if (error) {
    return <ErrorView onRetry={() => setAttempt((a) => a + 1)} onBack={() => goTo("interview")} />;
  }

  const active = ANALYSIS_PHASES[phase];

  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      <div className="glass p-7 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <ThinkingEmblem />

          <span className="pill mt-7">
            <span className="flex gap-1">
              <Dot delay="0s" />
              <Dot delay="0.15s" />
              <Dot delay="0.3s" />
            </span>
            Analizando tu caso
          </span>

          <div className="mt-5 min-h-[62px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={phase}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
              >
                <h2 className="text-[23px] font-bold tracking-tight text-ink sm:text-[25px]">
                  {active.label}
                </h2>
                <p className="mt-1.5 text-[15px] text-ink-muted">{active.detail}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Progreso */}
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-[13px] font-bold">
            <span className="text-navy">Procesando</span>
            <span className="tabular-nums text-ink-muted">{pct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-navy/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-navy to-gold"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.2, ease: "linear" }}
            />
          </div>
        </div>

        {/* Escáner "leyendo tu caso" */}
        <ScanPanel story={story} />
      </div>
    </div>
  );
}

function ThinkingEmblem() {
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <span className="absolute inset-2 rounded-full bg-navy/15 animate-pulse-ring" />
      <span
        className="absolute inset-2 rounded-full bg-gold/25 animate-pulse-ring"
        style={{ animationDelay: "0.9s" }}
      />
      {/* Anillo giratorio (gradiente cónico) */}
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
      <BrandMark className="relative h-[68px] w-[68px] rounded-2xl" />
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

function ScanPanel({ story }: { story: string }) {
  const text =
    story.trim().length > 0
      ? story.trim()
      : "Leyendo tu historia y cada dato que compartiste para evaluar tu caso…";
  return (
    <div className="relative mt-6 h-[132px] overflow-hidden rounded-2xl border border-navy/10 bg-white/60 p-4">
      <p className="select-none text-[12.5px] leading-relaxed text-ink/45 [mask-image:linear-gradient(to_bottom,transparent,#000_18%,#000_82%,transparent)]">
        {text}
      </p>
      {/* Línea de escaneo */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 h-10"
        style={{
          background:
            "linear-gradient(to bottom, transparent, rgba(255,195,35,0.35), rgba(1,45,106,0.12), transparent)",
        }}
        initial={{ top: "-2.5rem" }}
        animate={{ top: "132px" }}
        transition={{ duration: 1.9, ease: "easeInOut", repeat: Infinity }}
      />
      <div className="pointer-events-none absolute bottom-2.5 right-3 flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-navy shadow-sm">
        <ScanLine className="h-3.5 w-3.5 text-gold-deep" />
        Leyendo tu caso
      </div>
    </div>
  );
}

function ErrorView({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      <div className="glass flex flex-col items-center p-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-bad/10 text-bad">
          <AlertTriangle className="h-7 w-7" />
        </span>
        <h2 className="mt-6 text-[24px] font-bold tracking-tight text-ink">
          No pudimos completar el diagnóstico
        </h2>
        <p className="mt-2 text-[16px] text-ink-soft">Hubo un problema al procesar tu caso.</p>
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
