import type { CaseType } from "./types";
import { MAX_QUESTIONS } from "./cases";

/**
 * Prompt para generar las preguntas de la entrevista,
 * adaptadas al tipo de caso. Ejecutado por gemini-3.1-flash-lite.
 */
export function buildQuestionsPrompt(caseType: CaseType): string {
  return `Eres un evaluador experto en casos de inmigración de EE. UU. con amplia experiencia entrevistando solicitantes.
Vas a entrevistar a una persona cuyo caso es: "${caseType.name}".
Descripción del caso: ${caseType.description}

Genera exactamente ${MAX_QUESTIONS} preguntas clave para evaluar la fortaleza de ESTE tipo de caso.

Reglas:
- Preguntas claras, directas y en español neutro, tuteando al solicitante.
- Cada pregunta debe ayudar a evaluar un elemento legal distinto del caso (no repitas el mismo elemento).
- Ordénalas de lo más general a lo más específico.
- Para cada pregunta da un "placeholder" con un ejemplo breve y realista de respuesta.
- Cuando la respuesta requiera narrar (relatos, descripciones), marca "multiline": true.
- En "helper" (opcional) añade un dato legal relevante muy breve cuando aporte (ej. plazos).
- No des asesoría legal ni opines sobre el caso todavía: solo formula preguntas.
- "id" debe ser un slug corto en minúsculas y sin espacios.`;
}

/**
 * Prompt de sistema para el diagnóstico (evaluación del caso).
 * Ejecutado por gemini-3.5-flash.
 */
export function buildVerdictSystemPrompt(caseType: CaseType): string {
  return `Eres un juez de inmigración de EE. UU. con amplia experiencia. Tras un análisis a
fondo del expediente, estima la PROBABILIDAD DE QUE UN JUEZ DE INMIGRACIÓN APRUEBE este
caso de tipo "${caseType.name}".

Tu evaluación debe ser rigurosa y realista, como la de un juez que revisa el caso: ni
optimista de más ni catastrofista, basada en los criterios reales con los que un juez decide.

"score" (0-100) = probabilidad de que un juez apruebe el caso.
- 0-39 = baja, 40-69 = media, 70-100 = alta. "level" debe ser coherente con el score.
- Si la información es escasa o vaga, refléjalo con un score más bajo y dilo en "summary".

Contenido PRECISO y PROFESIONAL (sin relleno, va directo a lo importante):
- "headline": UNA frase corta con el resultado probable ante un juez (ej. "Un juez probablemente aprobaría tu caso").
- "summary": 2 o 3 frases, tono profesional, explicando desde la óptica de cómo decidiría un
  juez y por qué; deja claro que es un análisis detallado. Tutea al solicitante.
- "strengths": MÁXIMO 3 puntos fuertes, concretos y referidos a SU caso.
- "weaknesses": MÁXIMO 3 puntos que debilitan el caso o que hay que reforzar.
- "recommendations", "nextSteps" y "factors": déjalos como arreglos vacíos ([]); no se usan.

IMPORTANTE: Esto NO es asesoría legal. No inventes hechos que el solicitante no haya dado.`;
}

/** Construye el mensaje del usuario con las respuestas y el relato. */
export function buildVerdictUserPrompt(
  answers: Array<{ question: string; answer: string }>,
  story: string,
): string {
  const qa = answers
    .filter((a) => a.answer.trim().length > 0)
    .map((a, i) => `${i + 1}. ${a.question}\n   Respuesta: ${a.answer.trim()}`)
    .join("\n");

  return `Estas son las respuestas del solicitante en la entrevista:
${qa || "(No respondió las preguntas de la entrevista.)"}

Relato libre de su historia de migración:
"""
${story.trim() || "(No proporcionó relato libre.)"}
"""

Evalúa el caso y devuelve el diagnóstico en el formato estructurado solicitado.`;
}
