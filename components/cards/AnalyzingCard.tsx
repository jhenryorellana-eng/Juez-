"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Scale, Check, Loader2, AlertTriangle } from "lucide-react";
import { useJuez } from "@/lib/store";
import { ANALYSIS_PHASES, MIN_ANALYSIS_MS } from "@/lib/cases";
import type { VerdictResponse } from "@/lib/types";

export default function AnalyzingCard() {
  const { caseTypeId, answers, story, setVerdict, goTo } = useJuez();
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setPhase(0);

    const stepMs = MIN_ANALYSIS_MS / ANALYSIS_PHASES.length;
    intervalRef.current = setInterval(() => {
      setPhase((p) => Math.min(p + 1, ANALYSIS_PHASES.length - 1));
    }, stepMs);

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
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (error) {
    return (
      <ErrorView onRetry={() => setAttempt((a) => a + 1)} onBack={() => goTo("interview")} />
    );
  }

  const active = ANALYSIS_PHASES[phase];

  return (
    <div className="absolute inset-0 flex flex-col items-center px-7 pt-12 text-center">
      <div className="relative mb-9 flex h-24 w-24 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-blue/20 animate-pulse-ring" />
        <span
          className="absolute inset-0 rounded-full bg-blue/15 animate-pulse-ring"
          style={{ animationDelay: "0.7s" }}
        />
        <span className="relative flex h-[72px] w-[72px] items-center justify-center rounded-[1.5rem] bg-label text-white shadow-card">
          <Scale className="h-8 w-8" strokeWidth={1.8} />
        </span>
      </div>

      <span className="ios-chip mb-5">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue" />
        El Juez está deliberando
      </span>

      <div className="min-h-[64px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
          >
            <h2 className="text-[24px] font-bold tracking-tight">{active.label}</h2>
            <p className="mt-1.5 text-[15px] text-label-secondary">{active.detail}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-9 w-full space-y-2">
        {ANALYSIS_PHASES.map((p, i) => {
          const state = i < phase ? "done" : i === phase ? "active" : "todo";
          return (
            <div
              key={p.label}
              className={`flex items-center gap-3 rounded-ios px-4 py-2.5 text-left text-[15px] transition-colors duration-500 ${
                state === "todo" ? "text-label-tertiary" : "bg-sys-bg text-label"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  state === "done"
                    ? "bg-green text-white"
                    : state === "active"
                      ? "bg-blue/15 text-blue"
                      : "bg-black/[0.06] text-label-tertiary"
                }`}
              >
                {state === "done" ? (
                  <Check className="h-3 w-3" strokeWidth={3} />
                ) : state === "active" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              {p.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ErrorView({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red/10 text-red">
        <AlertTriangle className="h-7 w-7" />
      </span>
      <h2 className="mt-6 text-[24px] font-bold tracking-tight">
        No se pudo emitir el veredicto
      </h2>
      <p className="mt-2 text-[15px] text-label-secondary">
        Hubo un problema al procesar tu caso.
      </p>
      <div className="mt-8 w-full space-y-3">
        <button onClick={onRetry} className="ios-btn">
          Reintentar
        </button>
        <button onClick={onBack} className="ios-btn-dark bg-sys-bg !text-label">
          Volver a la entrevista
        </button>
      </div>
    </div>
  );
}
