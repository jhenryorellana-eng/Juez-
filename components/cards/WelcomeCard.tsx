"use client";

import { motion } from "framer-motion";
import { Scale, ArrowRight, Sparkles, ShieldCheck, MessageSquareText } from "lucide-react";
import { useJuez } from "@/lib/store";

const POINTS = [
  { icon: MessageSquareText, text: "Responde unas preguntas, una a una" },
  { icon: Sparkles, text: "La IA evalúa tu caso al instante" },
  { icon: ShieldCheck, text: "Sin cuentas · tu historia no se guarda" },
];

export default function WelcomeCard() {
  const goTo = useJuez((s) => s.goTo);

  return (
    <div className="absolute inset-0 flex flex-col px-7 pb-9 pt-2">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
          className="mb-7 flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-label text-white shadow-card"
        >
          <Scale className="h-9 w-9" strokeWidth={1.9} />
        </motion.div>

        <motion.h1
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.08, duration: 0.5 }}
          className="text-[40px] font-bold leading-[1.05] tracking-tight"
        >
          El Juez
        </motion.h1>
        <motion.p
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.16, duration: 0.5 }}
          className="mt-3 text-balance text-[17px] leading-relaxed text-label-secondary"
        >
          Cuenta tu caso de inmigración y descubre su probabilidad de éxito ante una
          corte de EE. UU.
        </motion.p>

        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.26, duration: 0.5 }}
          className="mt-9 w-full space-y-2.5"
        >
          {POINTS.map((p) => (
            <div
              key={p.text}
              className="flex items-center gap-3 rounded-ios bg-sys-bg px-4 py-3 text-left"
            >
              <p.icon className="h-5 w-5 shrink-0 text-blue" strokeWidth={2} />
              <span className="text-[15px] font-medium text-label">{p.text}</span>
            </div>
          ))}
        </motion.div>
      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.36, duration: 0.5 }}
        className="space-y-4"
      >
        <p className="px-2 text-center text-[12px] leading-relaxed text-label-tertiary">
          Herramienta educativa con IA. No es asesoría legal.
        </p>
        <button onClick={() => goTo("case")} className="ios-btn-dark">
          Comenzar
          <ArrowRight className="h-5 w-5" />
        </button>
      </motion.div>
    </div>
  );
}
