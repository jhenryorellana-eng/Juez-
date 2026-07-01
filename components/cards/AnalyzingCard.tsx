"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import { useJuez } from "@/lib/store";
import { ANALYSIS_PHASES, MIN_ANALYSIS_MS } from "@/lib/cases";
import { BrandMark } from "@/components/Brand";
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
    return <ErrorView onRetry={() => setAttempt((a) => a + 1)} onBack={() => goTo("interview")} />;
  }

  const active = ANALYSIS_PHASES[phase];

  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      <div className="glass p-7 sm:p-9">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-7 flex h-24 w-24 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-navy/20 animate-pulse-ring" />
            <span
              className="absolute inset-0 rounded-full bg-gold/25 animate-pulse-ring"
              style={{ animationDelay: "0.8s" }}
            />
            <BrandMark className="h-[76px] w-[76px] rounded-2xl" />
          </div>

          <span className="pill mb-5">
            <Loader2 className="h-4 w-4 animate-spin text-gold-deep" />
            Analizando tu caso
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
                <h2 className="text-[24px] font-bold tracking-tight text-ink">{active.label}</h2>
                <p className="mt-1.5 text-[16px] text-ink-muted">{active.detail}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-8 space-y-2.5">
          {ANALYSIS_PHASES.map((p, i) => {
            const state = i < phase ? "done" : i === phase ? "active" : "todo";
            return (
              <div
                key={p.label}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-[16px] transition-colors duration-500 ${
                  state === "todo" ? "text-ink-faint" : "bg-white/70 text-ink"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    state === "done"
                      ? "bg-good text-white"
                      : state === "active"
                        ? "bg-gold/25 text-gold-deep"
                        : "bg-navy/10 text-ink-faint"
                  }`}
                >
                  {state === "done" ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : state === "active" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span className="font-medium">{p.label}</span>
              </div>
            );
          })}
        </div>
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
