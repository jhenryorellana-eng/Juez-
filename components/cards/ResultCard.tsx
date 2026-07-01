"use client";

import { RotateCcw, CheckCircle2, AlertTriangle, Lightbulb, ListChecks } from "lucide-react";
import { useJuez } from "@/lib/store";
import { getCaseType } from "@/lib/cases";
import Reveal from "@/components/ui/Reveal";
import ScoreRing from "@/components/ui/ScoreRing";
import type { FactorImpact, VerdictFactor } from "@/lib/types";

const IMPACT: Record<FactorImpact, { dot: string; label: string; color: string }> = {
  positivo: { dot: "bg-good", label: "A favor", color: "text-good" },
  negativo: { dot: "bg-bad", label: "En contra", color: "text-bad" },
  neutral: { dot: "bg-ink-faint", label: "Neutral", color: "text-ink-muted" },
};

export default function ResultCard() {
  const { verdict, verdictDemo, caseTypeId, reset } = useJuez();
  const caseType = caseTypeId ? getCaseType(caseTypeId) : undefined;

  if (!verdict) return null;

  return (
    <div className="flex flex-1 flex-col space-y-4 py-4">
      {/* Encabezado con el resultado */}
      <Reveal className="glass flex flex-col items-center px-6 py-9 text-center">
        {verdictDemo && (
          <span className="pill mb-4 text-gold-deep">Modo demostración</span>
        )}
        <span className="mb-6 text-[13px] font-bold uppercase tracking-[0.14em] text-ink-muted">
          Tu diagnóstico · {caseType?.shortName ?? "Caso"}
        </span>
        <ScoreRing value={verdict.score} level={verdict.level} />
        <h2 className="mt-8 text-balance text-[24px] font-bold leading-tight tracking-tight text-ink sm:text-[26px]">
          {verdict.headline}
        </h2>
        <p className="mt-3 text-balance text-[16px] leading-relaxed text-ink-soft">
          {verdict.summary}
        </p>
      </Reveal>

      {verdict.factors.length > 0 && (
        <Reveal delay={0.08}>
          <Section icon={<ListChecks className="h-5 w-5 text-navy" />} title="Lo que más pesa">
            <div className="space-y-3">
              {verdict.factors.map((f, i) => (
                <FactorRow key={i} factor={f} />
              ))}
            </div>
          </Section>
        </Reveal>
      )}

      <Reveal delay={0.12}>
        <Section icon={<CheckCircle2 className="h-5 w-5 text-good" />} title="A tu favor" titleColor="text-good">
          <Bullets items={verdict.strengths} dot="bg-good" />
        </Section>
      </Reveal>

      <Reveal delay={0.16}>
        <Section icon={<AlertTriangle className="h-5 w-5 text-bad" />} title="Puntos débiles" titleColor="text-bad">
          <Bullets items={verdict.weaknesses} dot="bg-bad" />
        </Section>
      </Reveal>

      {verdict.recommendations.length > 0 && (
        <Reveal delay={0.2}>
          <Section icon={<Lightbulb className="h-5 w-5 text-gold-deep" />} title="Qué puedes hacer">
            <Bullets items={verdict.recommendations} dot="bg-navy" />
          </Section>
        </Reveal>
      )}

      {verdict.nextSteps.length > 0 && (
        <Reveal delay={0.24}>
          <Section icon={<ListChecks className="h-5 w-5 text-navy" />} title="Próximos pasos">
            <ol className="space-y-3.5">
              {verdict.nextSteps.map((s, i) => (
                <li key={i} className="flex gap-3.5 text-[16px] leading-relaxed text-ink">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-[13px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
          </Section>
        </Reveal>
      )}

      <Reveal delay={0.28}>
        <p className="px-3 text-center text-[13px] leading-relaxed text-ink-muted">
          Este diagnóstico es informativo y no sustituye la orientación de un profesional.
        </p>
      </Reveal>

      <Reveal delay={0.32}>
        <button onClick={reset} className="btn-lg">
          <RotateCcw className="h-5 w-5" />
          Hacer otro diagnóstico
        </button>
      </Reveal>
    </div>
  );
}

function Section({
  icon,
  title,
  titleColor = "text-navy",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  titleColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass p-6">
      <h3 className={`mb-4 flex items-center gap-2.5 text-[17px] font-bold tracking-tight ${titleColor}`}>
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function Bullets({ items, dot }: { items: string[]; dot: string }) {
  if (items.length === 0) {
    return <p className="text-[15px] text-ink-faint">Sin elementos destacados.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[16px] leading-relaxed text-ink">
          <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${dot}`} />
          {item}
        </li>
      ))}
    </ul>
  );
}

function FactorRow({ factor }: { factor: VerdictFactor }) {
  const s = IMPACT[factor.impact] ?? IMPACT.neutral;
  return (
    <div className="rounded-2xl border border-navy/10 bg-white/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5 text-[16px] font-bold text-ink">
          <span className={`h-3 w-3 shrink-0 rounded-full ${s.dot}`} />
          {factor.factor}
        </span>
        <span className={`shrink-0 text-[13px] font-bold ${s.color}`}>{s.label}</span>
      </div>
      <p className="mt-1.5 pl-[22px] text-[14px] leading-snug text-ink-muted">{factor.detail}</p>
    </div>
  );
}
