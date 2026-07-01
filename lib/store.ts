import { create } from "zustand";
import type { Verdict } from "./types";

export type Step = "welcome" | "upload" | "analyzing" | "verdict";

/** Orden de los pasos, para decidir la dirección del deslizamiento. */
export const STEP_ORDER: Step[] = ["welcome", "upload", "analyzing", "verdict"];

interface DiagnosticoState {
  step: Step;
  /** Documento del caso elegido por el usuario (solo vive en el cliente). */
  file: File | null;
  verdict: Verdict | null;
  verdictDemo: boolean;

  goTo: (step: Step) => void;
  setFile: (file: File | null) => void;
  setVerdict: (verdict: Verdict, demo: boolean) => void;
  reset: () => void;
}

const initialState = {
  step: "welcome" as Step,
  file: null,
  verdict: null,
  verdictDemo: false,
};

export const useJuez = create<DiagnosticoState>((set) => ({
  ...initialState,

  goTo: (step) => set({ step }),
  setFile: (file) => set({ file, verdict: null }),
  setVerdict: (verdict, verdictDemo) => set({ verdict, verdictDemo }),
  reset: () => set({ ...initialState }),
}));
