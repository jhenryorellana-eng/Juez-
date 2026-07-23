import { GoogleGenAI, Type, ThinkingLevel, FileState } from "@google/genai";
import type { Schema, ContentListUnion, Part } from "@google/genai";
import type { Verdict, Informe, ClienteInfo } from "./types";
import {
  buildEvaluationSystemPrompt,
  buildEvaluationUserPrompt,
  buildInformeSystemPrompt,
  buildCountryResearchPrompt,
} from "./prompts";

/** Modelos elegidos según la página de precios de Gemini (solo 3.x). */
export const MODELS = {
  /** Evaluación del caso: el más inteligente, para el razonamiento del expediente. */
  judge: "gemini-3.5-flash",
  /** Respaldo si el modelo principal está sobrecargado (503/429). Sigue siendo IA real. */
  judgeFallback: "gemini-3.1-flash-lite",
} as const;

/**
 * Hasta este tamaño un PDF viaja inline en la petición; por encima se sube a la
 * Files API de Gemini (el total inline está limitado a ~20 MB por solicitud).
 */
const INLINE_PDF_LIMIT = 7 * 1024 * 1024;
const INLINE_TOTAL_LIMIT = 14 * 1024 * 1024;

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

/** Documento ya preparado en el servidor (bytes de PDF o texto extraído). */
export type PreparedDoc =
  | { kind: "pdf"; name: string; buffer: Buffer }
  | { kind: "text"; name: string; text: string };

/** Sube un PDF grande a la Files API de Gemini y espera a que esté ACTIVO. */
async function uploadPdfToGemini(name: string, buffer: Buffer): Promise<Part> {
  const client = getClient();
  if (!client) throw new Error("NO_API_KEY");

  const blob = new Blob([new Uint8Array(buffer)], { type: "application/pdf" });
  let file = await client.files.upload({
    file: blob,
    config: { mimeType: "application/pdf", displayName: name },
  });

  const deadline = Date.now() + 150_000;
  while (file.state === FileState.PROCESSING && Date.now() < deadline) {
    await sleep(2500);
    file = await client.files.get({ name: file.name ?? "" });
  }
  if (file.state !== FileState.ACTIVE || !file.uri) {
    throw new Error(`FILE_NOT_ACTIVE:${name}`);
  }
  return { fileData: { fileUri: file.uri, mimeType: "application/pdf" } };
}

/** Convierte los documentos en partes del mensaje (inline, Files API o texto). */
async function buildParts(docs: PreparedDoc[]): Promise<Part[]> {
  const parts: Part[] = [];
  let inlineBudget = INLINE_TOTAL_LIMIT;

  for (const [i, doc] of docs.entries()) {
    const header = `--- DOCUMENTO ${i + 1} de ${docs.length}: ${doc.name} ---`;
    if (doc.kind === "text") {
      parts.push({ text: `${header}\n${doc.text}` });
      continue;
    }
    parts.push({ text: header });
    if (doc.buffer.length <= INLINE_PDF_LIMIT && doc.buffer.length <= inlineBudget) {
      inlineBudget -= doc.buffer.length;
      parts.push({
        inlineData: { mimeType: "application/pdf", data: doc.buffer.toString("base64") },
      });
    } else {
      parts.push(await uploadPdfToGemini(doc.name, doc.buffer));
    }
  }
  return parts;
}

/**
 * Evalúa el caso a partir de 1-10 documentos.
 * Usa gemini-3.5-flash; si está sobrecargado, cae a gemini-3.1-flash-lite.
 */
