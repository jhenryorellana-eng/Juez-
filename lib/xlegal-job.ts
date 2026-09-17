/**
 * The x-legal evaluation job: generate → store → webhook → clean up.
 *
 * Shared by the two ways a job can start:
 *  - POST /api/xlegal/run  — the embedded page (/xlegal), authenticated by the
 *    client's session token and validated against x-legal.
 *  - POST /api/xlegal/jobs — server to server: x-legal already validated the
 *    case and consumed the attempt, and sends the documents itself.
 *
 * Both write the same job/result files (lib/xlegal.ts), so /api/xlegal/status
 * and the webhook work the same whichever way the job started.
 */
import { storagePut, storageDelete, isOwnedStorageUrl } from "./storage";
import { buildInformeFromFiles } from "./informe-pipeline";
import { deliverXlegalWebhook, resultPath } from "./xlegal";
import type { XlegalJob, XlegalResult } from "./types";

/** `maxDuration` of the routes that start a job, in ms. The clock starts when the REQUEST arrives. */
export const MAX_DURATION_MS = 300_000;

/**
 * Held back so the job can always close itself: writing the result plus up to
 * ~40 s of webhook backoff. A job the platform kills mid-flight writes NOTHING —
 * no result, no webhook — and that silence is what wedges the client on a job
 * that will never finish. A budget that leaves no room to report its own expiry
 * is no budget at all.
 */
const CLOSEOUT_RESERVE_MS = 60_000;

/** Floor: below this a generation is hopeless anyway, so fail fast and clean. */
const MIN_BUDGET_MS = 30_000;

/**
 * How long the generation may run before we close the job ourselves.
 *
 * Measured from when the request arrived, not from when the background work
 * started: uploading documents can eat tens of seconds of `maxDuration` before
 * `after()` ever runs, and a fixed budget would quietly spend the reserve that
 * the close-out depends on.
 */
function jobBudgetMs(requestStartedAt: number): number {
  const spent = Date.now() - requestStartedAt;
  return Math.max(MIN_BUDGET_MS, MAX_DURATION_MS - spent - CLOSEOUT_RESERVE_MS);
}

/**
 * Turns an internal throw into a code x-legal can store and show. Every failure
 * used to be reported as the same "GENERATION_FAILED", so the real cause lived
 * only in Vercel logs and nobody could tell a timeout from a corrupt upload.
 */
function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const known = [
    "TIMEOUT_BUDGET",
    "DOWNLOAD_FAILED",
    "TOO_LARGE",
    "FILE_NOT_ACTIVE",
    "UNSUPPORTED",
    "EMPTY",
    "NO_API_KEY",
  ];
  return known.find((code) => message.startsWith(code)) ?? "GENERATION_FAILED";
}

/**
 * The files this app may delete once the job is over: only its OWN copies. A
 * server-to-server job reads the documents straight from x-legal's storage
 * through short-lived signed URLs; those are not ours to delete (and Vercel
 * Blob's `del()` would only fail on them).
 */
function ownedUrls(urls: string[]): string[] {
  return urls.filter(isOwnedStorageUrl);
}

/** Shared latch so only ONE of the two racers writes the job's outcome. */
interface JobState {
  closed: boolean;
}

export async function processXlegalJob(
  jobId: string,
  job: XlegalJob,
  token: string,
  origin: string,
  requestStartedAt: number,
): Promise<void> {
  const state: JobState = { closed: false };
  const budgetMs = jobBudgetMs(requestStartedAt);
  console.log(`[xlegal:job] ${jobId} budget ${Math.round(budgetMs / 1000)}s`);

  let budgetTimer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<never>((_, reject) => {
    budgetTimer = setTimeout(() => reject(new Error("TIMEOUT_BUDGET")), budgetMs);
  });

  // The loser of a Promise.race keeps running, and an unhandled rejection takes
  // the whole process down — which would kill the very close-out below that this
  // budget exists to guarantee. So the work carries its own catch: it re-throws
  // only while it still owns the outcome, and swallows a late failure once the
  // budget has already closed the job.
  const work = generateAndDeliver(jobId, job, token, origin, state).catch(
    (error: unknown) => {
      if (!state.closed) throw error;
      console.error(
        `[xlegal:job] ${jobId} failed after the budget already closed it:`,
        (error as Error).message,
      );
    },
  );

  try {
    // Whichever finishes first wins: either the report is ready, or the budget
    // runs out and we close the job ourselves while the function is still alive.
    await Promise.race([work, budget]);
  } catch (error) {
    // The work already wrote a successful outcome and the budget merely lost the
    // race afterwards — nothing to report.
    if (state.closed) return;
    state.closed = true;

    const code = errorCode(error);
    console.error(
      `[xlegal:job] generation failed (${jobId}): ${code} —`,
      (error as Error).message,
    );
    const result: XlegalResult = { status: "error", error: code };
    await storagePut(resultPath(jobId), JSON.stringify(result), "application/json").catch(
      () => {},
    );
    await deliverXlegalWebhook({
      event: "evaluation.failed",
      token,
      jobId,
      error: code,
    });
    // Privacy: client documents never outlive the job, even on failure.
    await storageDelete(ownedUrls(job.files.map((f) => f.url))).catch(() => {});
  } finally {
    clearTimeout(budgetTimer);
  }
}

/** The happy path: generate → store → webhook → clean up. */
async function generateAndDeliver(
  jobId: string,
  job: XlegalJob,
  token: string,
  origin: string,
  state: JobState,
): Promise<void> {
  // Checkpoint logs: if the background task gets killed mid-flight, the last
  // line in the Vercel logs tells us exactly which stage died.
  console.log(`[xlegal:job] ${jobId} start (${job.files.length} docs, ${job.source ?? "page"})`);
  // Variante sin bloques comerciales: este cliente ya contrató el reforzamiento
  // en x-legal, así que el informe no le vende precios ni revisión de abogado.
  const { informe, pdf } = await buildInformeFromFiles(job.files, job.cliente, {
    variant: "xlegal",
  });
  console.log(`[xlegal:job] ${jobId} informe+pdf ready (score ${informe.score})`);

  // Local-dev storage returns a relative URL; the webhook consumer (x-legal
  // or the mock) needs an absolute one to download the PDF.
  const storedPdfUrl = await storagePut(
    `xlegal/informes/informe-${jobId}.pdf`,
    pdf,
    "application/pdf",
  );
  console.log(`[xlegal:job] ${jobId} pdf stored`);
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
  // Claim the outcome before writing it: a budget timeout that fires from here
  // on must not bury a report that is genuinely ready.
  if (state.closed) return;
  state.closed = true;
  await storagePut(resultPath(jobId), JSON.stringify(result), "application/json");
  console.log(`[xlegal:job] ${jobId} result saved, delivering webhook`);

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

  console.log(`[xlegal:job] ${jobId} webhook ${delivered ? "delivered" : "FAILED (reconciliation pending)"}`);
  if (delivered) {
    // x-legal stored the PDF: remove our copies (the client docs we hold, if
    // any, and the temporary PDF).
    await storageDelete(ownedUrls([...job.files.map((f) => f.url), storedPdfUrl])).catch(
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
}

export function resolveOrigin(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}
