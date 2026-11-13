import { NextResponse, after } from "next/server";
import { storagePut, storageReadJson, storageAvailable } from "@/lib/storage";
import type { FileRef } from "@/lib/informe-pipeline";
import {
  xlegalConfigured,
  isValidToken,
  hashToken,
  fetchXlegalSession,
  consumeXlegalAttempt,
  resolveResumableJob,
  jobPath,
  resultPath,
  tokenMapPath,
} from "@/lib/xlegal";
import { processXlegalJob, resolveOrigin } from "@/lib/xlegal-job";
import { pollAnswerWithoutJob } from "@/lib/xlegal-closeout";
import { getClientIp, rateLimit } from "@/lib/ratelimit";
import { MAX_FILES, MAX_FILE_BYTES, MAX_FILE_MB } from "@/lib/analysis";
import type { XlegalJob, XlegalResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/* -------------------------------------------------------------------------- */
/*  GET /api/xlegal/run?id=<jobId>&t=<token> — client polling                  */
/* -------------------------------------------------------------------------- */
export async function GET(request: Request) {
  const limit = rateLimit(`xlegal-poll:${getClientIp(request)}`, 40);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!UUID_RE.test(id) || !isValidToken(token)) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  // The poll is authenticated: the token hash must match the one on the job.
  const job = await storageReadJson<XlegalJob>(jobPath(id));
  if (!job) return answerWithoutJob(id, token);
  if (job.tokenHash !== hashToken(token)) {
    return NextResponse.json({ error: "Trabajo no encontrado." }, { status: 404 });
  }

  const result = await storageReadJson<XlegalResult>(resultPath(id));
  if (!result) return NextResponse.json({ status: "pending" }, { status: 202 });

  // Once the webhook landed, our temporary PDF is deleted: swap in the fresh
  // signed download URL from x-legal so the client never gets a dead link.
  // A delivered result no longer carries the report (lib/xlegal-closeout.ts), so
  // the client shows the download without the score.
  if (result.status === "done" && result.webhookDelivered) {
    const { session } = await fetchXlegalSession(token);
    if (session?.pdf.available && session.pdf.downloadUrl) {
      return NextResponse.json({ ...result, pdfUrl: session.pdf.downloadUrl });
    }
  }
  return NextResponse.json(result);
}

/**
 * The job record is gone. Since 2026-11-12 that is what a closed job looks
 * like: once x-legal acknowledges the webhook (report or failure), the record
 * (name, email, documents) is deleted — possibly while this client is still
 * polling. The result decides (lib/xlegal-closeout.ts → pollAnswerWithoutJob):
 *  - a failed job → its error code, the only thing kept of it;
 *  - a delivered report → x-legal is the source of truth, so ask it: if this
 *    token's report is there, the job is done. The jobId cannot be checked
 *    against the token any more, but nothing leaks: the answer is only this
 *    token's own download link, which the page already hands to whoever holds
 *    the token;
 *  - no result, but this token's own mapping points at the jobId (a delivery
 *    whose redaction failed, so the result was deleted) → ask x-legal as well;
 *  - anything else (an unknown jobId included) → 404, which the client treats
 *    as "keep polling". A made-up jobId never reaches x-legal.
 */
async function answerWithoutJob(id: string, token: string) {
  const notFound = () => NextResponse.json({ error: "Trabajo no encontrado." }, { status: 404 });
  const result = await storageReadJson<XlegalResult>(resultPath(id));
  // Only without a result: the token's mapping is what still binds this jobId
  // to the token once the delivered result had to be deleted.
  const mapping = result
    ? null
    : await storageReadJson<{ jobId?: string }>(tokenMapPath(hashToken(token)));
  const answer = pollAnswerWithoutJob(result, mapping?.jobId === id);
  if (answer === "error" && result?.status === "error") {
    return NextResponse.json({ status: "error", error: result.error });
  }
  if (answer !== "ask-xlegal") return notFound();

  const { session } = await fetchXlegalSession(token);
  if (session?.pdf.available && session.pdf.downloadUrl) {
    return NextResponse.json({
      status: "done",
      webhookDelivered: true,
      pdfUrl: session.pdf.downloadUrl,
    });
  }
  return notFound();
}