export async function evaluateCase(docs: PreparedDoc[]): Promise<Verdict> {
  const parts = await buildParts(docs);
  const contents: ContentListUnion = [
    ...parts,
    { text: buildEvaluationUserPrompt(docs.length) },
  ];

  const baseConfig = {
    systemInstruction: buildEvaluationSystemPrompt(),
    responseMimeType: "application/json",
    responseSchema: VERDICT_SCHEMA,
    temperature: 0.4,
  };

  try {
    // Thinking LOW: MEDIUM tardaba ~2 min por documento, por encima del corte de
    // ~60 s de los navegadores móviles. LOW mantiene la calidad con el prompt estructurado.
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

/** Resultado de la investigación en internet sobre el país del solicitante. */
export interface CountryResearch {
  texto: string;
  fuentes: string[];
}

/**
 * Detecta el país de origen leyendo el expediente (solo cuando el cliente no lo dio).
 * Llamada corta y barata con el modelo lite.
 */
async function detectCountry(parts: Part[]): Promise<string> {
  const client = getClient();
  if (!client) return "";
  try {
    const response = await client.models.generateContent({
      model: MODELS.judgeFallback,
      contents: [
        ...parts,
        {
          text: "¿Cuál es el país de origen del solicitante de asilo según estos documentos? Responde SOLO el nombre del país en español, sin nada más. Si no consta, responde exactamente: desconocido",
        },
      ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        temperature: 0,
      },
    });
    const pais = (response.text ?? "").trim().split("\n")[0].slice(0, 40);
    return /desconocido/i.test(pais) ? "" : pais;
  } catch {
    return "";
  }
}

/**
 * Busca en internet (Google Search grounding) casos de asilo GANADOS del país del
 * solicitante, priorizando fuentes oficiales del gobierno de EE. UU. Si la búsqueda
 * falla, el informe se genera igualmente sin esta sección enriquecida.
 */
export async function researchCountryCases(pais: string): Promise<CountryResearch | null> {
  const client = getClient();
  if (!client || !pais) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: MODELS.judge,
        contents: [{ text: buildCountryResearchPrompt(pais) }],
        config: {
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          temperature: 0.3,
        },
      });
      const texto = (response.text ?? "").trim();
      if (!texto) return null;

      // El título del chunk es el dominio legible (ej. "justice.gov"); la URI es un
      // redirect opaco de vertexaisearch, inservible en un documento impreso.
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const fuentes = [
        ...new Set(
          chunks
            .map((c) => (c.web?.title || c.web?.uri || "").trim())
            .filter((f) => f.length > 0),
        ),
      ].slice(0, 6);
      return { texto, fuentes };
    } catch (err) {
      if (attempt === 0 && isRetryable(err)) {
        await sleep(900);
        continue;
      }
      console.error("[gemini:research] búsqueda fallida:", (err as Error).message);
      return null;
    }
  }
  return null;
}

/** Campos adicionales del informe premium sobre el schema del diagnóstico. */
const INFORME_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    ...VERDICT_SCHEMA.properties,
    miedoCreible: {
      type: Type.OBJECT,
      properties: {
        analisis: { type: Type.STRING },
        subjetivo: { type: Type.STRING },
        objetivo: { type: Type.STRING },
        nexo: { type: Type.STRING },
      },
      required: ["analisis", "subjetivo", "objetivo", "nexo"],
    },
    investigacionPais: {
      type: Type.OBJECT,
      properties: {
        resumen: { type: Type.STRING },
        casos: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              referencia: { type: Type.STRING },
              resumen: { type: Type.STRING },
            },
            required: ["referencia", "resumen"],
          },
        },
      },
      required: ["resumen", "casos"],
    },
    guiaDetalles: {
      type: Type.OBJECT,
      properties: {
        introduccion: { type: Type.STRING },
        ejemploVago: { type: Type.STRING },
        ejemploDetallado: { type: Type.STRING },
        puntos: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              titulo: { type: Type.STRING },
              instruccion: { type: Type.STRING },
            },
            required: ["titulo", "instruccion"],
          },
        },
      },
      required: ["introduccion", "ejemploVago", "ejemploDetallado", "puntos"],
    },
    materia: { type: Type.STRING },
    paisDetectado: { type: Type.STRING },
    estadoActual: { type: Type.STRING },
    debilidades: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          titulo: { type: Type.STRING },
          detalle: { type: Type.STRING },
          accion: { type: Type.STRING },
        },
        required: ["titulo", "detalle", "accion"],
      },
    },
    reforzamiento: { type: Type.ARRAY, items: { type: Type.STRING } },
    normas: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ref: { type: Type.STRING },
          texto: { type: Type.STRING },
        },
        required: ["ref", "texto"],
      },
    },
    beneficios: { type: Type.ARRAY, items: { type: Type.STRING } },
    recomendacionFinal: { type: Type.STRING },
    opcionRecomendada: { type: Type.STRING, enum: ["plataforma", "abogado"] },
    opcionJustificacion: { type: Type.STRING },
  },
  required: [
    ...(VERDICT_SCHEMA.required ?? []),
    "miedoCreible",
    "investigacionPais",
    "guiaDetalles",
    "materia",
    "paisDetectado",
    "estadoActual",
    "debilidades",
    "reforzamiento",
    "normas",
    "beneficios",
    "recomendacionFinal",
    "opcionRecomendada",
    "opcionJustificacion",
  ],
};

