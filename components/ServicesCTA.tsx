import { Handshake, ArrowUpRight } from "lucide-react";
import { BRAND } from "@/lib/brand";

export default function ServicesCTA() {
  return (
    <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-navy to-navy-dark p-6 text-white shadow-lift">
      <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gold/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-navy-soft/40 blur-3xl" />
      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-bold uppercase tracking-wide text-gold-soft ring-1 ring-inset ring-white/15">
          <Handshake className="h-4 w-4" />
          {BRAND.company}
        </span>
        <h3 className="mt-4 text-[23px] font-bold leading-tight tracking-tight">
          No enfrentes tu caso solo
        </h3>
        <p className="mt-2.5 text-[15px] leading-relaxed text-white/80">
          Nuestro equipo de especialistas puede ayudarte a preparar y fortalecer tu caso,
          paso a paso, para darte la mejor oportunidad de éxito.
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
        <p className="mt-3 text-center text-[12px] font-medium text-white/60">
          usalatinoprime.com
        </p>
      </div>
    </div>
  );
}
