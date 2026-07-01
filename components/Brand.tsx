import { BRAND } from "@/lib/brand";

/** Emblema: pulso de diagnóstico que se dibuja en bucle (dorado sobre azul Utah). */
export function BrandMark({ className = "h-11 w-11" }: { className?: string }) {
  return (
    <span
      className={`relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-navy to-navy-dark text-gold shadow-navy ${className}`}
    >
      <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/20" />
      <svg viewBox="0 0 48 24" className="w-[62%]" fill="none" aria-hidden>
        <polyline
          points="2,12 15,12 20,4 26,20 31,12 46,12"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="70"
          className="animate-pulse-draw"
          style={{ filter: "drop-shadow(0 0 4px rgba(255,195,35,0.7))" }}
        />
      </svg>
    </span>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark className="h-9 w-9 rounded-xl" />
      <div className="leading-none">
        <div className="font-display text-[17px] font-bold tracking-tight text-ink">
          {BRAND.name}
        </div>
        <div className="mt-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-ink-faint">
          by {BRAND.family}
        </div>
      </div>
    </div>
  );
}
