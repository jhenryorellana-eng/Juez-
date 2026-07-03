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

/* ------------------------------------------------------------------ */
/*  Premium ($50): Informe de Evaluación y Propuesta de Reforzamiento  */
/* ------------------------------------------------------------------ */

export interface ClienteInfo {
  nombre: string;
  email: string;
  pais: string;
}

export interface Debilidad {
  titulo: string;
  /** Análisis desarrollado (1-2 párrafos). */
  detalle: string;
  /** Estrategia/acción concreta para corregirla. */
  accion: string;
}

export interface NormaLegal {
  /** Ej. "INA § 208" o "Matter of Acosta". */
  ref: string;
  /** Qué regula y por qué aplica a este caso. */
  texto: string;
}

/** Contenido generado por la IA para el informe premium (además del Verdict). */
export interface Informe extends Verdict {
  /** Ej. "Asilo, Withholding of Removal y protección bajo la CAT". */
  materia: string;
  /** País de origen detectado en el expediente (si el cliente no lo dio). */
  paisDetectado: string;
  /** II. Estado actual del caso (2-3 párrafos, separados por \n\n). */
  estadoActual: string;
  /** III. Debilidades identificadas, desarrolladas. */
  debilidades: Debilidad[];
  /** IV. Alcance del reforzamiento recomendado. */
  reforzamiento: string[];
  /** V. Normas legales y precedentes aplicables. */
  normas: NormaLegal[];
  /** VI. Beneficios de reforzar el caso. */
  beneficios: string[];
  /** VIII. Recomendación final dirigida al cliente (1-2 párrafos). */
  recomendacionFinal: string;
  /** Opción recomendada de la tabla de costos. */
  opcionRecomendada: "plataforma" | "abogado";
  opcionJustificacion: string;
}

export type ProJobStatus = "pending" | "processing";

/** Trabajo premium guardado en Blob antes/durante el procesamiento. */
export interface ProJob {
  status: ProJobStatus;
  cliente: ClienteInfo;
  files: Array<{ url: string; name: string }>;
  createdAt: string;
}

export type ProResult =
  | { status: "done"; informe: Informe; pdfUrl: string; cliente: ClienteInfo }
  | { status: "error"; error: string };
