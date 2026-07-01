"use client";

import { useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { ChevronLeft, ArrowRight, Sparkles, PenLine } from "lucide-react";
import { useJuez } from "@/lib/store";
import StoriesProgress from "@/components/StoriesProgress";

const MIN_STORY = 20;
const SWIPE_THRESHOLD = 6000; // offset * velocity

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 320 : -320, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -320 : 320, opacity: 0 }),
};

export default function InterviewDeck() {
  const { questions, answers, story, setAnswer, setStory, goTo } = useJuez();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);

  const total = questions.length + 1; // +1 = relato
  const onStory = index >= questions.length;
  const current = questions[index];
  const value = current ? answers[current.label] ?? "" : "";
  const canAdvance = onStory
    ? story.trim().length >= MIN_STORY
    : value.trim().length > 0;

  function paginate(next: number) {
    if (next > 0) {
      if (!canAdvance) return;
      if (onStory) return goTo("analyzing");
      setDir(1);
      setIndex((i) => i + 1);
    } else {
      if (index === 0) return goTo("case");
      setDir(-1);
      setIndex((i) => i - 1);
    }
  }

  function onDragEnd(_e: unknown, info: PanInfo) {
    const swipe = info.offset.x * info.velocity.x;
    if (info.offset.x < -60 && swipe < -SWIPE_THRESHOLD) paginate(1);
    else if (info.offset.x > 60 && swipe > SWIPE_THRESHOLD) paginate(-1);
  }

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex items-center gap-3 px-5 pb-3 pt-1">
        <button
          onClick={() => paginate(-1)}
          className="text-blue active:opacity-60"
          aria-label="Atrás"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="flex-1">
          <StoriesProgress total={total} current={index} />
        </div>
        <span className="w-9 text-right text-[13px] font-medium tabular-nums text-label-tertiary">
          {Math.min(index + 1, total)}/{total}
        </span>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={onStory ? "story" : current?.id ?? index}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ x: { type: "spring", stiffness: 320, damping: 32 }, opacity: { duration: 0.2 } }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={onDragEnd}
            className="absolute inset-0 flex flex-col px-7 pt-3"
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

      <div className="px-7 pb-9 pt-2">
        <button
          onClick={() => paginate(1)}
          disabled={!canAdvance}
          className={onStory ? "ios-btn-dark" : "ios-btn"}
        >
          {onStory ? "Enviar al Juez" : "Continuar"}
          <ArrowRight className="h-5 w-5" />
        </button>
        <p className="mt-3 text-center text-[12px] text-label-tertiary">
          o desliza para avanzar
        </p>
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
    <div className="flex flex-1 flex-col">
      <div className="mb-3 flex items-center gap-1.5 text-blue">
        <Sparkles className="h-4 w-4" />
        <span className="text-[12px] font-semibold uppercase tracking-[0.12em]">
          El Juez pregunta
        </span>
      </div>
      <p className="text-[26px] font-bold leading-[1.18] tracking-tight">{label}</p>
      {helper && (
        <p className="mt-3 text-[14px] leading-snug text-label-secondary">{helper}</p>
      )}
      <div className="mt-6">
        {multiline ? (
          <textarea
            rows={5}
            className="ios-field resize-none"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            className="ios-field"
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
    <div className="flex flex-1 flex-col">
      <div className="mb-3 flex items-center gap-1.5 text-blue">
        <PenLine className="h-4 w-4" />
        <span className="text-[12px] font-semibold uppercase tracking-[0.12em]">
          Tu relato
        </span>
      </div>
      <p className="text-[26px] font-bold leading-[1.18] tracking-tight">
        Cuéntale tu historia con tus palabras
      </p>
      <p className="mt-3 text-[14px] leading-snug text-label-secondary">
        Mientras más detalles concretos (fechas, lugares, hechos), mejor la evaluación.
      </p>
      <div className="mt-6">
        <textarea
          rows={7}
          className="ios-field resize-none"
          placeholder="Empieza por lo que te obligó a migrar y todo lo relevante para tu caso…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="mt-2 text-right text-[12px] text-label-tertiary">
          {left > 0 ? `${left} caracteres más` : `${value.trim().length} caracteres`}
        </p>
      </div>
    </div>
  );
}
