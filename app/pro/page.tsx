"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { upload } from "@vercel/blob/client";
import {
  ArrowLeft,
  ArrowRight,
  FileCheck2,
  ShieldCheck,
  Scale,
  ListChecks,
  MessageCircleQuestion,
  Landmark,
  Loader2,
  Lock,
} from "lucide-react";
import Background from "@/components/Background";
import Header from "@/components/Header";
import FilePicker from "@/components/FilePicker";
import PulseLine from "@/components/ui/PulseLine";
import { BRAND } from "@/lib/brand";
import { INFORME_PRICE_USD } from "@/lib/stripe-shared";

const INCLUYE = [
  { icon: Scale, text: "Probabilidad de aprobación con el criterio de un juez" },
  { icon: ListChecks, text: "Debilidades desarrolladas una a una, con la estrategia para corregirlas" },
  { icon: Landmark, text: "Normas legales y precedentes aplicables a TU caso (INA, CFR, BIA)" },
  { icon: MessageCircleQuestion, text: "Preguntas probables del fiscal y plan de reforzamiento completo" },
  { icon: FileCheck2, text: "Informe profesional en PDF con la marca USA Latino Prime, listo para guardar" },
];

type Paso = "intro" | "datos" | "docs";

export default function ProPage() {
  return (
    <Suspense>
      <ProFlow />
    </Suspense>
  );
}

function ProFlow() {
  const cancelado = useSearchParams().get("cancelado") === "1";
  const [paso, setPaso] = useState<Paso>("intro");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [pais, setPais] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const datosOk =
    nombre.trim().length >= 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function pagar() {
    setError(null);
    try {
      // 1) Subir documentos directo a Blob (evita el límite de 4.5 MB del borde).
      const refs: Array<{ url: string; name: string }> = [];
      for (const [i, f] of files.entries()) {
        setSending(`Subiendo documento ${i + 1} de ${files.length}…`);
        const blob = await upload(`casos/${f.name}`, f, {
          access: "public",
          handleUploadUrl: "/api/upload",
        });
        refs.push({ url: blob.url, name: f.name });
      }

      // 2) Registrar el trabajo y crear la sesión de pago.
      setSending("Preparando el pago seguro…");
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          email: email.trim(),
          pais: pais.trim(),
          files: refs,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "No pudimos iniciar el pago. Inténtalo de nuevo.");
      }

      sessionStorage.setItem(
        "pro-meta",
        JSON.stringify({ nombre: nombre.trim(), fileNames: files.map((f) => f.name) }),
      );
      window.location.href = data.url;
    } catch (err) {
      setSending(null);
      setError((err as Error).message || "Algo salió mal. Inténtalo de nuevo.");
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <Background />
      <Header />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-8 sm:px-6">
        {paso === "intro" && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-1 flex-col justify-center py-4"
          >
            <div className="glass p-7 sm:p-9">
              <div className="flex flex-col items-center text-center">
                <span className="inline-flex items-center gap-2 rounded-full bg-navy px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
                  Servicio premium
                </span>
                <h1 className="mt-5 text-balance font-display text-[32px] font-bold leading-[1.08] tracking-tight text-ink sm:text-[38px]">
                  Informe completo de tu caso de asilo
                </h1>
                <PulseLine className="mt-5 h-8 w-full max-w-[300px]" delay={0.4} />
                <p className="mt-4 text-balance text-[17px] leading-relaxed text-ink-soft">
                  Un análisis profundo de todo tu expediente y un documento profesional
                  de {BRAND.company} con lo que necesitas para fortalecer tu caso.
                </p>
                <div className="mt-5 flex items-baseline gap-2">
                  <span className="font-display text-[44px] font-bold leading-none text-navy">
                    ${INFORME_PRICE_USD}
                  </span>
                  <span className="text-[15px] font-semibold text-ink-muted">
                    USD · pago único
                  </span>
                </div>
              </div>

              <div className="mt-7 space-y-3">
                {INCLUYE.map((p, i) => (
                  <motion.div
                    key={p.text}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 + i * 0.08, duration: 0.5 }}
                    className="flex items-center gap-4 rounded-2xl border border-navy/10 bg-white/70 px-5 py-3.5"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy/[0.06] text-navy">
                      <p.icon className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <span className="text-[15px] font-medium leading-snug text-ink">
                      {p.text}
                    </span>
                  </motion.div>
                ))}
              </div>

              {cancelado && (
                <p className="mt-5 rounded-2xl bg-gold/15 px-4 py-3 text-center text-[14px] font-semibold text-gold-deep">
                  El pago fue cancelado. Puedes intentarlo de nuevo cuando quieras.
                </p>
              )}

              <button onClick={() => setPaso("datos")} className="btn-lg mt-7">
                Comenzar mi informe
                <ArrowRight className="h-5 w-5" />
              </button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[13px] text-ink-muted">
                <Lock className="h-3.5 w-3.5" />
                Pago seguro con tarjeta · tus documentos se eliminan al terminar
              </p>
            </div>
          </motion.div>
        )}

        {paso === "datos" && (
          <div className="flex flex-1 flex-col py-4">
            <header className="mb-6">
              <span className="sys-label">Paso 1 de 3 · Tus datos</span>
              <h2 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-tight text-ink">
                ¿Para quién preparamos el informe?
              </h2>
              <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">
                El documento irá dirigido a tu nombre, como un informe formal.
              </p>
            </header>

            <div className="glass space-y-4 p-6">
              <div>
                <label className="mb-1.5 block text-[15px] font-bold text-ink">
                  Nombre completo
                </label>
                <input
                  className="field-lg"
                  placeholder="Ej: Juan José Vivanco Franco"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[15px] font-bold text-ink">
                  Correo electrónico
                </label>
                <input
                  className="field-lg"
                  type="email"
                  placeholder="tucorreo@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[15px] font-bold text-ink">
                  País de origen <span className="font-normal text-ink-muted">(opcional)</span>
                </label>
                <input
                  className="field-lg"
                  placeholder="Ej: Venezuela"
                  value={pais}
                  onChange={(e) => setPais(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setPaso("intro")} className="btn-ghost-lg shrink-0 px-5">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setPaso("docs")}
                disabled={!datosOk}
                className="btn-lg flex-1"
              >
                Siguiente
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {paso === "docs" && (
          <div className="flex flex-1 flex-col py-4">
            <header className="mb-6">
              <span className="sys-label">Paso 2 de 3 · Tu expediente</span>
              <h2 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-tight text-ink">
                Sube los documentos de tu caso
              </h2>
              <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">
                Mientras más completo el expediente, más profundo el informe.
              </p>
            </header>

            <div className="glass p-5 sm:p-6">
              <FilePicker
                files={files}
                onAdd={(nuevos) => setFiles((prev) => [...prev, ...nuevos])}
                onRemove={(i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
              />
            </div>

            {error && (
              <p className="mt-4 rounded-2xl bg-bad/10 px-4 py-3 text-center text-[15px] font-medium text-bad">
                {error}
              </p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setPaso("datos")}
                disabled={Boolean(sending)}
                className="btn-ghost-lg shrink-0 px-5"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <button
                onClick={pagar}
                disabled={files.length === 0 || Boolean(sending)}
                className="btn-lg flex-1"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {sending}
                  </>
                ) : (
                  <>
                    Continuar al pago · ${INFORME_PRICE_USD}
                    <ShieldCheck className="h-5 w-5" />
                  </>
                )}
              </button>
            </div>
            <p className="mt-3 text-center text-[13px] text-ink-muted">
              Paso 3: pago seguro con tarjeta. El análisis comienza al confirmarse.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
