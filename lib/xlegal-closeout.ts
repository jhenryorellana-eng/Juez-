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
 */
export async function forgetDeliveredJob(
  jobId: string,
  tokenHash: string | undefined,
  completedAt: string,
  deps: Pick<CloseoutDeps, "put" | "readJson" | "deleteAt"> = defaultCloseoutDeps,
): Promise<void> {
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
  if (!redacted) {
    await deps
      .deleteAt(resultPath(jobId))
      .then(() => console.error(`[xlegal:job] ${jobId} result deleted instead of redacted`))
      .catch((error: unknown) =>
        console.error(
          `[xlegal:job] ${jobId} could not delete the unredacted result:`,
          safeErrorMessage(error),
        ),
      );
  }

  await forgetJobRecord(jobId, tokenHash, deps);
  console.log(`[xlegal:job] ${jobId} delivered data forgotten`);
}

/**
 * Deletes the job record (client name, email, country, document URLs) and the
 * token mapping when it still points at this job. Only the embedded page writes
 * a mapping, and it points at the token's latest job: never delete one that
 * already belongs to another job.
 */
async function forgetJobRecord(
  jobId: string,
  tokenHash: string | undefined,
  deps: Pick<CloseoutDeps, "readJson" | "deleteAt">,
): Promise<void> {
  if (tokenHash) {
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
  await deps.deleteAt(jobPath(jobId)).catch((error: unknown) =>
    console.error(`[xlegal:job] ${jobId} could not delete the job record:`, safeErrorMessage(error)),
  );
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
 * documents. Once x-legal acknowledged the failure, the job record and the token
 * mapping are deleted too: what is left is `{ status: "error", error }`, which is
 * all the idempotency of /api/xlegal/jobs, /api/xlegal/status and the page's
 * poll need. If the error result could not be written, the record stays: it is
 * then the only trace of the job (resolveResumableJob ages it out).
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
    await forgetJobRecord(jobId, job.tokenHash, deps);
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
