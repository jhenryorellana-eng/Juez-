"use client";

import { motion } from "framer-motion";

interface Props {
  total: number;
  current: number; // índice 0-based del segmento activo
}

export default function StoriesProgress({ total, current }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-1 flex-1 overflow-hidden rounded-full bg-black/[0.08]"
        >
          <motion.div
            className="h-full rounded-full bg-label"
            initial={false}
            animate={{ width: i <= current ? "100%" : "0%" }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      ))}
    </div>
  );
}
