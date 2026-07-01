"use client";

import { motion } from "framer-motion";
import { RotateCcw, CheckCircle2, AlertTriangle, Landmark } from "lucide-react";
import { useJuez } from "@/lib/store";
import Reveal from "@/components/ui/Reveal";
import ScoreRing from "@/components/ui/ScoreRing";
import ServicesCTA from "@/components/ServicesCTA";

export default function ResultCard() {
  const { verdict, verdictDemo, reset } = useJuez();

  if (!verdict) return null;

  return (
    <div className="flex flex-1 flex-col space-y-4 py-4">
      {/* Resultado principal */}
      <Reveal className="glass relative flex flex-col items-center overflow-hidden px-6 py-9 text-center">
        {verdictDemo && <span className="pill mb-4 text-gold-deep">Modo demostración</span>}
        <span className="sys-label mb-6">Análisis completado · Probabilidad de aprobación</span>

        <div className="relative">
          {/* Radar sutil girando tras el anillo */}
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

        <h2 className="mt-8 text-balance font-display text-[24px] font-bold leading-tight tracking-tight text-ink sm:text-[26px]">
          {verdict.headline}
        </h2>
        <p className="mt-3 text-balance text-[16px] leading-relaxed text-ink-soft">
          {verdict.summary}
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-navy/10 bg-white/60 px-4 py-2 text-[13px] font-semibold text-navy">
          <Landmark className="h-4 w-4 text-gold-deep" />
          Según el criterio de un juez de inmigración
        </div>
      </Reveal>

      {/* Puntos clave */}
      {(verdict.strengths.length > 0 || verdict.weaknesses.length > 0) && (
        <Reveal delay={0.1} className="glass space-y-5 p-6">
          {verdict.strengths.length > 0 && (
            <KeyGroup
              icon={<CheckCircle2 className="h-5 w-5 text-good" />}
              title="A tu favor"
              color="text-good"
              dot="bg-good"
              items={verdict.strengths}
            />
          )}
          {verdict.weaknesses.length > 0 && (
            <KeyGroup
              icon={<AlertTriangle className="h-5 w-5 text-bad" />}
              title="A reforzar"
              color="text-bad"
              dot="bg-bad"
              items={verdict.weaknesses}
            />
          )}
        </Reveal>
      )}

      {/* Recomendación profesional */}
      <Reveal delay={0.18}>
        <ServicesCTA />
      </Reveal>

      <Reveal delay={0.24}>
        <p className="px-3 text-center text-[13px] leading-relaxed text-ink-muted">
          Este diagnóstico es informativo y no sustituye la orientación de un profesional.
        </p>
      </Reveal>

      <Reveal delay={0.28}>
        <button onClick={reset} className="btn-ghost-lg w-full">
          <RotateCcw className="h-5 w-5" />
          Evaluar otro caso
        </button>
      </Reveal>
    </div>
  );
}

function KeyGroup({
  icon,
  title,
  color,
  dot,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
  dot: string;
  items: string[];
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5">
        {icon}
        <h3 className={`font-display text-[17px] font-bold tracking-tight ${color}`}>
          {title}
        </h3>
        <span className="h-px flex-1 bg-navy/10" />
        <span className="font-mono text-[11px] font-bold text-navy/35">
          {String(items.length).padStart(2, "0")}
        </span>
      </div>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3 text-[16px] leading-relaxed text-ink">
            <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${dot}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
