import { NextResponse, after } from "next/server";
import {
  storagePut,
  storageReadJson,
  storageDelete,
  storageAvailable,
} from "@/lib/storage";
import { buildInformeFromFiles, type FileRef } from "@/lib/informe-pipeline";
import {
  xlegalConfigured,
  isValidToken,
  hashToken,
  fetchXlegalSession,
  consumeXlegalAttempt,
  deliverXlegalWebhook,
} from "@/lib/xlegal";
import { getClientIp, rateLimit } from "@/lib/ratelimit";
import { MAX_FILES, MAX_FILE_BYTES, MAX_FILE_MB } from "@/lib/analysis";
import type { XlegalJob, XlegalResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const jobPath = (jobId: string) => `xlegal/jobs/${jobId}.json`;
const resultPath = (jobId: string) => `xlegal/results/${jobId}.json`;
const tokenMapPath = (tokenHash: string) => `xlegal/tokens/${tokenHash}.json`;

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
  if (!job || job.tokenHash !== hashToken(token)) {
    return NextResponse.json({ error: "Trabajo no encontrado." }, { status: 404 });
  }

  const result = await storageReadJson<XlegalResult>(resultPath(id));
  if (!result) return NextResponse.json({ status: "pending" }, { status: 202 });

  // Once the webhook landed, our temporary PDF is deleted: swap in the fresh
  // signed download URL from x-legal so the client never gets a dead link.
  if (result.status === "done" && result.webhookDelivered) {
    const { session } = await fetchXlegalSession(token);
    if (session?.pdf.available && session.pdf.downloadUrl) {
      return NextResponse.json({ ...result, pdfUrl: session.pdf.downloadUrl });
    }
  }
  return NextResponse.json(result);
}

/* -------------------------------------------------------------------------- */
/*  POST /api/xlegal/run — validate token, consume the attempt, start the job  */
/*  Accepts JSON { token, files } (blob refs) or multipart form-data with a    */
/*  "token" field plus "file" entries (small totals / local dev without Blob). */
/* -------------------------------------------------------------------------- */
export async function POST(request: Request) {
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
  const mapping = await storageReadJson<{ jobId: string }>(tokenMapPath(tokenHash));
  if (mapping?.jobId) {
    const prior = await storageReadJson<XlegalResult>(resultPath(mapping.jobId));
    if (prior?.status !== "error") {
      return NextResponse.json({ jobId: mapping.jobId }, { status: 202 });
    }
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
    after(() => processXlegalJob(jobId, job, token, origin));
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

/* -------------------------------------------------------------------------- */
/*  Background job: generate → store → webhook → clean up                      */
/* -------------------------------------------------------------------------- */
async function processXlegalJob(
  jobId: string,
  job: XlegalJob,
  token: string,
  origin: string,
): Promise<void> {
  try {
    const { informe, pdf } = await buildInformeFromFiles(job.files, job.cliente);

    // Local-dev storage returns a relative URL; the webhook consumer (x-legal
    // or the mock) needs an absolute one to download the PDF.
    const storedPdfUrl = await storagePut(
      `xlegal/informes/informe-${jobId}.pdf`,
      pdf,
      "application/pdf",
    );
    const publicPdfUrl = storedPdfUrl.startsWith("/")
      ? `${origin}${storedPdfUrl}`
      : storedPdfUrl;

    const completedAt = new Date().toISOString();
    const result: Extract<XlegalResult, { status: "done" }> = {
      status: "done",
      informe,
      pdfUrl: publicPdfUrl,
      cliente: job.cliente,
      completedAt,
      webhookDelivered: false,
    };
    await storagePut(resultPath(jobId), JSON.stringify(result), "application/json");

    const delivered = await deliverXlegalWebhook({
      event: "evaluation.completed",
      token,
      jobId,
      completedAt,
      result: {
        pdfUrl: publicPdfUrl,
        score: informe.score,
        nivel: informe.level,
        headline: informe.headline,
      },
    });

    if (delivered) {
      // x-legal stored the PDF: remove the client docs and our temporary copy.
      await storageDelete([...job.files.map((f) => f.url), storedPdfUrl]).catch(
        () => {},
      );
      await storagePut(
        resultPath(jobId),
        JSON.stringify({ ...result, webhookDelivered: true }),
        "application/json",
      );
    }
    // If every webhook attempt failed the PDF stays put: /api/xlegal/status is
    // the reconciliation path and x-legal will pull the result from there.
  } catch (error) {
    console.error(`[xlegal:job] generation failed (${jobId}):`, (error as Error).message);
    const result: XlegalResult = { status: "error", error: "GENERATION_FAILED" };
    await storagePut(resultPath(jobId), JSON.stringify(result), "application/json").catch(
      () => {},
    );
    await deliverXlegalWebhook({
      event: "evaluation.failed",
      token,
      jobId,
      error: "GENERATION_FAILED",
    });
    // Privacy: client documents never outlive the job, even on failure.
    await storageDelete(job.files.map((f) => f.url)).catch(() => {});
  }
}

function resolveOrigin(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}
