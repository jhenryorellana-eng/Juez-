"use client";

import { useRef, useState, type DragEvent } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CloudUpload, FileText, X } from "lucide-react";
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
        <h2 className="text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
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
            className={`flex w-full flex-col items-center justify-center gap-4 rounded-2xl border-[3px] border-dashed px-6 py-12 text-center transition-colors duration-200 ${
              dragging
                ? "border-gold bg-gold/10"
                : "border-navy/20 bg-white/50 hover:border-navy/40 hover:bg-white/80"
            }`}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy text-gold shadow-navy">
              <CloudUpload className="h-8 w-8" strokeWidth={2} />
            </span>
            <span className="text-[19px] font-bold text-ink">
              Toca aquí para elegir tu archivo
            </span>
            <span className="text-[14px] font-medium text-ink-muted">
              o arrástralo hasta este recuadro
              <br />
              PDF o Word (.docx) · máximo {MAX_FILE_MB} MB
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
    <div className="flex items-center gap-4 rounded-2xl border border-navy/10 bg-white/80 p-5">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-good/10 text-good">
        <FileText className="h-7 w-7" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-bold text-ink">{name}</p>
        <p className="mt-0.5 text-[14px] font-medium text-good">
          Listo para evaluar · {formatSize(size)}
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
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
