"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Check } from "lucide-react";
import PulseLine from "@/components/ui/PulseLine";
import { BrandMark } from "@/components/Brand";

interface Props {
  fases: string[];
  fase: number;
  pct: number;
  fileNames?: string[];
  badge?: string;
}

/**
 * Animated "report in progress" panel shared by /pro/resultado and /xlegal:
 * brand spinner, phase headline, live console with pulse line and progress.
 */
export default function AnalyzingPanel({
  fases,
  fase,
  pct,
  fileNames,
  badge = "Preparando tu informe premium",
}: Props) {
  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      <div className="glass p-7 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <span className="absolute inset-2 rounded-full bg-navy/15 animate-pulse-ring" />
            <span
              className="absolute inset-2 rounded-full bg-gold/25 animate-pulse-ring"
              style={{ animationDelay: "0.9s" }}
            />
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent 0deg, rgba(255,195,35,0.9) 90deg, rgba(1,45,106,0.9) 200deg, transparent 320deg)",
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 2.6, ease: "linear", repeat: Infinity }}
            />
            <span className="absolute inset-[5px] rounded-full bg-white/90 backdrop-blur-sm" />
            <BrandMark className="relative h-[58px] w-[58px] rounded-2xl" />
          </div>

          <span className="pill mt-6">
            <Loader2 className="h-4 w-4 animate-spin text-gold-deep" />
            {badge}
          </span>

          <div className="mt-4 min-h-[40px]">
            <AnimatePresence mode="wait">
              <motion.h2
                key={fase}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
                className="font-display text-[23px] font-bold tracking-tight text-ink"
              >
                {fases[fase]}
              </motion.h2>
            </AnimatePresence>
          </div>
          <p className="mt-1 text-[15px] text-ink-muted">
            Esto puede tardar unos minutos. No cierres esta página.
          </p>
        </div>

        <div className="console-grid mt-6 rounded-2xl bg-navy-dark p-4 shadow-navy">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-mono text-[11px] font-bold uppercase tracking-wide text-white/70">
              {fileNames?.length
                ? `${fileNames.length} documento${fileNames.length > 1 ? "s" : ""} del caso`
                : "Expediente del caso"}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-blink" />
              En vivo
            </span>
          </div>
          <PulseLine loop className="mt-2 h-10 w-full" />
          <div className="my-3 h-px bg-white/10" />
          <div className="space-y-1.5">
            {fases
              .slice(0, fase + 1)
              .slice(-3)
              .map((f, i, arr) => (
                <p
                  key={f}
                  className={`flex items-center gap-2 font-mono text-[12px] ${
                    i === arr.length - 1 ? "font-bold text-white" : "text-white/45"
                  }`}
                >
                  {i === arr.length - 1 ? (
                    <span className="text-gold">›</span>
                  ) : (
                    <Check className="h-3 w-3 text-gold" strokeWidth={3} />
                  )}
                  {f}
                  {i === arr.length - 1 && (
                    <span className="h-3.5 w-[7px] bg-gold animate-blink" />
                  )}
                </p>
              ))}
          </div>
          <div className="my-3 h-px bg-white/10" />
          <div className="flex items-center justify-between font-mono text-[11px] font-bold text-white/55">
            <span>PROCESANDO</span>
            <span className="text-gold">{String(pct).padStart(2, "0")}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
