import { Activity } from "lucide-react";
import { BRAND } from "@/lib/brand";

export function BrandMark({ className = "h-11 w-11" }: { className?: string }) {
  return (
    <span
      className={`relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-navy to-navy-dark text-gold shadow-navy ${className}`}
    >
      <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/20" />
      <Activity className="h-1/2 w-1/2" strokeWidth={2.4} />
    </span>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark className="h-9 w-9 rounded-xl" />
      <div className="leading-none">
        <div className="text-[17px] font-bold tracking-tight text-ink">{BRAND.name}</div>
        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
          by {BRAND.family}
        </div>
      </div>
    </div>
  );
}
