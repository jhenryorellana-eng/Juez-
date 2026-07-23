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

/** Análisis dedicado del miedo creíble (credible fear) del expediente. */
export interface MiedoCreible {
  /** Evaluación general de cómo se sostiene el miedo creíble hoy (1-2 párrafos). */
  analisis: string;
  /** Temor subjetivo: qué tan demostrado está en el relato y cómo mejorarlo. */
  subjetivo: string;
  /** Base objetiva: condiciones del país y hechos que la respaldan (o le faltan). */
  objetivo: string;
  /** Nexo con el motivo protegido: qué tan claro está y cómo reforzarlo. */
  nexo: string;
}

/** Caso o precedente GANADO relevante para el país del solicitante. */
export interface CasoGanado {
  /** Ej. "Matter of Mogharrabi" o "Asilo político otorgado (Venezuela, EOIR 2024)". */
  referencia: string;
  /** Qué se ganó, por qué, y qué puede aprender este expediente de ello. */
  resumen: string;
}

/** Panorama de casos ganados del país del solicitante (con búsqueda en internet). */
export interface InvestigacionPais {
  /** Contexto: tasas de aprobación y teorías legales que han prosperado. */
  resumen: string;
  casos: CasoGanado[];
  /** URLs de las fuentes consultadas (rellenadas por el servidor desde la búsqueda). */
  fuentes: string[];
}

/** Punto de la guía de detalles: estructura que el cliente llena con SU historia. */
export interface PuntoGuia {
  /** Ej. "Nombres y descripción de los agresores". */
  titulo: string;
  /** Instrucción concreta, referida a los hechos de SU expediente. */
  instruccion: string;
}

/** Guía de detalles: qué buscan los jueces de inmigración y cómo relatarlo. */
export interface GuiaDetalles {
  /** Por qué los adjudicadores buscan detalles y consistencia cronológica. */
  introduccion: string;
  /** Frase vaga tomada o inspirada del propio relato del cliente. */
  ejemploVago: string;
  /** La misma frase enriquecida con el nivel de detalle que busca un juez. */
  ejemploDetallado: string;
  puntos: PuntoGuia[];
}

/** Contenido generado por la IA para el informe premium (además del Verdict). */
export interface Informe extends Verdict {
  /** Ej. "Asilo, Withholding of Removal y protección bajo la CAT". */
  materia: string;
  /** País de origen detectado en el expediente (si el cliente no lo dio). */
  paisDetectado: string;
  /** II. Estado actual del caso (2-3 párrafos, separados por \n\n). */
  estadoActual: string;
  /** III. Análisis dedicado del miedo creíble. */
  miedoCreible: MiedoCreible;
  /** IV. Casos ganados del país del solicitante (investigación con internet). */
  investigacionPais: InvestigacionPais;
  /** V. Debilidades identificadas, desarrolladas. */
  debilidades: Debilidad[];
  /** VI. Guía de detalles para el relato (estructura que llena el cliente). */
  guiaDetalles: GuiaDetalles;
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

/* ------------------------------------------------------------------ */
/*  Integración /xlegal (variante embebida en x-legal, sin pago)       */
/* ------------------------------------------------------------------ */

/** Session as reported by x-legal (source of truth for attempts and PDF). */
export interface XlegalSession {
  cliente: ClienteInfo;
  attemptsAllowed: number;
  attemptsUsed: number;
  /** Unknown values are treated as "active" by the consumer. */
  status: "active" | "delivered" | "expired";
  pdf: { available: boolean; downloadUrl?: string };
}

/** Job stored in the blob store while an /xlegal evaluation runs. */
export interface XlegalJob {
  status: "pending" | "processing";
  /** sha256 hex of the session token — the token itself is never persisted. */
  tokenHash: string;
  cliente: ClienteInfo;
  files: Array<{ url: string; name: string }>;
  createdAt: string;
}

export type XlegalResult =
  | {
      status: "done";
      informe: Informe;
      pdfUrl: string;
      cliente: ClienteInfo;
      completedAt: string;
      /** false until x-legal acknowledged the webhook with a 2xx. */
      webhookDelivered: boolean;
    }
  | { status: "error"; error: string };
