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

const TICKS = 48;

export default function ScoreRing({ value, level }: Props) {
  const size = 224;
  const stroke = 14;
  const radius = (size - stroke) / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  const color = LEVEL_COLOR[level];

  // Posición del punto luminoso al final del arco
  const endAngle = ((value / 100) * 360 - 90) * (Math.PI / 180);
  const dotX = size / 2 + radius * Math.cos(endAngle);
  const dotY = size / 2 + radius * Math.sin(endAngle);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        {/* Marcas de calibre alrededor */}
        {Array.from({ length: TICKS }).map((_, i) => {
          const a = (i / TICKS) * 2 * Math.PI - Math.PI / 2;
          const r1 = radius + 12;
          const r2 = radius + (i % 4 === 0 ? 19 : 16);
          return (
            <line
              key={i}
              x1={size / 2 + r1 * Math.cos(a)}
              y1={size / 2 + r1 * Math.sin(a)}
              x2={size / 2 + r2 * Math.cos(a)}
              y2={size / 2 + r2 * Math.sin(a)}
              stroke={i / TICKS <= value / 100 ? color : "rgba(1,45,106,0.15)"}
              strokeWidth={i % 4 === 0 ? 2 : 1}
              strokeLinecap="round"
            />
          );
        })}
        <g className="-rotate-90 origin-center">
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
        </g>
        {/* Punto luminoso al final del arco */}
        <motion.circle
          cx={dotX}
          cy={dotY}
          r={5}
          fill="#ffffff"
          stroke={color}
          strokeWidth={3}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.95, type: "spring", stiffness: 300, damping: 16 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex items-start font-display text-[64px] font-bold leading-none tracking-tight text-ink">
          <AnimatedNumber value={value} delay={0.25} />
          <span className="mt-2.5 font-mono text-2xl font-bold text-ink-muted">%</span>
        </div>
        <div
          className="mt-1.5 rounded-full px-3 py-0.5 font-mono text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{ color, backgroundColor: `${color}1a` }}
        >
          {LEVEL_LABEL[level]}
        </div>
      </div>
    </div>
  );
}