/**
 * Genera el informe premium completo (diagnóstico + secciones del informe).
 * Corre en segundo plano: usa thinking MEDIUM para máxima profundidad.
 */
export async function generateInforme(
  docs: PreparedDoc[],
  cliente: ClienteInfo,
): Promise<Informe> {
  const parts = await buildParts(docs);
  const contents: ContentListUnion = [
    ...parts,
    { text: buildEvaluationUserPrompt(docs.length) },
  ];

  // País del cliente, o detectado en el expediente; con él se investiga en internet
  // el panorama de casos ganados (si falla, el informe sale sin esa investigación).
  const pais = cliente.pais.trim() || (await detectCountry(parts));
  const research = await researchCountryCases(pais);

  const baseConfig = {
    systemInstruction: buildInformeSystemPrompt(cliente.nombre, pais, research?.texto),
    responseMimeType: "application/json",
    responseSchema: INFORME_SCHEMA,
    temperature: 0.4,
  };

  try {
    const informe = await generateJson<Informe>({
      model: MODELS.judge,
      contents,
      config: { ...baseConfig, thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM } },
      retries: 2,
    });
    return normalizeInforme(informe, research?.fuentes ?? []);
  } catch (err) {
    if (!isRetryable(err)) throw err;
    const informe = await generateJson<Informe>({
      model: MODELS.judgeFallback,
      contents,
      config: { ...baseConfig, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      retries: 1,
    });
    return normalizeInforme(informe, research?.fuentes ?? []);
  }
}

function normalizeInforme(i: Informe, fuentes: string[]): Informe {
  const base = normalizeVerdict(i);
  return {
    ...base,
    miedoCreible: {
      analisis: i.miedoCreible?.analisis ?? "",
      subjetivo: i.miedoCreible?.subjetivo ?? "",
      objetivo: i.miedoCreible?.objetivo ?? "",
      nexo: i.miedoCreible?.nexo ?? "",
    },
    investigacionPais: {
      resumen: i.investigacionPais?.resumen ?? "",
      casos: (i.investigacionPais?.casos ?? []).slice(0, 5),
      // Las fuentes vienen SIEMPRE del grounding real de la búsqueda, no del modelo.
      fuentes,
    },
    guiaDetalles: {
      introduccion: i.guiaDetalles?.introduccion ?? "",
      ejemploVago: i.guiaDetalles?.ejemploVago ?? "",
      ejemploDetallado: i.guiaDetalles?.ejemploDetallado ?? "",
      puntos: (i.guiaDetalles?.puntos ?? []).slice(0, 10),
    },
    materia: i.materia?.trim() || "Asilo y protecciones relacionadas",
    paisDetectado: i.paisDetectado ?? "",
    estadoActual: i.estadoActual ?? "",
    debilidades: (i.debilidades ?? []).slice(0, 5),
    reforzamiento: (i.reforzamiento ?? []).slice(0, 10),
    normas: (i.normas ?? []).slice(0, 7),
    beneficios: (i.beneficios ?? []).slice(0, 8),
    recomendacionFinal: i.recomendacionFinal ?? "",
    opcionRecomendada: i.opcionRecomendada === "plataforma" ? "plataforma" : "abogado",
    opcionJustificacion: i.opcionJustificacion ?? "",
  };
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
