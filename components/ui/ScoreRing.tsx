"use client";

import { motion } from "framer-motion";
import AnimatedNumber from "./AnimatedNumber";
import type { VerdictLevel } from "@/lib/types";

const LEVEL_COLOR: Record<VerdictLevel, string> = {
  alto: "#1c9253",
  moderado: "#e0a800",
  bajo: "#e51837",
};

const LEVEL_LABEL: Record<VerdictLevel, string> = {
  alto: "Alta",
  moderado: "Media",
  bajo: "Baja",
};

interface Props {
  value: number;
  level: VerdictLevel;
}

export default function ScoreRing({ value, level }: Props) {
  const size = 216;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  const color = LEVEL_COLOR[level];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(1,45,106,0.10)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.7, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex items-start text-[68px] font-bold leading-none tracking-tight text-ink">
          <AnimatedNumber value={value} delay={0.25} />
          <span className="mt-2.5 text-3xl text-ink-muted">%</span>
        </div>
        <div
          className="mt-1.5 rounded-full px-3 py-0.5 text-[13px] font-bold uppercase tracking-[0.1em]"
          style={{ color, backgroundColor: `${color}1a` }}
        >
          {LEVEL_LABEL[level]}
        </div>
      </div>
    </div>
  );
}
