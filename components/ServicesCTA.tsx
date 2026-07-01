import { Handshake, ArrowUpRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import PulseLine from "@/components/ui/PulseLine";

export default function ServicesCTA() {
  return (
    <div className="console-grid relative overflow-hidden rounded-xl3 bg-gradient-to-br from-navy to-navy-dark p-6 text-white shadow-lift">
      <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gold/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-navy-soft/40 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-gold-soft ring-1 ring-inset ring-white/15">
            <Handshake className="h-4 w-4" />
            {BRAND.company}
          </span>
          <PulseLine className="h-6 w-24 opacity-70" delay={0.4} />
        </div>
        <h3 className="mt-4 font-display text-[23px] font-bold leading-tight tracking-tight">
          Aumenta tus probabilidades de aprobación
        </h3>
        <p className="mt-2.5 text-[15px] leading-relaxed text-white/80">
          Los especialistas de {BRAND.company} preparan y fortalecen tu caso para presentarlo
          con la mayor solidez posible ante el juez.
        </p>
        <a
          href={BRAND.servicesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-6 py-4 text-[18px] font-bold text-navy shadow-gold transition-transform active:scale-[0.98]"
        >
          Conocer nuestros servicios
          <ArrowUpRight className="h-5 w-5" />
        </a>
        <p className="mt-3 text-center font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
          usalatinoprime.com
        </p>
      </div>
    </div>
  );
}
