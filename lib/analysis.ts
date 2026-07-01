/** Reglas del documento que sube el usuario. */
export const MAX_FILE_MB = 15;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/** Extensiones aceptadas (el .doc antiguo no: se pide convertirlo a PDF). */
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt"] as const;
export const ACCEPT_ATTR = ".pdf,.docx,.txt";

/** Tiempo mínimo (ms) de la animación de análisis para que se sienta el proceso. */
export const MIN_ANALYSIS_MS = 8400;

export interface AnalysisPhase {
  label: string;
  detail: string;
}

export const ANALYSIS_PHASES: AnalysisPhase[] = [
  { label: "Abriendo tu documento", detail: "Preparando tu caso para el análisis" },
  { label: "Leyendo cada página", detail: "Procesando todo el contenido de tu caso" },
  { label: "Identificando los hechos clave", detail: "Fechas, lugares y personas involucradas" },
  { label: "Evaluando la solidez de tu caso", detail: "Consistencia y coherencia de tu declaración" },
  { label: "Comparando con casos similares", detail: "Miles de situaciones parecidas" },
  { label: "Calculando probabilidades", detail: "Estimando tus posibilidades de aprobación" },
  { label: "Preparando tu diagnóstico", detail: "Redactando tu resultado personalizado" },
];
