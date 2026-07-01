"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  TrendingUp,
  FileCheck2,
  Building2,
  ChevronRight,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { useJuez } from "@/lib/store";
import { CASE_TYPES } from "@/lib/cases";
import type { CaseTypeId, QuestionsResponse } from "@/lib/types";

const META: Record<CaseTypeId, { icon: LucideIcon; tile: string }> = {
  "asilo-politico": { icon: ShieldCheck, tile: "bg-navy text-white" },
  "reforzamiento-asilo": { icon: TrendingUp, tile: "bg-good text-white" },
  "apelacion-bia": { icon: FileCheck2, tile: "bg-gold text-navy" },
  "cambio-corte": { icon: Building2, tile: "bg-navy-soft text-white" },
};

export default function CaseCard() {
  const { selectCase, setQuestions, goTo } = useJuez();
  const [loadingId, setLoadingId] = useState<CaseTypeId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(id: CaseTypeId) {
    if (loadingId) return;
    setError(null);
    setLoadingId(id);
    selectCase(id);
    try {
      const res = await fetch("/api/interview/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseTypeId: id }),
      });
      if (!res.ok) throw new Error("request_failed");
      const data = (await res.json()) as QuestionsResponse;
      setQuestions(data.questions, Boolean(data.demo));
      goTo("interview");
    } catch {
      setError("No pudimos preparar las preguntas. Inténtalo de nuevo.");
      setLoadingId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col py-4">
      <header className="mb-6">
        <h2 className="text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
          ¿Qué describe mejor tu situación?
        </h2>
        <p className="mt-2 text-[17px] text-ink-soft">
          Toca la opción que corresponde a tu caso.
        </p>
      </header>

      <div className="space-y-3.5">
        {CASE_TYPES.map((c, i) => {
          const { icon: Icon, tile } = META[c.id];
          const isLoading = loadingId === c.id;
          return (
            <motion.button
              key={c.id}
              onClick={() => choose(c.id)}
              disabled={Boolean(loadingId)}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.45 }}
              whileTap={{ scale: 0.985 }}
              className="glass flex w-full items-center gap-4 p-5 text-left transition-shadow hover:shadow-lift disabled:opacity-60"
            >
              <span
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${tile}`}
              >
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Icon className="h-7 w-7" strokeWidth={2} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[19px] font-bold leading-tight text-ink">
                  {c.name}
                </span>
                <span className="mt-1 block text-[14px] leading-snug text-ink-muted">
                  {isLoading ? "Preparando tus preguntas…" : c.description}
                </span>
              </span>
              <ChevronRight className="h-6 w-6 shrink-0 text-navy/40" />
            </motion.button>
          );
        })}
      </div>

      {error && (
        <p className="mt-5 rounded-2xl bg-bad/10 px-4 py-3 text-center text-[15px] font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
