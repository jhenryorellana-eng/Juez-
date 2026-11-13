/**
 * How an x-legal evaluation job ends: store the report, deliver the webhook, and
 * keep nothing about the client once x-legal holds the outcome.
 *
 * Split from lib/xlegal-job.ts (which races the generation against its budget)
 * so the rules about what is kept and what is deleted can be tested without
 * Gemini, Blob or x-legal: every I/O goes through `CloseoutDeps`.
 */
import {
  isOwnedStorageUrl,
  storageDelete,
  storageDeleteAt,
  storagePut,
  storageReadJson,
} from "./storage";
import {
  deliverXlegalWebhook,
  jobPath,
  resultPath,
  tokenMapPath,
  type XlegalWebhookPayload,
} from "./xlegal";
import type {
  Informe,
  XlegalDeliveredResult,
  XlegalJob,
  XlegalReportResult,
  XlegalResult,
} from "./types";

export interface CloseoutDeps {
  put(pathname: string, data: Buffer | string, contentType: string): Promise<string>;
  readJson<T>(pathname: string): Promise<T | null>;
  deleteAt(pathname: string): Promise<void>;
  /** Deletes by URL; swallows its own errors (storageDelete). */
  deleteUrls(urls: string[]): Promise<void>;
  /** true only when x-legal answered 2xx. */
  deliver(payload: XlegalWebhookPayload): Promise<boolean>;
}

export const defaultCloseoutDeps: CloseoutDeps = {
  put: storagePut,
  readJson: storageReadJson,
  deleteAt: storageDeleteAt,
  deleteUrls: storageDelete,
  deliver: deliverXlegalWebhook,
};

/** Shared latch so only ONE of the two racers (work vs budget) writes the job's outcome. */
export interface JobState {
  closed: boolean;
}

export const informePdfPath = (jobId: string) => `xlegal/informes/informe-${jobId}.pdf`;

/**
 * The files this app may delete once the job is over: only its OWN copies. A
 * server-to-server job reads the documents straight from x-legal's storage
 * through short-lived signed URLs; those are not ours to delete (and Vercel
 * Blob's `del()` would only fail on them).
 */
function ownedUrls(urls: string[]): string[] {
  return urls.filter(isOwnedStorageUrl);
}

/**
 * Text that is safe to log. Internal errors are `CODE:detail`, and the detail is
 * often a document name — which usually carries the client's name — so only the
 * code survives. Anything else is kept, truncated.
 */
export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const coded = /^([A-Z][A-Z0-9_]*):/.exec(message);
  return coded ? coded[1] : message.slice(0, 200);
}

/* -------------------------------------------------------------------------- */
/*  Success                                                                    */
/* -------------------------------------------------------------------------- */

export interface ReportInput {
  jobId: string;
  job: XlegalJob;
  token: string;
  origin: string;
  state: JobState;
  informe: Informe;
  pdf: Buffer;
}

