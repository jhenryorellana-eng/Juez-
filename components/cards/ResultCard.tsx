"use client";

import { motion } from "framer-motion";
import {
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Landmark,
  ListChecks,
  MessageCircleQuestion,
} from "lucide-react";
import { useJuez } from "@/lib/store";
import Reveal from "@/components/ui/Reveal";
import ScoreRing from "@/components/ui/ScoreRing";
import ServicesCTA from "@/components/ServicesCTA";
import type { MatrixItem, MatrixStatus, PrepLevel } from "@/lib/types";

const PREP: Record<PrepLevel, { label: string; color: string; bg: string }> = {
  A: { label: "Listo para presentar", color: "text-good", bg: "bg-good/10" },
  B: { label: "Necesita trabajo dirigido", color: "text-gold-deep", bg: "bg-gold/15" },
  C: { label: "Riesgo alto · busca representación", color: "text-bad", bg: "bg-bad/10" },
};

const MATRIX_STYLE: Record<MatrixStatus, { dot: string; label: string; color: string }> = {
  solido: { dot: "bg-good", label: "Sólido", color: "text-good" },
  refuerzo: { dot: "bg-gold-deep", label: "Reforzar", color: "text-gold-deep" },
  critico: { dot: "bg-bad", label: "Crítico", color: "text-bad" },
};

export default function ResultCard() {
  const { verdict, verdictDemo, reset } = useJuez();

  if (!verdict) return null;

  const prep = PREP[verdict.prepLevel];

  return (
    <div className="flex flex-1 flex-col space-y-4 py-4">
      {/* Resultado principal */}
      <Reveal className="glass relative flex flex-col items-center overflow-hidden px-6 py-9 text-center">
        {verdictDemo && <span className="pill mb-4 text-gold-deep">Modo demostración</span>}
        <span className="sys-label mb-6">Análisis completado · Solidez del expediente</span>

        <div className="relative">
          <motion.span
            aria-hidden
            className="absolute -inset-6 rounded-full opacity-[0.14] blur-[2px]"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, #012d6a 70deg, transparent 130deg)",
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 9, ease: "linear", repeat: Infinity }}
          />
          <ScoreRing value={verdict.score} level={verdict.level} />
        </div>

        {/* Nivel de Preparación */}
        <div
          className={`mt-6 inline-flex items-center gap-2.5 rounded-full px-4 py-2 ${prep.bg}`}
        >
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full bg-white font-display text-[15px] font-bold shadow-sm ${prep.color}`}
          >
            {verdict.prepLevel}
          </span>
          <span className={`text-[14px] font-bold ${prep.color}`}>{prep.label}</span>
        </div>

        <h2 className="mt-6 text-balance font-display text-[24px] font-bold leading-tight tracking-tight text-ink sm:text-[26px]">
          {verdict.headline}
        </h2>
        <p className="mt-3 text-balance text-[16px] leading-relaxed text-ink-soft">
          {verdict.summary}
        </p>
        {verdict.prepFactors.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-left">
            {verdict.prepFactors.map((f, i) => (
              <li key={i} className="flex gap-2 text-[14px] leading-snug text-ink-muted">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-navy/40" />
                {f}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-navy/10 bg-white/60 px-4 py-2 text-[13px] font-semibold text-navy">
          <Landmark className="h-4 w-4 text-gold-deep" />
          Con el escrutinio de un juez de inmigración
        </div>
      </Reveal>

      {/* Matriz de Solidez */}
      {verdict.matrix.length > 0 && (
        <Reveal delay={0.08} className="glass p-6">
          <SectionHeader
            icon={<ListChecks className="h-5 w-5 text-navy" />}
            title="Matriz de solidez"
            count={verdict.matrix.length}
          />
          <div className="space-y-2.5">
            {verdict.matrix.map((m, i) => (
              <MatrixRow key={i} item={m} />
            ))}
          </div>
        </Reveal>
      )}

      {/* Puntos clave */}
      {(verdict.strengths.length > 0 || verdict.weaknesses.length > 0) && (
        <Reveal delay={0.14} className="glass space-y-5 p-6">
          {verdict.strengths.length > 0 && (
            <div>
              <SectionHeader
                icon={<CheckCircle2 className="h-5 w-5 text-good" />}
                title="A tu favor"
                titleColor="text-good"
                count={verdict.strengths.length}
              />
              <Bullets items={verdict.strengths} dot="bg-good" />
            </div>
          )}
          {verdict.weaknesses.length > 0 && (
            <div>
              <SectionHeader
                icon={<AlertTriangle className="h-5 w-5 text-bad" />}
                title="A reforzar"
                titleColor="text-bad"
                count={verdict.weaknesses.length}
              />
              <Bullets items={verdict.weaknesses} dot="bg-bad" />
            </div>
          )}
        </Reveal>
      )}

      {/* Contrainterrogatorio simulado */}
      {verdict.crossExam.length > 0 && (
        <Reveal delay={0.2} className="glass p-6">
          <SectionHeader
            icon={<MessageCircleQuestion className="h-5 w-5 text-navy" />}
            title="Prepárate para estas preguntas"
            count={verdict.crossExam.length}
          />
          <p className="mb-4 text-[14px] leading-snug text-ink-muted">
            Es muy probable que el oficial o el abogado del gobierno te pregunte esto.
            Prepara tus respuestas — siempre con la verdad.
          </p>
          <ol className="space-y-3">
            {verdict.crossExam.map((q, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy font-mono text-[12px] font-bold text-gold">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="pt-0.5">{q}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      )}

      {/* Recomendación profesional */}
      <Reveal delay={0.26}>
        <ServicesCTA />
      </Reveal>

      <Reveal delay={0.3}>
        <p className="px-3 text-center text-[13px] leading-relaxed text-ink-muted">
          Este diagnóstico es una herramienta de preparación educativa; no constituye
          asesoría legal ni predice el resultado. Consulta a un abogado de inmigración o
          representante acreditado.
        </p>
      </Reveal>

      <Reveal delay={0.34}>
        <button onClick={reset} className="btn-ghost-lg w-full">
          <RotateCcw className="h-5 w-5" />
          Evaluar otro caso
        </button>
      </Reveal>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  titleColor = "text-ink",
  count,
}: {
  icon: React.ReactNode;
  title: string;
  titleColor?: string;
  count: number;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      {icon}
      <h3 className={`font-display text-[17px] font-bold tracking-tight ${titleColor}`}>
        {title}
      </h3>
      <span className="h-px flex-1 bg-navy/10" />
      <span className="font-mono text-[11px] font-bold text-navy/35">
        {String(count).padStart(2, "0")}
      </span>
    </div>
  );
}

function MatrixRow({ item }: { item: MatrixItem }) {
  const s = MATRIX_STYLE[item.status];
  return (
    <div className="rounded-2xl border border-navy/10 bg-white/60 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5 text-[15px] font-bold text-ink">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />
          {item.element}
        </span>
        <span className={`shrink-0 font-mono text-[11px] font-bold uppercase tracking-wide ${s.color}`}>
          {s.label}
        </span>
      </div>
      <p className="mt-1 pl-[20px] text-[13.5px] leading-snug text-ink-muted">{item.note}</p>
    </div>
  );
}

function Bullets({ items, dot }: { items: string[]; dot: string }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[16px] leading-relaxed text-ink">
          <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${dot}`} />
          {item}
        </li>
      ))}
    </ul>
  );
}
