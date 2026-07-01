"use client";

import { motion } from "framer-motion";
import { ArrowRight, MessagesSquare, Zap, Lock } from "lucide-react";
import { useJuez } from "@/lib/store";
import { BrandMark } from "@/components/Brand";

const POINTS = [
  { icon: MessagesSquare, text: "Respondes unas preguntas simples, una por una" },
  { icon: Zap, text: "Recibes tu diagnóstico al instante" },
  { icon: Lock, text: "Privado y gratis · no necesitas cuenta" },
];

export default function WelcomeCard() {
  const goTo = useJuez((s) => s.goTo);

  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="glass p-7 sm:p-9"
      >
        <div className="flex flex-col items-center text-center">
          <BrandMark className="h-16 w-16 rounded-2xl" />
          <span className="pill mt-6">Evaluación gratuita · 3 minutos</span>
          <h1 className="mt-5 text-balance text-[34px] font-bold leading-[1.08] tracking-tight text-ink sm:text-[40px]">
            Conoce las probabilidades de tu caso de inmigración
          </h1>
          <p className="mt-4 text-balance text-[18px] leading-relaxed text-ink-soft">
            Cuéntanos tu situación y recibe un diagnóstico claro de qué tan probable es que
            tu caso tenga éxito en EE. UU.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          {POINTS.map((p, i) => (
            <motion.div
              key={p.text}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + i * 0.1, duration: 0.5 }}
              className="flex items-center gap-4 rounded-2xl border border-navy/10 bg-white/70 px-5 py-4"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy/[0.06] text-navy">
                <p.icon className="h-[22px] w-[22px]" strokeWidth={2} />
              </span>
              <span className="text-[16px] font-medium leading-snug text-ink">{p.text}</span>
            </motion.div>
          ))}
        </div>

        <button onClick={() => goTo("case")} className="btn-lg mt-8">
          Comenzar
          <ArrowRight className="h-5 w-5" />
        </button>
      </motion.div>

      <p className="mx-auto mt-5 max-w-md px-2 text-center text-[13px] leading-relaxed text-ink-muted">
        Herramienta informativa. No sustituye la orientación de un profesional.
      </p>
    </div>
  );
}
