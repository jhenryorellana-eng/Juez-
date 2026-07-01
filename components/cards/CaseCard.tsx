"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  TrendingUp,
  Gavel,
  Building2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { useJuez } from "@/lib/store";
import { CASE_TYPES } from "@/lib/cases";
import type { CaseTypeId, QuestionsResponse } from "@/lib/types";

const META: Record<CaseTypeId, { icon: LucideIcon; tint: string }> = {
  "asilo-politico": { icon: ShieldCheck, tint: "bg-blue" },
  "reforzamiento-asilo": { icon: TrendingUp, tint: "bg-green" },
  "apelacion-bia": { icon: Gavel, tint: "bg-indigo" },
  "cambio-corte": { icon: Building2, tint: "bg-orange" },
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
      setError("No pudimos preparar la entrevista. Inténtalo de nuevo.");
      setLoadingId(null);
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex items-center px-4 pb-2 pt-1">
        <button
          onClick={() => goTo("welcome")}
          className="flex items-center gap-0.5 rounded-full py-1 pr-2 text-[17px] text-blue active:opacity-60"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-6 pb-8">
        <h2 className="mt-2 text-[30px] font-bold leading-tight tracking-tight">
          ¿Qué tipo de caso tienes?
        </h2>
        <p className="mt-2 text-[16px] text-label-secondary">
          El Juez adaptará las preguntas a tu situación.
        </p>

        <div className="mt-7 overflow-hidden rounded-ios2 bg-sys-card shadow-card">
          {CASE_TYPES.map((c, i) => {
            const { icon: Icon, tint } = META[c.id];
            const isLoading = loadingId === c.id;
            return (
              <motion.button
                key={c.id}
                onClick={() => choose(c.id)}
                disabled={Boolean(loadingId)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
                whileTap={{ scale: 0.985 }}
                className={`flex w-full items-center gap-4 px-4 py-4 text-left active:bg-sys-bg disabled:opacity-60 ${
                  i > 0 ? "border-t border-sys-sep" : ""
                }`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.9rem] text-white ${tint}`}
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Icon className="h-5 w-5" strokeWidth={2.2} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold leading-tight">
                    {c.name}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-label-secondary">
                    {isLoading ? "Preparando entrevista…" : c.description}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-label-tertiary" />
              </motion.button>
            );
          })}
        </div>

        {error && (
          <p className="mt-5 text-center text-[15px] text-red">{error}</p>
        )}
      </div>
    </div>
  );
}
