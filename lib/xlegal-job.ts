/**
 * The x-legal evaluation job: generate → store → webhook → clean up. This file
 * races the generation against its budget; how the job ends (what is stored,
 * delivered and forgotten) lives in lib/xlegal-closeout.ts.
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
import { buildInformeFromFiles } from "./informe-pipeline";
import {
  closeFailedJob,
  defaultCloseoutDeps,
  deliverReport,
  safeErrorMessage,
  type CloseoutDeps,
  type JobState,
} from "./xlegal-closeout";
import type { Informe, XlegalJob } from "./types";

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
    "MODEL_JSON_INVALID",
  ];
  return known.find((code) => message.startsWith(code)) ?? "GENERATION_FAILED";
}

/** What the job talks to — injectable so the race with the budget can be tested without Gemini or Blob. */
export interface JobDeps {
  /** Downloads the documents, generates the report and renders its PDF. */
  generate(job: XlegalJob): Promise<{ informe: Informe; pdf: Buffer }>;
  closeout: CloseoutDeps;
  /** Overrides jobBudgetMs (tests). */
  budgetMs?: number;
}

const defaultJobDeps: JobDeps = {
  // Variante sin bloques comerciales: este cliente ya contrató el reforzamiento
  // en x-legal, así que el informe no le vende precios ni revisión de abogado.
  generate: (job) => buildInformeFromFiles(job.files, job.cliente, { variant: "xlegal" }),
  closeout: defaultCloseoutDeps,
};

export async function processXlegalJob(
  jobId: string,
  job: XlegalJob,
  token: string,
  origin: string,
  requestStartedAt: number,
  deps: JobDeps = defaultJobDeps,
): Promise<void> {
  const state: JobState = { closed: false };
  const budgetMs = deps.budgetMs ?? jobBudgetMs(requestStartedAt);
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
  const work = generateAndDeliver(jobId, job, token, origin, state, deps).catch(
    (error: unknown) => {
      if (!state.closed) throw error;
      console.error(
        `[xlegal:job] ${jobId} failed after the budget already closed it:`,
        safeErrorMessage(error),
      );
    },
  );

  try {
    // Whichever finishes first wins: either the report is ready, or the budget
    // runs out and we close the job ourselves while the function is still alive.
    await Promise.race([work, budget]);
  } catch (error) {
    // The report was ready and claimed (deliverReport set state.closed) when the
    // budget fired: the close-out is running — webhook, then forgetting the
    // client. Returning now would end the after() callback, and the platform may
    // freeze the instance before the documents, the PDF and the job record are
    // deleted. Wait for it: this is what CLOSEOUT_RESERVE_MS is for, and `work`
    // never rejects once state.closed is set (its catch absorbs it).
    if (state.closed) {
      await work;
      return;
    }
    state.closed = true;

    const code = errorCode(error);
    // safeErrorMessage: a `CODE:detail` message often carries a document name.
    console.error(
      `[xlegal:job] generation failed (${jobId}): ${code} —`,
      safeErrorMessage(error),
    );
    await closeFailedJob({ jobId, job, token, code }, deps.closeout);
  } finally {
    clearTimeout(budgetTimer);
  }
}

/** The happy path: generate, then hand the report to the close-out. */
async function generateAndDeliver(
  jobId: string,
  job: XlegalJob,
  token: string,
  origin: string,
  state: JobState,
  deps: JobDeps,
): Promise<void> {
  // Checkpoint logs: if the background task gets killed mid-flight, the last
  // line in the Vercel logs tells us exactly which stage died.
  console.log(`[xlegal:job] ${jobId} start (${job.files.length} docs, ${job.source ?? "page"})`);
  const { informe, pdf } = await deps.generate(job);
  // No score: the evaluation of a person x-legal can identify does not stay in our logs either.
  console.log(`[xlegal:job] ${jobId} informe+pdf ready`);
  await deliverReport({ jobId, job, token, origin, state, informe, pdf }, deps.closeout);
}

export function resolveOrigin(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}
