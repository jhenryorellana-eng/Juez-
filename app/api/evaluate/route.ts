import { NextResponse, after } from "next/server";
import mammoth from "mammoth";
import { put, del, list } from "@vercel/blob";
import { evaluateCase, type PreparedDoc } from "@/lib/gemini";
import { buildDemoVerdict } from "@/lib/demo";
import { getClientIp, rateLimit } from "@/lib/ratelimit";
import { MAX_FILE_BYTES, MAX_FILE_MB, MAX_FILES } from "@/lib/analysis";
import type { VerdictResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Texto máximo por documento (.docx/.txt) que se envía al modelo. */
const MAX_TEXT_CHARS = 300_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface BlobFileRef {
  url: string;
  name: string;
}

type JobResult =
  | { status: "done"; verdict: VerdictResponse }
  | { status: "error"; error: string };

/* -------------------------------------------------------------------------- */
/*  GET /api/evaluate?id=<jobId> — consulta el estado del análisis             */
/* -------------------------------------------------------------------------- */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
  }

  try {
    const { blobs } = await list({ prefix: `resultados/${id}.json`, limit: 1 });
    if (blobs.length === 0) {
      return NextResponse.json({ status: "pending" }, { status: 202 });
    }
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    const result = (await res.json()) as JobResult;
    // El resultado se sirve una vez y se borra (privacidad).
    await del(blobs[0].url).catch(() => {});
    return NextResponse.json(result);
  } catch (error) {
    console.error("[evaluate:get] error:", (error as Error).message);
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }
}

/* -------------------------------------------------------------------------- */
/*  POST /api/evaluate                                                         */
/*  - multipart/form-data  → archivos pequeños, respuesta directa             */
/*  - application/json     → refs de Vercel Blob, trabajo en segundo plano    */
/* -------------------------------------------------------------------------- */
export async function POST(request: Request) {
  const limit = rateLimit(`evaluate:${getClientIp(request)}`, 6);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  return contentType.includes("application/json")
    ? handleBlobJob(request)
    : handleDirect(request);
}

/** Camino directo: los archivos vienen en el propio request (total < 4.5 MB). */
async function handleDirect(request: Request): Promise<NextResponse> {
  let files: File[];
  try {
    const form = await request.formData();
    files = form.getAll("file").filter((e): e is File => e instanceof File && e.size > 0);
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No recibimos ningún archivo." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Máximo ${MAX_FILES} documentos por evaluación.` },
      { status: 400 },
    );
  }

  try {
    const docs: PreparedDoc[] = [];
    for (const file of files) {
      docs.push(await prepareDoc(file.name, Buffer.from(await file.arrayBuffer())));
    }
    const totalLength = docs.reduce(
      (acc, d) => acc + (d.kind === "pdf" ? d.buffer.length : d.text.length),
      0,
    );
    return NextResponse.json(await runEvaluation(docs, totalLength));
  } catch (error) {
    return docError(error);
  }
}

