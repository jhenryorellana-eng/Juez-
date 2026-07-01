"use client";

import { useEffect, useRef, type ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useJuez, STEP_ORDER, type Step } from "@/lib/store";
import PhoneShell from "@/components/PhoneShell";
import WelcomeCard from "@/components/cards/WelcomeCard";
import CaseCard from "@/components/cards/CaseCard";
import InterviewDeck from "@/components/cards/InterviewDeck";
import AnalyzingCard from "@/components/cards/AnalyzingCard";
import VerdictCard from "@/components/cards/VerdictCard";

const COMPONENTS: Record<Step, ComponentType> = {
  welcome: WelcomeCard,
  case: CaseCard,
  interview: InterviewDeck,
  analyzing: AnalyzingCard,
  verdict: VerdictCard,
};

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 70 : -70, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -70 : 70, opacity: 0 }),
};

export default function Page() {
  const step = useJuez((s) => s.step);
  const prev = useRef<Step>(step);
  const dir =
    STEP_ORDER.indexOf(step) >= STEP_ORDER.indexOf(prev.current) ? 1 : -1;

  useEffect(() => {
    prev.current = step;
  }, [step]);

  const Current = COMPONENTS[step];

  return (
    <PhoneShell>
      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div
          key={step}
          custom={dir}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "spring", stiffness: 340, damping: 34 },
            opacity: { duration: 0.18 },
          }}
          className="absolute inset-0"
        >
          <Current />
        </motion.div>
      </AnimatePresence>
    </PhoneShell>
  );
}
