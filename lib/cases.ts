import type { CaseType, CaseTypeId, InterviewQuestion } from "./types";

export const CASE_TYPES: CaseType[] = [
  {
    id: "asilo-politico",
    name: "Asilo político",
    shortName: "Asilo",
    description:
      "Solicitud inicial de asilo por persecución por raza, religión, nacionalidad, opinión política o grupo social.",
    icon: "ShieldCheck",
  },
  {
    id: "reforzamiento-asilo",
    name: "Reforzamiento de caso de asilo",
    shortName: "Reforzamiento",
    description:
      "Fortalecer un caso de asilo ya presentado con nueva evidencia, declaraciones o documentación de respaldo.",
    icon: "TrendingUp",
  },
  {
    id: "apelacion-bia",
    name: "Apelación ante la BIA",
    shortName: "Apelación BIA",
    description:
      "Apelar una decisión negativa de la corte de inmigración ante la Junta de Apelaciones (BIA).",
    icon: "Gavel",
  },
  {
    id: "cambio-corte",
    name: "Cambio de corte / venue",
    shortName: "Cambio de corte",
    description:
      "Solicitar el traslado del caso a otra corte de inmigración por cambio de domicilio u otras razones.",
    icon: "Building2",
  },
];

export function getCaseType(id: CaseTypeId): CaseType | undefined {
  return CASE_TYPES.find((c) => c.id === id);
}

/** Número de preguntas tailored que pide el "juez" antes del relato libre. */
export const MAX_QUESTIONS = 6;

/** Tiempo mínimo (ms) que dura la animación del análisis para que se sienta la experiencia. */
export const MIN_ANALYSIS_MS = 4200;

export interface AnalysisPhase {
  label: string;
  detail: string;
}

export const ANALYSIS_PHASES: AnalysisPhase[] = [
  { label: "Revisando tu información", detail: "Leyendo cada detalle de tu historia" },
  { label: "Evaluando la solidez", detail: "Consistencia y coherencia de tu caso" },
  { label: "Comparando con casos similares", detail: "Patrones de situaciones parecidas" },
  { label: "Calculando probabilidades", detail: "Estimando tus posibilidades de éxito" },
  { label: "Preparando tu diagnóstico", detail: "Redactando el resultado final" },
];

/**
 * Preguntas de respaldo por tipo de caso. Se usan si la IA no está disponible
 * (sin GEMINI_API_KEY) o si falla la generación dinámica.
 */
