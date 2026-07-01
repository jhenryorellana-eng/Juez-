import { NextResponse } from "next/server";
import { CASE_TYPES, getCaseType } from "@/lib/cases";
import { generateVerdict } from "@/lib/gemini";
import { buildDemoVerdict } from "@/lib/demo";
import { getClientIp, rateLimit } from "@/lib/ratelimit";
import type { CaseTypeId, VerdictResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_IDS = new Set(CASE_TYPES.map((c) => c.id));

interface VerdictBody {
  caseTypeId?: string;
  answers?: Record<string, string>;
  story?: string;
}

export async function POST(request: Request) {
  const limit = rateLimit(`verdict:${getClientIp(request)}`, 6);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: VerdictBody;
  try {
    body = (await request.json()) as VerdictBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  if (!body.caseTypeId || !VALID_IDS.has(body.caseTypeId as CaseTypeId)) {
    return NextResponse.json(
      { error: "Tipo de caso inválido." },
      { status: 400 },
    );
  }

  const caseType = getCaseType(body.caseTypeId as CaseTypeId)!;
  const answers = normalizeAnswers(body.answers);
  const story = typeof body.story === "string" ? body.story : "";

  try {
    const verdict = await generateVerdict(caseType, answers, story);
    const payload: VerdictResponse = { ...verdict };
    return NextResponse.json(payload);
  } catch (error) {
    // Sin API key o fallo de la IA: veredicto de demostración.
    console.error("[verdict] fallback por:", (error as Error).message);
    const verdict = buildDemoVerdict(caseType, answers, story);
    const payload: VerdictResponse = { ...verdict, demo: true };
    return NextResponse.json(payload);
  }
}

/** Convierte el map de respuestas en pares pregunta/respuesta limpios. */
function normalizeAnswers(
  raw: Record<string, string> | undefined,
): Array<{ question: string; answer: string }> {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw)
    .filter(([, answer]) => typeof answer === "string")
    .map(([question, answer]) => ({
      question: String(question).slice(0, 400),
      answer: String(answer).slice(0, 4000),
    }));
}
