export type VerdictLevel = "bajo" | "moderado" | "alto";

/** Estado de cada elemento legal en la Matriz de Solidez. */
export type MatrixStatus = "solido" | "refuerzo" | "critico";

export interface MatrixItem {
  /** Elemento legal evaluado (ej. "Nexo", "Credibilidad"). */
  element: string;
  status: MatrixStatus;
  /** Hallazgo + acción, muy breve. */
  note: string;
}

/** Nivel de Preparación del expediente (cualitativo). */
export type PrepLevel = "A" | "B" | "C";

export interface Verdict {
  /** Solidez del expediente tal como está hoy, 0-100 */
  score: number;
  level: VerdictLevel;
  headline: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  /** A = listo para presentar · B = necesita trabajo dirigido · C = riesgo alto */
  prepLevel: PrepLevel;
  /** 2-3 factores determinantes del nivel. */
  prepFactors: string[];
  /** Matriz de Solidez por elemento legal (6-8 filas). */
  matrix: MatrixItem[];
  /** Simulación de contrainterrogatorio: 3-5 preguntas probables. */
  crossExam: string[];
}

export interface VerdictResponse extends Verdict {
  /** true si el resultado viene del fallback local (sin IA real) */
  demo?: boolean;
}