/* -------------------------------------------------------------------------- */
/*  POST /api/xlegal/run — validate token, consume the attempt, start the job  */
/*  Accepts JSON { token, files } (blob refs) or multipart form-data with a    */
/*  "token" field plus "file" entries (small totals / local dev without Blob). */
/* -------------------------------------------------------------------------- */
export async function POST(request: Request) {
  // Start of the maxDuration clock: everything below (uploads included) spends
  // from the same budget the background job will later have to fit into.
  const requestStartedAt = Date.now();
  const ipLimit = rateLimit(`xlegal-run:${getClientIp(request)}`, 5);
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfter) } },
    );
  }

  if (!xlegalConfigured() || !storageAvailable()) {
    return NextResponse.json(
      { error: "La integración con x-legal no está habilitada en el servidor." },
      { status: 501 },
    );
  }

  const jobId = crypto.randomUUID();
  const contentType = request.headers.get("content-type") ?? "";

  let token: string;
  let files: FileRef[];
  let pendingUploads: Array<{ name: string; buffer: Buffer; type: string }> = [];

  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { token?: string; files?: FileRef[] };
      token = body.token ?? "";
      files = (body.files ?? []).filter(
        (f) => typeof f?.url === "string" && typeof f?.name === "string",
      );
      for (const f of files) {
        let host: string;
        try {
          host = new URL(f.url).hostname;
        } catch {
          return NextResponse.json({ error: "URL de archivo inválida." }, { status: 400 });
        }
        if (!host.endsWith(".blob.vercel-storage.com")) {
          return NextResponse.json({ error: "URL de archivo no permitida." }, { status: 400 });
        }
      }
    } else {
      const form = await request.formData();
      token = String(form.get("token") ?? "");
      const entries = form
        .getAll("file")
        .filter((e): e is File => e instanceof File && e.size > 0);
      for (const file of entries) {
        if (file.size > MAX_FILE_BYTES) {
          return NextResponse.json(
            { error: `"${file.name}" supera los ${MAX_FILE_MB} MB.` },
            { status: 413 },
          );
        }
        pendingUploads.push({
          name: file.name,
          buffer: Buffer.from(await file.arrayBuffer()),
          type: file.type || "application/octet-stream",
        });
      }
      files = [];
    }
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Este enlace no es válido." }, { status: 400 });
  }
  const tokenHash = hashToken(token);

  const tokenLimit = rateLimit(`xlegal-run:${tokenHash}`, 3);
  if (!tokenLimit.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(tokenLimit.retryAfter) } },
    );
  }

  const fileCount = files.length + pendingUploads.length;
  if (fileCount === 0 || fileCount > MAX_FILES) {
    return NextResponse.json(
      { error: `Envía entre 1 y ${MAX_FILES} documentos.` },
      { status: 400 },
    );
  }

  // x-legal is the source of truth for attempts and delivery state.
  const { status, session } = await fetchXlegalSession(token);
  if (!session) {
    return NextResponse.json(
      { error: "Este enlace no es válido o ya venció." },
      { status: status === 404 ? 404 : 502 },
    );
  }
  if (session.pdf.available) {
    return NextResponse.json({ alreadyDelivered: true });
  }

  // Resume: a reload during/after generation reuses the same job, no new attempt.
  // A job that died without ever writing a result stops being resumable once its
  // window passes, so the token is never wedged. resolveResumableJob is the only
  // place that decides this — the server page asks it the very same question.
  const resume = await resolveResumableJob(tokenHash);
  if (resume.kind !== "none") {
    return NextResponse.json({ jobId: resume.jobId }, { status: 202 });
  }

  if (session.attemptsAllowed - session.attemptsUsed <= 0) {
    return NextResponse.json(
      { error: "Ya no te quedan intentos disponibles." },
      { status: 409 },
    );
  }

  try {
    for (const [i, up] of pendingUploads.entries()) {
      const safeName = up.name.replace(/[^\w. -]/g, "_");
      const url = await storagePut(
        `xlegal/docs/${jobId}/${i}-${safeName}`,
        up.buffer,
        up.type,
      );
      files.push({ url, name: up.name });
    }

    const job: XlegalJob = {
      status: "pending",
      tokenHash,
      cliente: session.cliente,
      files,
      createdAt: new Date().toISOString(),
      source: "page",
    };
    await storagePut(jobPath(jobId), JSON.stringify(job), "application/json");

    const consumed = await consumeXlegalAttempt(token, jobId);
    if (!consumed.ok) {
      if (consumed.status === 409) {
        return NextResponse.json(
          { error: "Ya no te quedan intentos disponibles." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "No pudimos validar tu sesión con x-legal. Inténtalo de nuevo." },
        { status: 502 },
      );
    }

    await storagePut(tokenMapPath(tokenHash), JSON.stringify({ jobId }), "application/json");
    await storagePut(
      jobPath(jobId),
      JSON.stringify({ ...job, status: "processing" satisfies XlegalJob["status"] }),
      "application/json",
    );

    const origin = resolveOrigin(request);
    after(() => processXlegalJob(jobId, job, token, origin, requestStartedAt));
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (error) {
    console.error(
      `[xlegal:run] job start failed (${tokenHash.slice(0, 8)}):`,
      (error as Error).message,
    );
    return NextResponse.json(
      { error: "No pudimos iniciar tu evaluación. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}
