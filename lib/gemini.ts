import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import type { Schema, ContentListUnion } from "@google/genai";
import type { Verdict } from "./types";
import { buildEvaluationSystemPrompt, buildEvaluationUserPrompt } from "./prompts";

/** Modelos elegidos según la página de precios de Gemini (solo 3.x). */
export const MODELS = {
  /** Evaluación del caso: el más inteligente, para el razonamiento del expediente. */
  judge: "gemini-3.5-flash",
  /** Respaldo si el modelo principal está sobrecargado (503/429). Sigue siendo IA real. */
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
  contents: ContentListUnion;
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

const VERDICT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.INTEGER },
    level: { type: Type.STRING, enum: ["bajo", "moderado", "alto"] },
    headline: { type: Type.STRING },
    summary: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    prepLevel: { type: Type.STRING, enum: ["A", "B", "C"] },
    prepFactors: { type: Type.ARRAY, items: { type: Type.STRING } },
    matrix: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          element: { type: Type.STRING },
          status: { type: Type.STRING, enum: ["solido", "refuerzo", "critico"] },
          note: { type: Type.STRING },
        },
        required: ["element", "status", "note"],
      },
    },
    crossExam: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "score",
    "level",
    "headline",
    "summary",
    "strengths",
    "weaknesses",
    "prepLevel",
    "prepFactors",
    "matrix",
    "crossExam",
  ],
};

/** Documento del caso: PDF (bytes en base64) o texto ya extraído (.docx/.txt). */
export type CaseDocument =
  | { kind: "pdf"; base64: string }
  | { kind: "text"; text: string };

/**
 * Evalúa el caso de reforzamiento de asilo a partir del documento.
 * Usa gemini-3.5-flash; si está sobrecargado, cae a gemini-3.1-flash-lite.
 */
export async function evaluateCase(doc: CaseDocument): Promise<Verdict> {
  const contents: ContentListUnion =
    doc.kind === "pdf"
      ? [
          { inlineData: { mimeType: "application/pdf", data: doc.base64 } },
          { text: buildEvaluationUserPrompt() },
        ]
      : [
          {
            text: `${buildEvaluationUserPrompt()}\n\nContenido del documento:\n"""\n${doc.text}\n"""`,
          },
        ];

  const baseConfig = {
    systemInstruction: buildEvaluationSystemPrompt(),
    responseMimeType: "application/json",
    responseSchema: VERDICT_SCHEMA,
    temperature: 0.4,
  };

  try {
    // Thinking LOW: con MEDIUM la evaluación de un PDF tardaba ~2 minutos, lo que
    // supera el corte de ~60 s de los navegadores móviles (Safari) y tumbaba la
    // función en producción. LOW mantiene la calidad con el prompt estructurado.
    const verdict = await generateJson<Verdict>({
      model: MODELS.judge,
      contents,
      config: { ...baseConfig, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      retries: 2,
    });
    return normalizeVerdict(verdict);
  } catch (err) {
    if (!isRetryable(err)) throw err;
    const verdict = await generateJson<Verdict>({
      model: MODELS.judgeFallback,
      contents,
      config: { ...baseConfig, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } },
      retries: 1,
    });
    return normalizeVerdict(verdict);
  }
}

const PREP_LEVELS = new Set(["A", "B", "C"]);
const MATRIX_STATUSES = new Set(["solido", "refuerzo", "critico"]);

/** Asegura que el resultado tenga valores coherentes y seguros. */
function normalizeVerdict(v: Verdict): Verdict {
  const score = clamp(Math.round(Number(v.score) || 0), 0, 100);
  return {
    score,
    level: levelFromScore(score),
    headline: v.headline ?? "Evaluación de tu caso",
    summary: v.summary ?? "",
    strengths: (v.strengths ?? []).slice(0, 3),
    weaknesses: (v.weaknesses ?? []).slice(0, 3),
    prepLevel: PREP_LEVELS.has(v.prepLevel) ? v.prepLevel : score >= 70 ? "A" : score >= 40 ? "B" : "C",
    prepFactors: (v.prepFactors ?? []).slice(0, 3),
    matrix: (v.matrix ?? [])
      .filter((m) => m && MATRIX_STATUSES.has(m.status))
      .slice(0, 8),
    crossExam: (v.crossExam ?? []).slice(0, 5),
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
