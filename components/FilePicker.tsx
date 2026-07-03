"use client";

import { useRef, useState, type DragEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CloudUpload, FileText, X, Plus } from "lucide-react";
import { ACCEPT_ATTR, MAX_FILE_BYTES, MAX_FILE_MB, MAX_FILES } from "@/lib/analysis";

interface Props {
  files: File[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
}

/** Selector de documentos multi-archivo con dropzone HUD (compartido demo/premium). */
export default function FilePicker({ files, onAdd, onRemove }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function validate(candidate: File): string | null {
    const name = candidate.name.toLowerCase();
    if (name.endsWith(".doc")) {
      return `"${candidate.name}" es un .doc antiguo. Guárdalo como PDF o .docx.`;
    }
    if (!name.endsWith(".pdf") && !name.endsWith(".docx") && !name.endsWith(".txt")) {
      return `"${candidate.name}" no es compatible. Usa PDF o Word (.docx).`;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      return `"${candidate.name}" supera los ${MAX_FILE_MB} MB.`;
    }
    if (candidate.size === 0) {
      return `"${candidate.name}" está vacío.`;
    }
    return null;
  }

  function pick(incoming: FileList | null | undefined) {
    if (!incoming || incoming.length === 0) return;
    const candidates = Array.from(incoming);

    if (files.length + candidates.length > MAX_FILES) {
      setError(`Máximo ${MAX_FILES} documentos por evaluación.`);
      return;
    }
    for (const c of candidates) {
      const problem = validate(c);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setError(null);
    onAdd(candidates);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files);
  }

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div>
      {files.length > 0 && (
        <div className="mb-4 space-y-2.5">
          <AnimatePresence initial={false}>
            {files.map((f, i) => (
              <motion.div
                key={`${f.name}|${f.size}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="flex items-center gap-3 rounded-2xl border border-navy/10 bg-white/80 p-3.5"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-good/10 text-good">
                  <FileText className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-ink">{f.name}</p>
                  <p className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                    {formatSize(f.size)}
                  </p>
                </div>
                <button
                  onClick={() => onRemove(i)}
                  aria-label={`Quitar ${f.name}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy/[0.06] text-ink-muted transition-colors hover:bg-bad/10 hover:text-bad"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          <div className="flex items-center justify-between px-1 font-mono text-[11px] font-bold uppercase tracking-wide text-navy/50">
            <span>
              {files.length}/{MAX_FILES} documentos
            </span>
            <span>{formatSize(totalBytes)}</span>
          </div>
        </div>
      )}

      {files.length < MAX_FILES && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`relative flex w-full flex-col items-center justify-center gap-3 rounded-2xl px-6 text-center transition-colors duration-200 ${
            files.length > 0 ? "py-7" : "py-12"
          } ${dragging ? "bg-gold/10" : "bg-white/50 hover:bg-white/80"}`}
        >
          <HudCorners active={dragging} />
          {files.length === 0 ? (
            <>
              <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-navy text-gold shadow-navy">
                <span className="absolute inset-0 rounded-2xl bg-navy/25 animate-pulse-ring" />
                <CloudUpload className="relative h-8 w-8" strokeWidth={2} />
              </span>
              <span className="text-[19px] font-bold text-ink">
                Toca aquí para elegir tus archivos
              </span>
              <span className="text-[14px] font-medium text-ink-muted">
                o arrástralos hasta este recuadro
              </span>
            </>
          ) : (
            <span className="flex items-center gap-2 text-[16px] font-bold text-navy">
              <Plus className="h-5 w-5" />
              Agregar otro documento
            </span>
          )}
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-navy/45">
            PDF · DOCX · máx {MAX_FILE_MB} MB c/u · hasta {MAX_FILES}
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />

      {error && (
        <p className="mt-4 rounded-2xl bg-bad/10 px-4 py-3 text-center text-[15px] font-medium text-bad">
          {error}
        </p>
      )}
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

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
