import { NextResponse, after } from "next/server";
import { storagePut, storageReadJson, storageAvailable } from "@/lib/storage";
import {
  xlegalConfigured,
  apiKeyMatches,
  isValidToken,
  hashToken,
  isAllowedJobDocumentUrl,
  jobPath,
  resultPath,
} from "@/lib/xlegal";
import { processXlegalJob, resolveOrigin } from "@/lib/xlegal-job";
import { getClientIp, rateLimit } from "@/lib/ratelimit";
import { ACCEPTED_EXTENSIONS, MAX_FILES } from "@/lib/analysis";
import type { ClienteInfo, XlegalJob, XlegalResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface JobRequest {
  jobId?: unknown;
  token?: unknown;
  cliente?: { nombre?: unknown; email?: unknown; pais?: unknown };
  files?: Array<{ url?: unknown; name?: unknown }>;
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/* -------------------------------------------------------------------------- */
/*  POST /api/xlegal/jobs — x-legal starts an evaluation, server to server     */
/* -------------------------------------------------------------------------- */
/**
 * The server-to-server twin of POST /api/xlegal/run (which the embedded page
 * uses). x-legal already did what /run asks x-legal for: it checked the case,
 * consumed the attempt and minted the `jobId`. So this route only validates the
 * request and runs the SAME background job, which ends in the SAME signed
 * webhook (`token` + `jobId`) and is reconcilable through /api/xlegal/status.
 *
 * - Auth: header `x-api-key` = XLEGAL_API_KEY (the shared secret /status uses).
 * - Idempotent by `jobId`: a retry of the same job answers 202 without starting
 *   a second generation (x-legal's queue retries on network errors).
 * - Documents are read through short-lived signed Supabase URLs, never copied
 *   into our storage, and never deleted from here (they are not ours).
 */
export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  // Coarse, per instance: x-legal sends one request per evaluation. This only
  // stops a leaked key from turning the endpoint into a Gemini bill.
  const limit = rateLimit(`xlegal-jobs:${getClientIp(request)}`, 30);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  if (!xlegalConfigured() || !storageAvailable()) {
    return NextResponse.json({ error: "Not configured." }, { status: 501 });
  }
  if (!apiKeyMatches(request.headers.get("x-api-key") ?? "")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: JobRequest;
  try {
    body = (await request.json()) as JobRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const jobId = str(body.jobId, 64);
  const token = str(body.token, 128);
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "Invalid jobId." }, { status: 400 });
  }
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }

  const cliente: ClienteInfo = {
    nombre: str(body.cliente?.nombre, 200),
    email: str(body.cliente?.email, 320),
    // Empty = let the analysis detect the country from the documents.
    pais: str(body.cliente?.pais, 80),
  };
  if (!cliente.nombre) {
    return NextResponse.json({ error: "cliente.nombre is required." }, { status: 400 });
  }

  const rawFiles = Array.isArray(body.files) ? body.files : [];
  if (rawFiles.length === 0 || rawFiles.length > MAX_FILES) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_FILES} documents.` }, { status: 400 });
  }
  const files: Array<{ url: string; name: string }> = [];
  for (const f of rawFiles) {
    const url = str(f?.url, 4096);
    const name = str(f?.name, 200);
    if (!url || !isAllowedJobDocumentUrl(url)) {
      return NextResponse.json({ error: "Document URL not allowed." }, { status: 400 });
    }
    // The analysis picks the parser by extension (lib/docs.ts): an unsupported
    // one would fail the whole job minutes later, so refuse it now.
    const lower = name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      return NextResponse.json(
        { error: `Unsupported document "${name}". Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}.` },
        { status: 400 },
      );
    }
    files.push({ url, name });
  }

  // Idempotency: this jobId already started (or finished) — nothing to do.
  const existingResult = await storageReadJson<XlegalResult>(resultPath(jobId));
  if (existingResult) {
    return NextResponse.json({ jobId, status: existingResult.status }, { status: 202 });
  }
  const existingJob = await storageReadJson<XlegalJob>(jobPath(jobId));
  if (existingJob) {
    return NextResponse.json({ jobId, status: existingJob.status }, { status: 202 });
  }

  const job: XlegalJob = {
    status: "processing",
    tokenHash: hashToken(token),
    cliente,
    files,
    createdAt: new Date().toISOString(),
    source: "api",
  };
  try {
    await storagePut(jobPath(jobId), JSON.stringify(job), "application/json");
  } catch (error) {
    console.error(`[xlegal:jobs] ${jobId} could not be stored:`, (error as Error).message);
    return NextResponse.json({ error: "Could not start the job." }, { status: 500 });
  }

  const origin = resolveOrigin(request);
  after(() => processXlegalJob(jobId, job, token, origin, requestStartedAt));
  return NextResponse.json({ jobId, status: "processing" }, { status: 202 });
}
