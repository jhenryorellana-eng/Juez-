import type { Verdict } from "./types";

/**
 * Resultado de respaldo (modo demo) cuando no hay GEMINI_API_KEY o la IA falla
 * por completo. El score se deriva del tamaño del contenido para que se sienta
 * responsivo, pero NO sustituye una evaluación real.
 */
export function buildDemoVerdict(contentLength: number): Verdict {
  const detail = Math.min(contentLength / 8000, 1);
  const score = clamp(30 + Math.round(detail * 45), 22, 78);
  const level: Verdict["level"] =
    score >= 70 ? "alto" : score >= 40 ? "moderado" : "bajo";

  return {
    score,
    level,
    headline: "Análisis preliminar de tu caso de asilo",
    summary:
      "Esta es una evaluación de demostración generada localmente (sin conexión a la IA). " +
      "Refleja el volumen de información de tu documento, no un análisis real del expediente. " +
      "Configura la GEMINI_API_KEY para obtener el diagnóstico completo.",
    strengths: [
      "Tu caso ya está documentado por escrito, un requisito básico para reforzarlo.",
      detail > 0.5
        ? "El documento tiene un volumen de detalle razonable para ser evaluado."
        : "Diste el primer paso: poner tu caso en un documento evaluable.",
    ],
    weaknesses: [
      detail < 0.5
        ? "El documento es breve; un expediente sólido suele requerir más detalle y evidencia."
        : "Falta verificar que cada afirmación esté respaldada con evidencia corroborativa.",
      "No se han verificado plazos ni barras legales aplicables en este modo demo.",
    ],
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
