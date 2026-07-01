export type VerdictLevel = "bajo" | "moderado" | "alto";

export interface Verdict {
  /** Probabilidad de aprobación, 0-100 */
  score: number;
  level: VerdictLevel;
  headline: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
}

export interface VerdictResponse extends Verdict {
  /** true si el resultado viene del fallback local (sin IA real) */
  demo?: boolean;
}
