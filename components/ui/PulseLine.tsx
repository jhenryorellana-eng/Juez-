"use client";

import { motion } from "framer-motion";

/** Trazo de electrocardiograma: la firma visual de "Diagnóstico". */
const PULSE_PATH =
  "M0 20 H62 L74 6 L86 34 L96 20 H150 L162 11 L172 29 L182 20 H240 L250 15 L258 25 L266 20 H300";

interface Props {
  /** true = late en bucle (monitor en vivo); false = se dibuja una sola vez. */
  loop?: boolean;
  className?: string;
  /** Color del trazo (por defecto dorado Utah). */
  stroke?: string;
  delay?: number;
}

export default function PulseLine({
  loop = false,
  className = "",
  stroke = "#ffc323",
  delay = 0,
}: Props) {
  return (
    <svg
      viewBox="0 0 300 40"
      fill="none"
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      {/* Guía tenue del recorrido */}
      <path d={PULSE_PATH} stroke={stroke} strokeOpacity={0.15} strokeWidth={2} />
      <motion.path
        d={PULSE_PATH}
        stroke={stroke}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 5px ${stroke})` }}
        initial={{ pathLength: 0, opacity: 1 }}
        animate={
          loop
            ? { pathLength: [0, 1, 1], opacity: [1, 1, 0] }
            : { pathLength: 1 }
        }
        transition={
          loop
            ? { duration: 2.4, times: [0, 0.72, 1], repeat: Infinity, ease: "easeInOut", delay }
            : { duration: 1.6, ease: [0.22, 1, 0.36, 1], delay }
        }
      />
    </svg>
  );
}
