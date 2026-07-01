import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { evaluateCase, type CaseDocument } from "@/lib/gemini";
import { buildDemoVerdict } from "@/lib/demo";
import { getClientIp, rateLimit } from "@/lib/ratelimit";
import { MAX_FILE_BYTES, MAX_FILE_MB } from "@/lib/analysis";
import type { VerdictResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Texto máximo que se envía al modelo (los .docx/.txt muy largos se recortan). */
const MAX_TEXT_CHARS = 120_000;

export async function POST(request: Request) {
  const limit = rateLimit(`evaluate:${getClientIp(request)}`, 6);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let file: File;
  try {
    const form = await request.formData();
    const entry = form.get("file");
    if (!(entry instanceof File) || entry.size === 0) {
      return NextResponse.json(
        { error: "No recibimos ningún archivo." },
        { status: 400 },
      );
    }
    file = entry;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `El archivo supera los ${MAX_FILE_MB} MB. Sube una versión más ligera.` },
      { status: 413 },
    );
  }

  const name = file.name.toLowerCase();
  let doc: CaseDocument;
  let contentLength = file.size;

  try {
    if (name.endsWith(".pdf")) {
      const bytes = Buffer.from(await file.arrayBuffer());
      doc = { kind: "pdf", base64: bytes.toString("base64") };
    } else if (name.endsWith(".docx")) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { value } = await mammoth.extractRawText({ buffer });
      const text = value.trim().slice(0, MAX_TEXT_CHARS);
      if (text.length < 40) {
        return NextResponse.json(
          { error: "El documento parece estar vacío. Revisa el archivo e inténtalo de nuevo." },
          { status: 422 },
        );
      }
      contentLength = text.length;
      doc = { kind: "text", text };
    } else if (name.endsWith(".txt")) {
      const text = (await file.text()).trim().slice(0, MAX_TEXT_CHARS);
      if (text.length < 40) {
        return NextResponse.json(
          { error: "El documento parece estar vacío. Revisa el archivo e inténtalo de nuevo." },
          { status: 422 },
        );
      }
      contentLength = text.length;
      doc = { kind: "text", text };
    } else if (name.endsWith(".doc")) {
      return NextResponse.json(
        { error: "Los archivos .doc antiguos no son compatibles. Guárdalo como PDF o .docx e inténtalo de nuevo." },
        { status: 415 },
      );
    } else {
      return NextResponse.json(
        { error: "Formato no compatible. Sube tu caso en PDF o Word (.docx)." },
        { status: 415 },
      );
    }
  } catch (error) {
    console.error("[evaluate] error leyendo el archivo:", (error as Error).message);
    return NextResponse.json(
      { error: "No pudimos leer el archivo. Revisa que no esté dañado e inténtalo de nuevo." },
      { status: 422 },
    );
  }

  try {
    const verdict = await evaluateCase(doc);
    const payload: VerdictResponse = { ...verdict };
    return NextResponse.json(payload);
  } catch (error) {
    // Sin API key o fallo total de la IA: resultado de demostración.
    console.error("[evaluate] fallback por:", (error as Error).message);
    const payload: VerdictResponse = { ...buildDemoVerdict(contentLength), demo: true };
    return NextResponse.json(payload);
  }
}
