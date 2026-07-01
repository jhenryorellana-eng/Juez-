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
      <div className="flex items-center gap-2.5">
        {step === "welcome" ? (
          <span className="flex items-center gap-1.5 rounded-full border border-navy/10 bg-white/60 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-navy/70">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
            </span>
            En línea
          </span>
        ) : (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-full border border-navy/10 bg-white/60 px-3.5 py-2 text-[13px] font-semibold text-navy transition-colors hover:bg-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reiniciar
          </button>
        )}
      </div>
    </header>
  );
}
