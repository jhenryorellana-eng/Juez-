export default function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Luces de color (azul Utah + dorado) con movimiento sutil */}
      <div className="absolute -left-40 -top-32 h-[38rem] w-[38rem] rounded-full bg-navy/[0.14] blur-3xl animate-glow-drift" />
      <div
        className="absolute -right-32 top-10 h-[32rem] w-[32rem] rounded-full bg-gold/[0.20] blur-3xl animate-glow-drift"
        style={{ animationDelay: "-5s" }}
      />
      <div
        className="absolute bottom-[-12rem] left-1/3 h-[36rem] w-[36rem] rounded-full bg-navy/[0.12] blur-3xl animate-glow-drift"
        style={{ animationDelay: "-9s" }}
      />
    </div>
  );
}
