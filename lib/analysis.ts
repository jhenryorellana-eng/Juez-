/**
 * Reglas de los documentos que sube el usuario.
 * - Hasta 100 MB por archivo y hasta 10 documentos por evaluación.
 * - Si el total cabe bajo el límite del borde de Vercel (4.5 MB), el envío va
 *   directo a la función; si no, los archivos suben del navegador a Vercel Blob
 *   y el análisis corre como trabajo en segundo plano que la app consulta.
 */
export const MAX_FILE_MB = 100;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
export const MAX_FILES = 10;

/** Umbral para el camino directo (multipart) — margen bajo los 4.5 MB de Vercel. */
export const DIRECT_TOTAL_BYTES = 3_500_000;

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
  { label: "Abriendo tus documentos", detail: "Preparando tu expediente para el análisis" },
  { label: "Leyendo cada página", detail: "Procesando todo el contenido de tu caso" },
  { label: "Identificando los hechos clave", detail: "Fechas, lugares y personas involucradas" },
  { label: "Cruzando tus documentos", detail: "Buscando consistencia entre ellos" },
  { label: "Evaluando la solidez de tu caso", detail: "Elemento legal por elemento legal" },
  { label: "Calculando probabilidades", detail: "Estimando tus posibilidades de aprobación" },
  { label: "Preparando tu diagnóstico", detail: "Redactando tu resultado personalizado" },
];
