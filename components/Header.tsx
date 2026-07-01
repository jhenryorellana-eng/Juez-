"use client";

import { RotateCcw } from "lucide-react";
import { useJuez } from "@/lib/store";
import { Wordmark } from "./Brand";

export default function Header() {
  const step = useJuez((s) => s.step);
  const reset = useJuez((s) => s.reset);

  return (
    <header className="mx-auto flex w-full max-w-xl items-center justify-between px-5 py-4 sm:px-6">
      <button onClick={reset} aria-label="Volver al inicio">
        <Wordmark />
      </button>
      {step !== "welcome" && (
        <button
          onClick={reset}
          className="flex items-center gap-1.5 rounded-full border border-navy/10 bg-white/60 px-3.5 py-2 text-[13px] font-semibold text-navy transition-colors hover:bg-white"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reiniciar
        </button>
      )}
    </header>
  );
}
