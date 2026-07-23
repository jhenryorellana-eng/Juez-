"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { upload } from "@vercel/blob/client";
import { AlertTriangle, FileDown, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import FilePicker from "@/components/FilePicker";
import AnalyzingPanel from "@/components/AnalyzingPanel";
import ScoreRing from "@/components/ui/ScoreRing";
import Reveal from "@/components/ui/Reveal";
import { DIRECT_TOTAL_BYTES } from "@/lib/analysis";
import type { XlegalResult } from "@/lib/types";

const FASES = [
  "Abriendo tu expediente",
  "Leyendo cada página",
  "Auditando elemento por elemento",
  "Redactando tu informe",
  "Generando tu PDF",
];

const FASES_MS = 24_000;
const POLL_MS = 5000;
const POLL_MAX = 96; // ~8 minutes

type DoneResult = Extract<XlegalResult, { status: "done" }>;

interface Props {
  token: string;
  nombre: string;
  attemptsRemaining: number;
  /** Signed short-TTL download URL from x-legal, when the PDF was delivered. */
  downloadUrl?: string;
  pdfAvailable: boolean;
  /** Existing job for this token (reload during/after generation). */
  resumeJobId?: string;
}

type View = "upload" | "confirm" | "generating" | "done" | "noAttempts" | "error";

export default function XlegalFlow({
  token,
  nombre,
  attemptsRemaining,
  downloadUrl,
  pdfAvailable,
  resumeJobId,
}: Props) {
  const initialView: View = pdfAvailable
    ? "done"
    : resumeJobId
      ? "generating"
      : attemptsRemaining > 0
        ? "upload"
        : "noAttempts";

  const [view, setView] = useState<View>(initialView);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DoneResult | null>(null);
  const [jobId, setJobId] = useState<string | null>(resumeJobId ?? null);
  const [fase, setFase] = useState(0);
  const [pct, setPct] = useState(0);
  const polling = useRef(false);

  useEffect(() => {
    if (view === "generating" && jobId && !polling.current) {
      polling.current = true;
      void poll(jobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, jobId]);

  useEffect(() => {
    if (view !== "generating") return;
    const faseTimer = setInterval(
      () => setFase((f) => Math.min(f + 1, FASES.length - 1)),
      FASES_MS / FASES.length,
    );
    const counter = animate(0, 97, {
      duration: 150,
      ease: [0.3, 0.6, 0.4, 1],
      onUpdate: (v) => setPct(Math.round(v)),
    });
    return () => {
      clearInterval(faseTimer);
      counter.stop();
    };
  }, [view]);

  async function poll(id: string) {
    try {
      for (let i = 0; i < POLL_MAX; i++) {
        const res = await fetch(
          `/api/xlegal/run?id=${id}&t=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        if (res.status !== 202) {
          const data = (await res.json().catch(() => null)) as XlegalResult | null;
          if (data?.status === "done") {
            setResult(data);
            setView("done");
            return;
          }
          if (data?.status === "error") {
            throw new Error(
              "No pudimos completar tu evaluación. Tu intento no se perdió: recarga esta página para volver a intentarlo.",
            );
          }
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      throw new Error(
        "Tu informe está tardando más de lo normal. Recarga esta página en unos minutos.",
      );
    } catch (err) {
      setError((err as Error).message);
      setView("error");
    } finally {
      polling.current = false;
    }
  }

  async function generar() {
    setError(null);
    try {
      const total = files.reduce((sum, f) => sum + f.size, 0);
      let res: Response;

      if (total <= DIRECT_TOTAL_BYTES) {
        setSending("Enviando tus documentos…");
        const form = new FormData();
        form.set("token", token);
        for (const f of files) form.append("file", f, f.name);
        res = await fetch("/api/xlegal/run", { method: "POST", body: form });
      } else {
        const refs: Array<{ url: string; name: string }> = [];
        for (const [i, f] of files.entries()) {
          setSending(`Subiendo documento ${i + 1} de ${files.length}…`);
          const blob = await upload(`xlegal/docs/${f.name}`, f, {
            access: "public",
            handleUploadUrl: "/api/upload",
          });
          refs.push({ url: blob.url, name: f.name });
        }
        setSending("Iniciando tu evaluación…");
        res = await fetch("/api/xlegal/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, files: refs }),
        });
      }

      const data = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        alreadyDelivered?: boolean;
        error?: string;
      };
      if (data.alreadyDelivered) {
        window.location.reload();
        return;
      }
      if (res.status === 409) {
        throw new Error(
          "Ya no te quedan intentos disponibles. Si crees que es un error, contáctanos desde tu panel de x-legal.",
        );
      }
      if (!res.ok || !data.jobId) {
        throw new Error(
          data.error ?? "No pudimos iniciar tu evaluación. Inténtalo de nuevo.",
        );
      }

      setSending(null);
      setJobId(data.jobId);
      setView("generating");
    } catch (err) {
      setSending(null);
      setError((err as Error).message);
      setView("error");
    }
  }

  if (view === "generating") {
    return (
      <AnalyzingPanel
        fases={FASES}
        fase={fase}
        pct={pct}
        fileNames={files.length > 0 ? files.map((f) => f.name) : undefined}
        badge="Preparando tu evaluación"
      />
    );
  }

  if (view === "done") {
    return (
      <DoneView
        nombre={nombre}
        result={result}
        downloadUrl={result?.pdfUrl ?? downloadUrl}
      />
    );
  }

  if (view === "noAttempts") {
    return (
      <CardCentered>
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">
          No encontramos tu informe
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
          Ya usaste tus intentos disponibles y no pudimos encontrar tu informe.
          Escríbenos desde tu panel de x-legal para ayudarte a resolverlo.
        </p>
      </CardCentered>
    );
  }

  if (view === "error") {
    return (
      <CardCentered>
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-bad/10 text-bad">
          <AlertTriangle className="h-7 w-7" />
        </span>
        <h1 className="mt-6 font-display text-[24px] font-bold tracking-tight text-ink">
          No pudimos completar tu evaluación
        </h1>
        <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">{error}</p>
        <button onClick={() => window.location.reload()} className="btn-lg mt-7">
          <Loader2 className="h-5 w-5" />
          Recargar
        </button>
      </CardCentered>
    );
  }

  // "upload" and "confirm"
  return (
    <div className="flex flex-1 flex-col py-4">
      <header className="mb-5">
        <span className="sys-label">Evaluación de tu caso · x-legal</span>
        <h1 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-tight text-ink">
          Hola, {primerNombre(nombre)}
        </h1>
        <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">
          Sube los documentos de tu caso de asilo para generar tu evaluación
          profesional.
        </p>
      </header>

      <div className="mb-5 rounded-2xl border-2 border-gold bg-gold/10 px-5 py-4">
        <p className="flex items-center gap-2.5 text-[16px] font-bold text-navy">
          <ShieldAlert className="h-5 w-5 shrink-0 text-gold-deep" />
          {attemptsRemaining === 1
            ? "Tienes 1 solo intento para generar tu evaluación."
            : `Tienes ${attemptsRemaining} intentos para generar tu evaluación.`}
        </p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
          Sube TODOS los documentos de tu caso antes de generar. Cuando uses tu
          intento, no podrás volver a subir documentos ni generar el informe de
          nuevo.
        </p>
      </div>

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

      {view === "confirm" ? (
        <div className="glass mt-5 p-6">
          <p className="text-[16px] font-bold leading-relaxed text-ink">
            ¿Ya subiste todos tus documentos? Esta acción usará tu intento y no
            podrás repetirla.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <button
              onClick={generar}
              disabled={Boolean(sending)}
              className="btn-lg"
            >
              {sending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {sending}
                </>
              ) : (
                <>
                  Sí, generar mi evaluación
                  <Sparkles className="h-5 w-5" />
                </>
              )}
            </button>
            <button
              onClick={() => setView("upload")}
              disabled={Boolean(sending)}
              className="btn-ghost-lg"
            >
              Todavía no, quiero revisar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setView("confirm")}
          disabled={files.length === 0}
          className="btn-lg mt-5"
        >
          Generar mi evaluación
          <Sparkles className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

function DoneView({
  nombre,
  result,
  downloadUrl,
}: {
  nombre: string;
  result: DoneResult | null;
  downloadUrl?: string;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center space-y-4 py-4">
      <Reveal className="glass flex flex-col items-center px-6 py-9 text-center">
        <span className="sys-label mb-3">Evaluación de tu caso · x-legal</span>
        <h1 className="text-balance font-display text-[26px] font-bold leading-tight tracking-tight text-ink">
          Tu evaluación está lista{nombre ? `, ${primerNombre(nombre)}` : ""}
        </h1>

        {result ? (
          <>
            <div className="mt-6">
              <ScoreRing value={result.informe.score} level={result.informe.level} />
            </div>
            <p className="mt-5 text-balance text-[16px] leading-relaxed text-ink-soft">
              {result.informe.headline}
            </p>
          </>
        ) : (
          <p className="mt-4 text-balance text-[16px] leading-relaxed text-ink-soft">
            Tu informe quedó guardado. Puedes descargarlo cuando quieras.
          </p>
        )}

        {downloadUrl ? (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gold px-6 py-[18px] text-[19px] font-bold text-navy shadow-gold transition-transform active:scale-[0.98]"
          >
            <FileDown className="h-6 w-6" />
            Descargar mi informe (PDF)
          </a>
        ) : (
          <p className="mt-6 text-[14px] text-ink-muted">
            Tu informe se está guardando en tu panel de x-legal. Recarga esta
            página en unos momentos para descargarlo.
          </p>
        )}
      </Reveal>
    </div>
  );
}

function CardCentered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      <div className="glass flex flex-col items-center p-8 text-center">{children}</div>
    </div>
  );
}

function primerNombre(completo: string): string {
  return completo.trim().split(/\s+/)[0] ?? completo;
}
