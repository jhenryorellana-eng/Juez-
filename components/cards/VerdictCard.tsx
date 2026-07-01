"use client";

import { RotateCcw, CheckCircle2, AlertCircle, Lightbulb, ListChecks } from "lucide-react";
import { useJuez } from "@/lib/store";
import { getCaseType } from "@/lib/cases";
import Reveal from "@/components/ui/Reveal";
import ScoreRing from "@/components/ui/ScoreRing";
import type { FactorImpact, VerdictFactor } from "@/lib/types";

const IMPACT: Record<FactorImpact, { dot: string; label: string; color: string }> = {
  positivo: { dot: "bg-green", label: "A favor", color: "text-green" },
  negativo: { dot: "bg-red", label: "En contra", color: "text-red" },
  neutral: { dot: "bg-label-tertiary", label: "Neutral", color: "text-label-tertiary" },
};

export default function VerdictCard() {
  const { verdict, verdictDemo, caseTypeId, reset } = useJuez();
  const caseType = caseTypeId ? getCaseType(caseTypeId) : undefined;

  if (!verdict) return null;

  return (
    <div className="absolute inset-0 flex flex-col bg-sys-bg">
      <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-3">
        {/* Hero del score */}
        <Reveal className="flex flex-col items-center rounded-ios2 bg-sys-card px-5 py-8 text-center shadow-card">
          {verdictDemo && (
            <span className="ios-chip mb-4 text-orange">Modo demo</span>
          )}
          <span className="mb-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-label-tertiary">
            Veredicto · {caseType?.shortName ?? "Caso"}
          </span>
          <ScoreRing value={verdict.score} level={verdict.level} />
          <h2 className="mt-7 text-balance text-[22px] font-bold leading-tight tracking-tight">
            {verdict.headline}
          </h2>
          <p className="mt-3 text-balance text-[15px] leading-relaxed text-label-secondary">
            {verdict.summary}
          </p>
        </Reveal>

        {verdict.factors.length > 0 && (
          <Reveal delay={0.08}>
            <Section icon={<ListChecks className="h-4 w-4" />} title="Factores clave">
              <div className="space-y-3">
                {verdict.factors.map((f, i) => (
                  <FactorRow key={i} factor={f} />
                ))}
              </div>
            </Section>
          </Reveal>
        )}

        <Reveal delay={0.12}>
          <Section
            icon={<CheckCircle2 className="h-4 w-4 text-green" />}
            title="Fortalezas"
            titleColor="text-green"
          >
            <Bullets items={verdict.strengths} dot="bg-green" />
          </Section>
        </Reveal>

        <Reveal delay={0.16}>
          <Section
            icon={<AlertCircle className="h-4 w-4 text-red" />}
            title="Riesgos y debilidades"
            titleColor="text-red"
          >
            <Bullets items={verdict.weaknesses} dot="bg-red" />
          </Section>
        </Reveal>

        {verdict.recommendations.length > 0 && (
          <Reveal delay={0.2}>
            <Section icon={<Lightbulb className="h-4 w-4 text-blue" />} title="Recomendaciones">
              <Bullets items={verdict.recommendations} dot="bg-blue" />
            </Section>
          </Reveal>
        )}

        {verdict.nextSteps.length > 0 && (
          <Reveal delay={0.24}>
            <Section icon={<ListChecks className="h-4 w-4" />} title="Próximos pasos">
              <ol className="space-y-3">
                {verdict.nextSteps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-label">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-label text-[12px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
            </Section>
          </Reveal>
        )}

        <p className="px-3 pt-1 text-center text-[12px] leading-relaxed text-label-tertiary">
          Herramienta educativa con IA. No es asesoría legal. Consulta a un abogado de
          inmigración licenciado.
        </p>
      </div>

      <div className="border-t border-sys-sep bg-sys-card/80 px-6 pb-9 pt-3 backdrop-blur-xl">
        <button onClick={reset} className="ios-btn-dark">
          <RotateCcw className="h-5 w-5" />
          Nueva evaluación
        </button>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  titleColor = "text-label-secondary",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  titleColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-ios2 bg-sys-card p-5 shadow-card">
      <h3
        className={`mb-4 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] ${titleColor}`}
      >
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function Bullets({ items, dot }: { items: string[]; dot: string }) {
  if (items.length === 0) {
    return <p className="text-[14px] text-label-tertiary">Sin elementos destacados.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-label">
          <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          {item}
        </li>
      ))}
    </ul>
  );
}

function FactorRow({ factor }: { factor: VerdictFactor }) {
  const s = IMPACT[factor.impact] ?? IMPACT.neutral;
  return (
    <div className="rounded-ios bg-sys-bg p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[15px] font-semibold text-label">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />
          {factor.factor}
        </span>
        <span className={`shrink-0 text-[12px] font-semibold ${s.color}`}>{s.label}</span>
      </div>
      <p className="mt-1.5 pl-[18px] text-[13px] leading-snug text-label-secondary">
        {factor.detail}
      </p>
    </div>
  );
}
