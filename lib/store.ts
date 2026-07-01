import { create } from "zustand";
import type { CaseTypeId, InterviewQuestion, Verdict } from "./types";

export type Step = "welcome" | "case" | "interview" | "analyzing" | "verdict";

/** Orden de los pasos, para decidir la dirección del deslizamiento. */
export const STEP_ORDER: Step[] = [
  "welcome",
  "case",
  "interview",
  "analyzing",
  "verdict",
];

interface JuezState {
  step: Step;
  caseTypeId: CaseTypeId | null;
  questions: InterviewQuestion[];
  questionsDemo: boolean;
  answers: Record<string, string>;
  story: string;
  verdict: Verdict | null;
  verdictDemo: boolean;

  goTo: (step: Step) => void;
  selectCase: (id: CaseTypeId) => void;
  setQuestions: (questions: InterviewQuestion[], demo: boolean) => void;
  setAnswer: (label: string, value: string) => void;
  setStory: (value: string) => void;
  setVerdict: (verdict: Verdict, demo: boolean) => void;
  reset: () => void;
}

const initialState = {
  step: "welcome" as Step,
  caseTypeId: null,
  questions: [] as InterviewQuestion[],
  questionsDemo: false,
  answers: {} as Record<string, string>,
  story: "",
  verdict: null,
  verdictDemo: false,
};

export const useJuez = create<JuezState>((set) => ({
  ...initialState,

  goTo: (step) => set({ step }),
  selectCase: (caseTypeId) =>
    set({ caseTypeId, questions: [], answers: {}, story: "", verdict: null }),
  setQuestions: (questions, questionsDemo) => set({ questions, questionsDemo }),
  setAnswer: (label, value) =>
    set((s) => ({ answers: { ...s.answers, [label]: value } })),
  setStory: (story) => set({ story }),
  setVerdict: (verdict, verdictDemo) => set({ verdict, verdictDemo }),
  reset: () => set({ ...initialState }),
}));
