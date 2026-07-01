"use client";

import { useEffect, useRef, type ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useJuez, STEP_ORDER, type Step } from "@/lib/store";
import Background from "@/components/Background";
import Header from "@/components/Header";
import WelcomeCard from "@/components/cards/WelcomeCard";
import UploadCard from "@/components/cards/UploadCard";
import AnalyzingCard from "@/components/cards/AnalyzingCard";
import ResultCard from "@/components/cards/ResultCard";

const COMPONENTS: Record<Step, ComponentType> = {
  welcome: WelcomeCard,
  upload: UploadCard,
  analyzing: AnalyzingCard,
  verdict: ResultCard,
};

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -48 : 48, opacity: 0 }),
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
    <div className="relative flex min-h-[100dvh] flex-col">
      <Background />
      <Header />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-8 sm:px-6">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 320, damping: 34 },
              opacity: { duration: 0.2 },
            }}
            className="flex flex-1 flex-col"
          >
            <Current />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
