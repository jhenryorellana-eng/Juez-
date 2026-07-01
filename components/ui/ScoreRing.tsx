"use client";

import { motion } from "framer-motion";
import AnimatedNumber from "./AnimatedNumber";
import type { VerdictLevel } from "@/lib/types";

const LEVEL_COLOR: Record<VerdictLevel, string> = {
  alto: "#34c759",
  moderado: "#ff9500",
  bajo: "#ff3b30",
};

const LEVEL_LABEL: Record<VerdictLevel, string> = {
  alto: "Probabilidad alta",
  moderado: "Probabilidad moderada",
  bajo: "Probabilidad baja",
};

interface Props {
  value: number;
  level: VerdictLevel;
}

export default function ScoreRing({ value, level }: Props) {
  const size = 208;
  const stroke = 14;
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
          stroke="rgba(10,10,11,0.07)"
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
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex items-start text-[64px] font-bold leading-none tracking-tight text-label">
          <AnimatedNumber value={value} delay={0.25} />
          <span className="mt-2 text-2xl text-label-tertiary">%</span>
        </div>
        <div
          className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color }}
        >
          {LEVEL_LABEL[level]}
        </div>
      </div>
    </div>
  );
}
