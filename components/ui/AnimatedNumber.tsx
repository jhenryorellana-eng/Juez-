"use client";

import { animate } from "framer-motion";
import { useEffect, useState } from "react";

interface Props {
  value: number;
  duration?: number;
  delay?: number;
}

export default function AnimatedNumber({ value, duration = 1.6, delay = 0 }: Props) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(0, value, {
      duration,
      delay,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, duration, delay]);

  return <>{display}</>;
}