export const FALLBACK_QUESTIONS: Record<CaseTypeId, InterviewQuestion[]> = {
  "asilo-politico": [
    {
      id: "pais",
      label: "¿De qué país huiste y por qué razón principal?",
      placeholder: "Ej: Venezuela, por persecución política tras participar en protestas",
      helper: "El motivo debe encajar en una de las 5 categorías protegidas.",
    },
    {
      id: "persecucion",
      label: "¿Qué tipo de persecución o amenazas sufriste directamente?",
      placeholder: "Ej: detenciones, amenazas de muerte, agresiones...",
      multiline: true,
    },
    {
      id: "agente",
      label: "¿Quién te persiguió? ¿El gobierno o un grupo que el gobierno no puede o no quiere controlar?",
      placeholder: "Ej: fuerzas de seguridad del Estado, colectivos armados...",
    },
    {
      id: "fecha-entrada",
      label: "¿Cuándo entraste a EE. UU. y cómo (puerto de entrada, frontera)?",
      placeholder: "Ej: marzo 2024, frontera sur, me presenté a CBP",
      helper: "Importa el plazo de 1 año para solicitar asilo.",
    },
    {
      id: "evidencia",
      label: "¿Qué evidencia tienes que respalde tu historia?",
      placeholder: "Ej: denuncias, reportes médicos, noticias, cartas de testigos...",
      multiline: true,
    },
    {
      id: "miedo",
      label: "¿Qué crees que te pasaría si regresaras a tu país hoy?",
      placeholder: "Describe el riesgo concreto que enfrentarías.",
      multiline: true,
    },
  ],
  "reforzamiento-asilo": [
    {
      id: "estado-actual",
      label: "¿En qué etapa está tu caso de asilo actualmente?",
      placeholder: "Ej: ya presenté el I-589, tengo audiencia en 8 meses",
    },
    {
      id: "debilidad",
      label: "¿Qué parte de tu caso sientes más débil o cuestionada?",
      placeholder: "Ej: falta de pruebas documentales, inconsistencias en fechas...",
      multiline: true,
    },
    {
      id: "nueva-evidencia",
      label: "¿Qué nueva evidencia o testimonios has conseguido desde que presentaste?",
      placeholder: "Ej: nuevo reporte de país, carta de un experto, registros médicos...",
      multiline: true,
    },
    {
      id: "testigos",
      label: "¿Cuentas con testigos o expertos dispuestos a declarar a tu favor?",
      placeholder: "Ej: familiar que presenció los hechos, experto en condiciones del país...",
    },
    {
      id: "inconsistencias",
      label: "¿Hay contradicciones previas que debas explicar o corregir?",
      placeholder: "Sé honesto: el juez ya tiene tu declaración inicial.",
      multiline: true,
    },
    {
      id: "objetivo",
      label: "¿Cuál es el resultado que buscas con el reforzamiento?",
      placeholder: "Ej: cerrar las brechas que señaló el oficial de asilo",
    },
  ],
  "apelacion-bia": [
    {
      id: "decision",
      label: "¿Qué decidió el juez de inmigración y en qué se basó para negar tu caso?",
      placeholder: "Ej: negó el asilo por falta de credibilidad",
      multiline: true,
    },
    {
      id: "fecha-decision",
      label: "¿Cuándo fue la decisión del juez?",
      placeholder: "Ej: hace 12 días",
      helper: "El plazo para apelar ante la BIA suele ser de 30 días.",
    },
    {
      id: "error",
      label: "¿Qué error de hecho o de derecho crees que cometió el juez?",
      placeholder: "Ej: ignoró evidencia clave, aplicó mal el estándar legal...",
      multiline: true,
    },
    {
      id: "evidencia-record",
      label: "¿La evidencia que apoya tu argumento ya está en el expediente (record)?",
      placeholder: "La BIA generalmente no acepta evidencia nueva.",
    },
    {
      id: "abogado",
      label: "¿Tienes representación legal para la apelación?",
      placeholder: "Ej: sí / no / estoy buscando",
    },
    {
      id: "consecuencia",
      label: "¿Qué pasa contigo si la apelación no procede?",
      placeholder: "Ej: orden de deportación final",
      multiline: true,
    },
  ],
  "cambio-corte": [
    {
      id: "corte-actual",
      label: "¿En qué corte de inmigración está tu caso actualmente?",
      placeholder: "Ej: Corte de Inmigración de Houston",
    },
    {
      id: "motivo",
      label: "¿Por qué necesitas cambiar de corte?",
      placeholder: "Ej: me mudé a otro estado, cambio de domicilio permanente",
      multiline: true,
    },
    {
      id: "nuevo-domicilio",
      label: "¿Ya tienes un domicilio estable comprobable en la nueva jurisdicción?",
      placeholder: "Ej: sí, contrato de arrendamiento a mi nombre",
    },
    {
      id: "etapa",
      label: "¿En qué etapa está tu caso (Master, Individual, etc.)?",
      placeholder: "Ej: tengo audiencia Master programada",
    },
    {
      id: "audiencia",
      label: "¿Tienes una audiencia próxima programada? ¿Cuándo?",
      placeholder: "Ej: sí, en 6 semanas",
    },
    {
      id: "evidencia-domicilio",
      label: "¿Qué documentos respaldan tu nuevo domicilio?",
      placeholder: "Ej: factura de luz, contrato, licencia con la nueva dirección...",
      multiline: true,
    },
  ],
};
