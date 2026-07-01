"use client";

import { motion } from "framer-motion";

interface Props {
  current: number; // 1-based
  total: number;
  label?: string;
}

export default function StepBar({ current, total, label }: Props) {
  const pct = Math.round((current / total) * 100);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[15px] font-bold text-navy">
          Paso {current} de {total}
        </span>
        {label && (
          <span className="text-[13px] font-semibold text-ink-muted">{label}</span>
        )}
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-navy/10">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-navy to-gold"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}
