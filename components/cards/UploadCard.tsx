"use client";

import { useRef, useState, type DragEvent } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CloudUpload, FileText, X, Check } from "lucide-react";
import { useJuez } from "@/lib/store";
import { ACCEPT_ATTR, MAX_FILE_BYTES, MAX_FILE_MB } from "@/lib/analysis";

export default function UploadCard() {
  const { file, setFile, goTo } = useJuez();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function validate(candidate: File): string | null {
    const name = candidate.name.toLowerCase();
    if (name.endsWith(".doc")) {
      return "Los archivos .doc antiguos no son compatibles. Guárdalo como PDF o .docx.";
    }
    if (!name.endsWith(".pdf") && !name.endsWith(".docx") && !name.endsWith(".txt")) {
      return "Formato no compatible. Sube tu caso en PDF o Word (.docx).";
    }
    if (candidate.size > MAX_FILE_BYTES) {
      return `El archivo supera los ${MAX_FILE_MB} MB. Sube una versión más ligera.`;
    }
    if (candidate.size === 0) {
      return "El archivo está vacío. Revisa el documento e inténtalo de nuevo.";
    }
    return null;
  }

  function pick(candidate: File | undefined) {
    if (!candidate) return;
    const problem = validate(candidate);
    if (problem) {
      setError(problem);
      setFile(null);
      return;
    }
    setError(null);
    setFile(candidate);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="flex flex-1 flex-col py-4">
      <header className="mb-6">
        <span className="sys-label">Paso 1 · Tu expediente</span>
        <h2 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
          Sube tu caso de asilo
        </h2>
        <p className="mt-2 text-[17px] leading-relaxed text-ink-soft">
          Puede ser tu solicitud (I-589), tu declaración o cualquier documento que
          resuma tu caso.
        </p>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="glass p-6 sm:p-7"
      >
        {file ? (
          <SelectedFile
            name={file.name}
            size={file.size}
            onRemove={() => {
              setFile(null);
              setError(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`relative flex w-full flex-col items-center justify-center gap-4 rounded-2xl px-6 py-12 text-center transition-colors duration-200 ${
              dragging ? "bg-gold/10" : "bg-white/50 hover:bg-white/80"
            }`}
          >
            <HudCorners active={dragging} />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-navy text-gold shadow-navy">
              <span className="absolute inset-0 rounded-2xl bg-navy/25 animate-pulse-ring" />
              <CloudUpload className="relative h-8 w-8" strokeWidth={2} />
            </span>
            <span className="text-[19px] font-bold text-ink">
              Toca aquí para elegir tu archivo
            </span>
            <span className="text-[14px] font-medium text-ink-muted">
              o arrástralo hasta este recuadro
            </span>
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-navy/45">
              PDF · DOCX · máx {MAX_FILE_MB} MB
            </span>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />

        {error && (
          <p className="mt-4 rounded-2xl bg-bad/10 px-4 py-3 text-center text-[15px] font-medium text-bad">
            {error}
          </p>
        )}
      </motion.div>

      <div className="mt-6 flex gap-3">
        <button onClick={() => goTo("welcome")} className="btn-ghost-lg shrink-0 px-5">
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden sm:inline">Atrás</span>
        </button>
        <button
          onClick={() => goTo("analyzing")}
          disabled={!file}
          className="btn-lg flex-1"
        >
          Evaluar mi caso
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>

      <p className="mt-4 px-2 text-center text-[13px] leading-relaxed text-ink-muted">
        Tu documento se analiza de forma segura y no se guarda.
      </p>
    </div>
  );
}

/** Esquinas tipo visor/HUD alrededor de la zona de carga. */
function HudCorners({ active }: { active: boolean }) {
  const color = active ? "border-gold" : "border-navy/30";
  const base = "pointer-events-none absolute h-6 w-6 transition-colors duration-200";
  return (
    <>
      <span className={`${base} left-2.5 top-2.5 rounded-tl-lg border-l-[3px] border-t-[3px] ${color}`} />
      <span className={`${base} right-2.5 top-2.5 rounded-tr-lg border-r-[3px] border-t-[3px] ${color}`} />
      <span className={`${base} bottom-2.5 left-2.5 rounded-bl-lg border-b-[3px] border-l-[3px] ${color}`} />
      <span className={`${base} bottom-2.5 right-2.5 rounded-br-lg border-b-[3px] border-r-[3px] ${color}`} />
    </>
  );
}

const CHECKS = ["Formato válido", "Tamaño correcto", "Listo para el análisis"];

function SelectedFile({
  name,
  size,
  onRemove,
}: {
  name: string;
  size: number;
  onRemove: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-4 rounded-2xl border border-navy/10 bg-white/80 p-5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-good/10 text-good">
          <FileText className="h-7 w-7" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold text-ink">{name}</p>
          <p className="mt-0.5 font-mono text-[12px] font-bold uppercase tracking-wide text-ink-muted">
            {formatSize(size)}
          </p>
        </div>
        <button
          onClick={onRemove}
          aria-label="Quitar archivo"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy/[0.06] text-ink-muted transition-colors hover:bg-bad/10 hover:text-bad"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Verificación rápida del documento */}
      <div className="mt-3 flex flex-wrap gap-2">
        {CHECKS.map((c, i) => (
          <motion.span
            key={c}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25 + i * 0.28, type: "spring", stiffness: 300, damping: 20 }}
            className="inline-flex items-center gap-1.5 rounded-full bg-good/10 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-good"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            {c}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