/** Store the PDF and the result → webhook → on 2xx, forget the client. */
export async function deliverReport(
  { jobId, job, token, origin, state, informe, pdf }: ReportInput,
  deps: CloseoutDeps = defaultCloseoutDeps,
): Promise<void> {
  // The budget already closed this job (and told x-legal it failed): a PDF
  // stored now would be an orphan holding the client's whole evaluation.
  if (state.closed) {
    console.log(`[xlegal:job] ${jobId} report ready after the budget closed the job: discarded`);
    return;
  }
  const storedPdfUrl = await deps.put(informePdfPath(jobId), pdf, "application/pdf");
  // Claim the outcome before writing it: a budget timeout that fires from here
  // on must not bury a report that is genuinely ready. If it fired DURING the
  // upload, the job is already closed as failed: take the PDF back.
  if (state.closed) {
    await deps.deleteUrls([storedPdfUrl]).catch(() => {});
    console.log(`[xlegal:job] ${jobId} budget closed the job while the PDF uploaded: PDF deleted`);
    return;
  }
  state.closed = true;
  console.log(`[xlegal:job] ${jobId} pdf stored`);

  // Local-dev storage returns a relative URL; the webhook consumer (x-legal
  // or the mock) needs an absolute one to download the PDF.
  const publicPdfUrl = storedPdfUrl.startsWith("/") ? `${origin}${storedPdfUrl}` : storedPdfUrl;
  const completedAt = new Date().toISOString();
  const result: XlegalReportResult = {
    status: "done",
    informe,
    pdfUrl: publicPdfUrl,
    cliente: job.cliente,
    completedAt,
    webhookDelivered: false,
  };
  await deps.put(resultPath(jobId), JSON.stringify(result), "application/json");
  console.log(`[xlegal:job] ${jobId} result saved, delivering webhook`);

  const delivered = await deps.deliver({
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

  console.log(
    `[xlegal:job] ${jobId} webhook ${delivered ? "delivered" : "FAILED (reconciliation pending)"}`,
  );
  if (delivered) {
    // x-legal stored the PDF: remove our copies (the client docs we hold, if
    // any, and the temporary PDF).
    await deps
      .deleteUrls(ownedUrls([...job.files.map((f) => f.url), storedPdfUrl]))
      .catch(() => {});
    await forgetDeliveredJob(jobId, job.tokenHash, completedAt, deps);
  }
  // If every webhook attempt failed the PDF and the full result stay put:
  // /api/xlegal/status is the reconciliation path and x-legal will pull the
  // result from there. The 30-day sweep (lib/xlegal-purge.ts) is their limit.
}

/**
 * Once x-legal acknowledged the webhook it holds the report, so this app keeps
 * nothing about the client: the result is rewritten to its bare outcome (no
 * score, level, headline, name, email, country or document list), and the job
 * record — which held all of those — and the token mapping are deleted.
 *
 * Who still reads what is left, and why it is enough:
 *  - /api/xlegal/jobs answers a retried jobId with the result's `status`;
 *  - /api/xlegal/status answers `done` + `webhookDelivered` (x-legal's
 *    reconciler only acts on a `done` that carries `result`, and only polls
 *    evaluations whose webhook never landed);
 *  - GET /api/xlegal/run, with the job gone, asks x-legal for the download link.
 *
 * If the redaction cannot be written (twice), the full result is DELETED rather
 * than left behind: x-legal already has the report and nobody asks for this
 * jobId after a 2xx — and a result with `webhookDelivered: false` would be
 * served by /status as if it had never been delivered.
 *
 * Each step stands on its own: one failing must not keep the others from
 * running, and the 30-day sweep is the net for whatever survives.
 * `tokenHash` is undefined when the job record is already gone (the sweep).
 *
 * Returns whether the full report is gone (redacted or deleted). false = it is
 * still in the store, and the error is in the log.
 *
 * The token mapping can be deleted here without a race: after a 2xx the
 * session in x-legal has the PDF, so POST /api/xlegal/run answers
 * `alreadyDelivered` (or resumes THIS job) and never writes a new mapping.
 */
export async function forgetDeliveredJob(
  jobId: string,
  tokenHash: string | undefined,
  completedAt: string,
  deps: Pick<CloseoutDeps, "put" | "readJson" | "deleteAt"> = defaultCloseoutDeps,
): Promise<boolean> {
  const delivered: XlegalDeliveredResult = {
    status: "done",
    completedAt,
    webhookDelivered: true,
  };
  const body = JSON.stringify(delivered);
  let redacted = false;
  for (let attempt = 1; attempt <= 2 && !redacted; attempt += 1) {
    try {
      await deps.put(resultPath(jobId), body, "application/json");
      redacted = true;
    } catch (error) {
      console.error(
        `[xlegal:job] ${jobId} could not redact the result (attempt ${attempt}):`,
        safeErrorMessage(error),
      );
    }
  }
  let reportGone = redacted;
  if (!redacted) {
    try {
      await deps.deleteAt(resultPath(jobId));
      reportGone = true;
      console.error(`[xlegal:job] ${jobId} result deleted instead of redacted`);
    } catch (error) {
      console.error(
        `[xlegal:job] ${jobId} could not delete the unredacted result:`,
        safeErrorMessage(error),
      );
    }
  }

  // Even when the report could not be removed, the job record still goes:
  // less client data left behind is better than none removed.
  if (tokenHash) await forgetTokenMapping(jobId, tokenHash, deps);
  await forgetJobRecord(jobId, deps);
  console.log(
    `[xlegal:job] ${jobId} ${reportGone ? "delivered data forgotten" : "job forgotten, REPORT STILL STORED"}`,
  );
  return reportGone;
}

/** Deletes the job record: client name, email, country, document URLs. */
async function forgetJobRecord(
  jobId: string,
  deps: Pick<CloseoutDeps, "deleteAt">,
): Promise<void> {
  await deps.deleteAt(jobPath(jobId)).catch((error: unknown) =>
    console.error(`[xlegal:job] ${jobId} could not delete the job record:`, safeErrorMessage(error)),
  );
}

/**
 * Deletes the token mapping (`{ jobId }`, keyed by the token's hash) when it still
 * points at this job. Only the embedded page writes a mapping, and it points at
 * the token's latest job: never delete one that already belongs to another job.
 * Read-then-delete is not atomic, so only call this where no new mapping can be
 * written meanwhile (see forgetDeliveredJob).
 */
async function forgetTokenMapping(
  jobId: string,
  tokenHash: string,
  deps: Pick<CloseoutDeps, "readJson" | "deleteAt">,
): Promise<void> {
  try {
    const mapping = await deps.readJson<{ jobId?: string }>(tokenMapPath(tokenHash));
    if (mapping?.jobId === jobId) await deps.deleteAt(tokenMapPath(tokenHash));
  } catch (error) {
    console.error(
      `[xlegal:job] ${jobId} could not delete the token mapping:`,
      safeErrorMessage(error),
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Failure                                                                    */
/* -------------------------------------------------------------------------- */

export interface FailureInput {
  jobId: string;
  job: XlegalJob;
  token: string;
  /** What x-legal stores and shows (lib/xlegal-job.ts → errorCode). */
  code: string;
}

/**
 * Error result → `evaluation.failed` webhook → delete our copies of the
 * documents. Once x-legal acknowledged the failure, the job record is deleted
 * too: what is left is `{ status: "error", error }`, which is all the
 * idempotency of /api/xlegal/jobs, /api/xlegal/status and the page's poll need.
 * If the error result could not be written, the record stays: it is then the
 * only trace of the job (resolveResumableJob ages it out).
 *
 * The token mapping is NOT touched. x-legal hands the attempt back when it
 * accepts `evaluation.failed`, so the page may already be starting a new job and
 * writing its own mapping: a read-then-delete here could remove THAT one. The
 * mapping holds only `{ jobId }` (no client data), resolveResumableJob treats
 * one that points at an error result as "start fresh", a retry overwrites it,
 * and the 30-day sweep removes it.
 */
export async function closeFailedJob(
  { jobId, job, token, code }: FailureInput,
  deps: CloseoutDeps = defaultCloseoutDeps,
): Promise<void> {
  const result: XlegalResult = { status: "error", error: code };
  const stored = await deps
    .put(resultPath(jobId), JSON.stringify(result), "application/json")
    .then(() => true)
    .catch((error: unknown) => {
      console.error(`[xlegal:job] ${jobId} could not store the error result:`, safeErrorMessage(error));
      return false;
    });
  const delivered = await deps.deliver({
    event: "evaluation.failed",
    token,
    jobId,
    error: code,
  });
  // Privacy: client documents never outlive the job, even on failure.
  await deps.deleteUrls(ownedUrls(job.files.map((f) => f.url))).catch(() => {});
  if (stored && delivered) {
    await forgetJobRecord(jobId, deps);
    console.log(`[xlegal:job] ${jobId} failed job forgotten`);
  }
}

/* -------------------------------------------------------------------------- */
/*  The page's poll once the job record is gone                                */
/* -------------------------------------------------------------------------- */

/**
 * What GET /api/xlegal/run answers for a jobId whose record no longer exists —
 * which, since 2026-11-12, is what a closed job looks like. The record held the
 * token hash, so the jobId can no longer be checked against the token; the
 * result decides instead:
 *  - an error result → the error code (all that is kept of a failed job);
 *  - a delivered result → ask x-legal for this token's download link;
 *  - anything else (an unknown jobId, a report not delivered yet) → 404, which
 *    the page treats as "keep polling". A made-up id never reaches x-legal.
 */
export function pollAnswerWithoutJob(
  result: XlegalResult | null,
): "error" | "ask-xlegal" | "not-found" {
  if (!result) return "not-found";
  if (result.status === "error") return "error";
  if (result.webhookDelivered === true) return "ask-xlegal";
  return "not-found";
}

/**
 * A result that still carries the report although x-legal acknowledged it —
 * written before 2026-11-12, when delivery only flipped `webhookDelivered`.
 */
export function isDeliveredFullResult(
  result: XlegalResult | null,
): result is XlegalReportResult & { webhookDelivered: true } {
  return (
    result?.status === "done" &&
    result.webhookDelivered === true &&
    "informe" in result
  );
}
