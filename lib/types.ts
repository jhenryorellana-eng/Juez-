export type CaseTypeId =
  | "asilo-politico"
  | "reforzamiento-asilo"
  | "apelacion-bia"
  | "cambio-corte";

export interface CaseType {
  id: CaseTypeId;
  name: string;
  shortName: string;
  description: string;
  /** Nombre de un icono de lucide-react */
  icon: string;
}

export interface InterviewQuestion {
  id: string;
  label: string;
  placeholder: string;
  helper?: string;
  multiline?: boolean;
}

export type VerdictLevel = "bajo" | "moderado" | "alto";
export type FactorImpact = "positivo" | "negativo" | "neutral";

export interface VerdictFactor {
  factor: string;
  impact: FactorImpact;
  detail: string;
}

export interface Verdict {
  /** Probabilidad de éxito, 0-100 */
  score: number;
  level: VerdictLevel;
  headline: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  nextSteps: string[];
  factors: VerdictFactor[];
}

export interface QuestionsResponse {
  questions: InterviewQuestion[];
  /** true si las preguntas vienen del fallback (sin IA real) */
  demo?: boolean;
}

export interface VerdictRequest {
  caseTypeId: CaseTypeId;
  answers: Record<string, string>;
  story: string;
}

export interface VerdictResponse extends Verdict {
  demo?: boolean;
}
