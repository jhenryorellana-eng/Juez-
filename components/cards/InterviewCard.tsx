"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ArrowLeft, HelpCircle, PenLine } from "lucide-react";
import { useJuez } from "@/lib/store";
import { getCaseType } from "@/lib/cases";
import StepBar from "@/components/StepBar";

const MIN_STORY = 20;

const variants = {
  enter: (d: number) => ({ x: d > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d > 0 ? -40 : 40, opacity: 0 }),
};

export default function InterviewCard() {
  const { caseTypeId, questions, answers, story, setAnswer, setStory, goTo } = useJuez();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);

  const caseType = caseTypeId ? getCaseType(caseTypeId) : undefined;
  const total = questions.length + 1; // +1 = relato
  const onStory = index >= questions.length;
  const current = questions[index];
  const value = current ? answers[current.label] ?? "" : "";
  const canAdvance = onStory
    ? story.trim().length >= MIN_STORY
    : value.trim().length > 0;

  function next() {
    if (!canAdvance) return;
    if (onStory) return goTo("analyzing");
    setDir(1);
    setIndex((i) => i + 1);
  }

  function back() {
    if (index === 0) return goTo("case");
    setDir(-1);
    setIndex((i) => i - 1);
  }

  return (
    <div className="flex flex-1 flex-col py-4">
      <StepBar current={index + 1} total={total} label={caseType?.shortName} />

      <div className="relative mt-6 flex-1">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={onStory ? "story" : current?.id ?? index}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ x: { type: "spring", stiffness: 340, damping: 34 }, opacity: { duration: 0.18 } }}
            className="glass p-6 sm:p-7"
          >
            {onStory ? (
              <StoryBody value={story} onChange={setStory} />
            ) : (
              <QuestionBody
                label={current.label}
                placeholder={current.placeholder}
                helper={current.helper}
                multiline={current.multiline}
                value={value}
                onChange={(v) => setAnswer(current.label, v)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-6 flex gap-3">
        <button onClick={back} className="btn-ghost-lg shrink-0 px-5">
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden sm:inline">Atrás</span>
        </button>
        <button onClick={next} disabled={!canAdvance} className="btn-lg flex-1">
          {onStory ? "Ver mi diagnóstico" : "Siguiente"}
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

interface QuestionBodyProps {
  label: string;
  placeholder: string;
  helper?: string;
  multiline?: boolean;
  value: string;
  onChange: (v: string) => void;
}

function QuestionBody({ label, placeholder, helper, multiline, value, onChange }: QuestionBodyProps) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-navy">
        <HelpCircle className="h-5 w-5 text-gold-deep" />
        <span className="text-[13px] font-bold uppercase tracking-[0.12em]">Pregunta</span>
      </div>
      <p className="text-[24px] font-bold leading-[1.2] tracking-tight text-ink sm:text-[26px]">
        {label}
      </p>
      {helper && <p className="mt-3 text-[15px] leading-snug text-ink-muted">{helper}</p>}
      <div className="mt-5">
        {multiline ? (
          <textarea
            rows={5}
            className="field-lg resize-none"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            className="field-lg"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}

function StoryBody({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const left = MIN_STORY - value.trim().length;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-navy">
        <PenLine className="h-5 w-5 text-gold-deep" />
        <span className="text-[13px] font-bold uppercase tracking-[0.12em]">Tu historia</span>
      </div>
      <p className="text-[24px] font-bold leading-[1.2] tracking-tight text-ink sm:text-[26px]">
        Cuéntanos tu historia con tus propias palabras
      </p>
      <p className="mt-3 text-[15px] leading-snug text-ink-muted">
        Mientras más detalles concretos (fechas, lugares, hechos), mejor el diagnóstico.
      </p>
      <div className="mt-5">
        <textarea
          rows={7}
          className="field-lg resize-none"
          placeholder="Empieza por lo que te obligó a migrar y todo lo que creas importante…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="mt-2 text-right text-[13px] font-medium text-ink-muted">
          {left > 0 ? `Escribe ${left} caracteres más` : `${value.trim().length} caracteres`}
        </p>
      </div>
    </div>
  );
}