/** Camino Blob: el navegador ya subió los archivos; procesamos en segundo plano. */
async function handleBlobJob(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "El almacenamiento para archivos grandes no está habilitado en el servidor." },
      { status: 501 },
    );
  }

  let refs: BlobFileRef[];
  try {
    const body = (await request.json()) as { files?: BlobFileRef[] };
    refs = (body.files ?? []).filter(
      (f) => typeof f?.url === "string" && typeof f?.name === "string",
    );
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (refs.length === 0 || refs.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Envía entre 1 y ${MAX_FILES} documentos.` },
      { status: 400 },
    );
  }
  for (const ref of refs) {
    let host: string;
    try {
      host = new URL(ref.url).hostname;
    } catch {
      return NextResponse.json({ error: "URL de archivo inválida." }, { status: 400 });
    }
    if (!host.endsWith(".blob.vercel-storage.com")) {
      return NextResponse.json({ error: "URL de archivo no permitida." }, { status: 400 });
    }
  }

  const jobId = crypto.randomUUID();
  after(() => processJob(jobId, refs));
  return NextResponse.json({ jobId }, { status: 202 });
}

/** Descarga los documentos desde Blob, evalúa y guarda el resultado. */
async function processJob(jobId: string, refs: BlobFileRef[]): Promise<void> {
  let result: JobResult;
  try {
    const docs: PreparedDoc[] = [];
    let totalLength = 0;
    for (const ref of refs) {
      const res = await fetch(ref.url, { cache: "no-store" });
      if (!res.ok) throw new Error(`DOWNLOAD_FAILED:${ref.name}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > MAX_FILE_BYTES) throw new Error(`TOO_LARGE:${ref.name}`);
      const doc = await prepareDoc(ref.name, buffer);
      totalLength += doc.kind === "pdf" ? doc.buffer.length : doc.text.length;
      docs.push(doc);
    }
    result = { status: "done", verdict: await runEvaluation(docs, totalLength) };
  } catch (error) {
    const message = (error as Error).message ?? "";
    console.error("[evaluate:job] error:", message);
    result = {
      status: "error",
      error: message.startsWith("UNSUPPORTED:")
        ? `El archivo "${message.slice(12)}" no es compatible. Usa PDF o Word (.docx).`
        : "No pudimos procesar tus documentos. Revisa que no estén dañados e inténtalo de nuevo.",
    };
  }

  try {
    await put(`resultados/${jobId}.json`, JSON.stringify(result), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
    });
  } catch (error) {
    console.error("[evaluate:job] no se pudo guardar el resultado:", (error as Error).message);
  }

  // Privacidad: los documentos subidos se borran al terminar.
  await del(refs.map((r) => r.url)).catch(() => {});
}

/** Convierte un archivo (nombre + bytes) en un documento evaluable. */
async function prepareDoc(name: string, buffer: Buffer): Promise<PreparedDoc> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return { kind: "pdf", name, buffer };
  }
  if (lower.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer });
    const text = value.trim().slice(0, MAX_TEXT_CHARS);
    if (text.length < 40) throw new Error(`EMPTY:${name}`);
    return { kind: "text", name, text };
  }
  if (lower.endsWith(".txt")) {
    const text = buffer.toString("utf8").trim().slice(0, MAX_TEXT_CHARS);
    if (text.length < 40) throw new Error(`EMPTY:${name}`);
    return { kind: "text", name, text };
  }
  throw new Error(`UNSUPPORTED:${name}`);
}

/** Evalúa con la IA; si falla todo, cae al resultado de demostración. */
async function runEvaluation(
  docs: PreparedDoc[],
  totalLength: number,
): Promise<VerdictResponse> {
  try {
    return { ...(await evaluateCase(docs)) };
  } catch (error) {
    console.error("[evaluate] fallback por:", (error as Error).message);
    return { ...buildDemoVerdict(totalLength), demo: true };
  }
}

/** Errores de preparación de documentos con mensajes claros para el usuario. */
function docError(error: unknown): NextResponse {
  const message = (error as Error).message ?? "";
  if (message.startsWith("UNSUPPORTED:")) {
    const name = message.slice(12);
    const friendly = name.toLowerCase().endsWith(".doc")
      ? `"${name}" es un .doc antiguo. Guárdalo como PDF o .docx e inténtalo de nuevo.`
      : `"${name}" no es compatible. Usa PDF o Word (.docx).`;
    return NextResponse.json({ error: friendly }, { status: 415 });
  }
  if (message.startsWith("EMPTY:")) {
    return NextResponse.json(
      { error: `"${message.slice(6)}" parece estar vacío. Revisa el archivo.` },
      { status: 422 },
    );
  }
  if (message.startsWith("TOO_LARGE:")) {
    return NextResponse.json(
      { error: `"${message.slice(10)}" supera los ${MAX_FILE_MB} MB.` },
      { status: 413 },
    );
  }
  console.error("[evaluate] error leyendo archivos:", message);
  return NextResponse.json(
    { error: "No pudimos leer los archivos. Revisa que no estén dañados." },
    { status: 422 },
  );
}
