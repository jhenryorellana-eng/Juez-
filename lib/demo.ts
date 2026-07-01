import type { CaseType, Verdict } from "./types";

/**
 * Veredicto de respaldo (modo demo) cuando no hay GEMINI_API_KEY o falla la IA.
 * El score se deriva del nivel de detalle aportado para que se sienta responsivo,
 * pero NO sustituye una evaluación real.
 */
export function buildDemoVerdict(
  caseType: CaseType,
  answers: Array<{ question: string; answer: string }>,
  story: string,
): Verdict {
  const detail = scoreDetail(answers, story);
  const score = clamp(34 + Math.round(detail * 46), 18, 88);
  const level: Verdict["level"] =
    score >= 70 ? "alto" : score >= 40 ? "moderado" : "bajo";

  return {
    score,
    level,
    headline: `Análisis preliminar de tu caso de ${caseType.shortName.toLowerCase()}`,
    summary:
      "Esta es una evaluación de demostración generada localmente (sin conexión a la IA). " +
      "Refleja el nivel de detalle que aportaste, no un análisis legal real. " +
      "Configura tu GEMINI_API_KEY para obtener el veredicto completo del Juez.",
    strengths: [
      detail > 0.5
        ? "Aportaste un relato con buen nivel de detalle, lo que suele ayudar a la credibilidad."
        : "Identificaste el tipo de caso correctamente, un primer paso necesario.",
      "Estás documentando tu historia de forma estructurada y ordenada.",
    ],
    weaknesses: [
      detail < 0.5
        ? "La información es todavía escasa; un juez necesitaría más detalles concretos."
        : "Falta confirmar la evidencia documental que respalde cada afirmación.",
      "No se ha verificado el cumplimiento de plazos legales aplicables a tu caso.",
    ],
    recommendations: [
      "Reúne y organiza toda la evidencia documental (reportes, denuncias, cartas, registros).",
      "Anota fechas exactas: pueden ser decisivas para los plazos legales.",
      "Consulta con un abogado de inmigración licenciado antes de cualquier presentación.",
    ],
    nextSteps: [
      "Configura la API de Gemini para recibir el veredicto real del Juez.",
      "Prepara una línea de tiempo clara de los hechos.",
      "Identifica posibles testigos o expertos que respalden tu caso.",
    ],
    factors: [
      {
        factor: "Detalle del relato",
        impact: detail > 0.5 ? "positivo" : "negativo",
        detail:
          detail > 0.5
            ? "Tu historia incluye elementos concretos y específicos."
            : "Tu historia necesita más concreción y ejemplos.",
      },
      {
        factor: "Evidencia de respaldo",
        impact: "neutral",
        detail: "Aún no se ha evaluado la solidez de la evidencia documental.",
      },
      {
        factor: "Cumplimiento de plazos",
        impact: "neutral",
        detail: "Los plazos legales no han sido verificados en este modo demo.",
      },
    ],
  };
}

function scoreDetail(
  answers: Array<{ question: string; answer: string }>,
  story: string,
): number {
  const answered = answers.filter((a) => a.answer.trim().length > 12).length;
  const answerRatio = answers.length > 0 ? answered / answers.length : 0;
  const storyScore = Math.min(story.trim().length / 600, 1);
  return clamp(answerRatio * 0.55 + storyScore * 0.45, 0, 1);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
