import { NextResponse } from "next/server";
import { CASE_TYPES, FALLBACK_QUESTIONS, getCaseType } from "@/lib/cases";
import { generateQuestions } from "@/lib/gemini";
import { getClientIp, rateLimit } from "@/lib/ratelimit";
import type { CaseTypeId, QuestionsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_IDS = new Set(CASE_TYPES.map((c) => c.id));

export async function POST(request: Request) {
  const limit = rateLimit(`questions:${getClientIp(request)}`, 12);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let caseTypeId: CaseTypeId;
  try {
    const body = (await request.json()) as { caseTypeId?: string };
    if (!body.caseTypeId || !VALID_IDS.has(body.caseTypeId as CaseTypeId)) {
      return NextResponse.json(
        { error: "Tipo de caso inválido." },
        { status: 400 },
      );
    }
    caseTypeId = body.caseTypeId as CaseTypeId;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const caseType = getCaseType(caseTypeId)!;

  try {
    const questions = await generateQuestions(caseType);
    const payload: QuestionsResponse = { questions };
    return NextResponse.json(payload);
  } catch (error) {
    // Sin API key o fallo de generación: usamos preguntas de respaldo.
    console.error("[questions] fallback por:", (error as Error).message);
    const payload: QuestionsResponse = {
      questions: FALLBACK_QUESTIONS[caseTypeId],
      demo: true,
    };
    return NextResponse.json(payload);
  }
}
