import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import type { Schema } from "@google/genai";
import type { CaseType, InterviewQuestion, Verdict } from "./types";
import { MAX_QUESTIONS } from "./cases";
import {
  buildQuestionsPrompt,
  buildVerdictSystemPrompt,
  buildVerdictUserPrompt,
} from "./prompts";

/** Modelos elegidos según la página de precios de Gemini (solo 3.x). */
export const MODELS = {
  /** Entrevista: rápido y económico. */
  interview: "gemini-3.1-flash-lite",
  /** Veredicto: el más inteligente, para el razonamiento legal. */
  judge: "gemini-3.5-flash",
  /** Respaldo del veredicto si el modelo principal está sobrecargado (503/429). */
  judgeFallback: "gemini-3.1-flash-lite",
} as const;

/** Errores transitorios del lado del proveedor que conviene reintentar. */
const RETRYABLE = /(\b503\b|UNAVAILABLE|\b429\b|RESOURCE_EXHAUSTED|high demand|overloaded|deadline)/i;

let cachedClient: GoogleGenAI | null = null;

/** Devuelve el cliente de Gemini, o null si no hay API key configurada. */
export function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!cachedClient) cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RETRYABLE.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface GenParams {
  model: string;
  contents: string;
  config: Record<string, unknown>;
  retries?: number;
}

/** Llama al modelo pidiendo JSON y lo parsea, con reintentos ante errores transitorios. */
async function generateJson<T>({ model, contents, config, retries = 2 }: GenParams): Promise<T> {
  const client = getClient();
  if (!client) throw new Error("NO_API_KEY");

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.models.generateContent({ model, contents, config });
      return JSON.parse(response.text ?? "{}") as T;
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isRetryable(err)) {
        await sleep(700 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

const QUESTIONS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          label: { type: Type.STRING },
          placeholder: { type: Type.STRING },
          helper: { type: Type.STRING },
          multiline: { type: Type.BOOLEAN },
        },
        required: ["id", "label", "placeholder"],
      },
    },
  },
  required: ["questions"],
};

const VERDICT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.INTEGER },
    level: { type: Type.STRING, enum: ["bajo", "moderado", "alto"] },
    headline: { type: Type.STRING },
    summary: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
    nextSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
    factors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          factor: { type: Type.STRING },
          impact: { type: Type.STRING, enum: ["positivo", "negativo", "neutral"] },
          detail: { type: Type.STRING },
        },
        required: ["factor", "impact", "detail"],
      },
    },
  },
  required: [
    "score",
    "level",
    "headline",
    "summary",
    "strengths",
    "weaknesses",
    "recommendations",
    "nextSteps",
    "factors",
  ],
};

/** Genera las preguntas de la entrevista con gemini-3.1-flash-lite. */
export async function generateQuestions(
  caseType: CaseType,
): Promise<InterviewQuestion[]> {
  const parsed = await generateJson<{ questions?: InterviewQuestion[] }>({
    model: MODELS.interview,
    contents: buildQuestionsPrompt(caseType),
    config: {
      responseMimeType: "application/json",
      responseSchema: QUESTIONS_SCHEMA,
      temperature: 0.7,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
    retries: 2,
  });

  const questions = parsed.questions ?? [];
  if (questions.length === 0) throw new Error("EMPTY_QUESTIONS");
  return questions.slice(0, MAX_QUESTIONS);
}

/** Emite el veredicto. Usa 3.5-flash; si está sobrecargado, cae a 3.1-flash-lite (IA real). */
export async function generateVerdict(
  caseType: CaseType,
  answers: Array<{ question: string; answer: string }>,
  story: string,
): Promise<Verdict> {
  const contents = buildVerdictUserPrompt(answers, story);
  const baseConfig = {
    systemInstruction: buildVerdictSystemPrompt(caseType),
    responseMimeType: "application/json",
    responseSchema: VERDICT_SCHEMA,
    temperature: 0.5,
  };

  try {
    const verdict = await generateJson<Verdict>({
      model: MODELS.judge,
      contents,
      config: { ...baseConfig, thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM } },
      retries: 2,
    });
    return normalizeVerdict(verdict);
  } catch (err) {
    if (!isRetryable(err)) throw err;
    // El modelo principal sigue sobrecargado: usamos el de respaldo (sigue siendo IA real).
    const verdict = await generateJson<Verdict>({
      model: MODELS.judgeFallback,
      contents,
      config: { ...baseConfig, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      retries: 1,
    });
    return normalizeVerdict(verdict);
  }
}

/** Asegura que el veredicto tenga valores coherentes y seguros. */
function normalizeVerdict(v: Verdict): Verdict {
  const score = clamp(Math.round(Number(v.score) || 0), 0, 100);
  return {
    score,
    level: levelFromScore(score),
    headline: v.headline ?? "Evaluación del caso",
    summary: v.summary ?? "",
    strengths: v.strengths ?? [],
    weaknesses: v.weaknesses ?? [],
    recommendations: v.recommendations ?? [],
    nextSteps: v.nextSteps ?? [],
    factors: v.factors ?? [],
  };
}

function levelFromScore(score: number): Verdict["level"] {
  if (score >= 70) return "alto";
  if (score >= 40) return "moderado";
  return "bajo";
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
