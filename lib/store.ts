import { create } from "zustand";
import type { Verdict } from "./types";
import { MAX_FILES } from "./analysis";

export type Step = "welcome" | "upload" | "analyzing" | "verdict";

/** Orden de los pasos, para decidir la dirección del deslizamiento. */
export const STEP_ORDER: Step[] = ["welcome", "upload", "analyzing", "verdict"];

interface DiagnosticoState {
  step: Step;
  /** Documentos del caso elegidos por el usuario (solo viven en el cliente). */
  files: File[];
  verdict: Verdict | null;
  verdictDemo: boolean;

  goTo: (step: Step) => void;
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  setVerdict: (verdict: Verdict, demo: boolean) => void;
  reset: () => void;
}

const initialState = {
  step: "welcome" as Step,
  files: [] as File[],
  verdict: null,
  verdictDemo: false,
};

export const useJuez = create<DiagnosticoState>((set) => ({
  ...initialState,

  goTo: (step) => set({ step }),
  addFiles: (incoming) =>
    set((s) => {
      const existing = new Set(s.files.map((f) => `${f.name}|${f.size}`));
      const fresh = incoming.filter((f) => !existing.has(`${f.name}|${f.size}`));
      return { files: [...s.files, ...fresh].slice(0, MAX_FILES), verdict: null };
    }),
  removeFile: (index) =>
    set((s) => ({ files: s.files.filter((_, i) => i !== index) })),
  setVerdict: (verdict, verdictDemo) => set({ verdict, verdictDemo }),
  reset: () => set({ ...initialState }),
}));
