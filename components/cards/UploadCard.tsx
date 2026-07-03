"use client";

import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useJuez } from "@/lib/store";
import { MAX_FILES } from "@/lib/analysis";
import FilePicker from "@/components/FilePicker";

export default function UploadCard() {
  const { files, addFiles, removeFile, goTo } = useJuez();

  return (
    <div className="flex flex-1 flex-col py-4">
      <header className="mb-6">
        <span className="sys-label">Paso 1 · Tu expediente</span>
        <h2 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
          Sube los documentos de tu caso
        </h2>
        <p className="mt-2 text-[17px] leading-relaxed text-ink-soft">
          Tu solicitud (I-589), tu declaración, evidencias, entrevistas… hasta{" "}
          {MAX_FILES} documentos.
        </p>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="glass p-5 sm:p-6"
      >
        <FilePicker files={files} onAdd={addFiles} onRemove={removeFile} />
      </motion.div>

      <div className="mt-6 flex gap-3">
        <button onClick={() => goTo("welcome")} className="btn-ghost-lg shrink-0 px-5">
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden sm:inline">Atrás</span>
        </button>
        <button
          onClick={() => goTo("analyzing")}
          disabled={files.length === 0}
          className="btn-lg flex-1"
        >
          Evaluar mi caso
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>

      <p className="mt-4 px-2 text-center text-[13px] leading-relaxed text-ink-muted">
        Tus documentos se analizan de forma segura y se eliminan al terminar.
      </p>
    </div>
  );
}
