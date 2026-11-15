/**
 * Server-only client for the x-legal integration (route /xlegal).
 *
 * x-legal is the source of truth: it issues the opaque session token, knows the
 * client, controls the attempt count and stores the final PDF. Juez validates
 * the token against x-legal on every server-side operation, generates the
 * report, delivers it via a signed webhook and deletes its own copies.
 *
 * Auth Juez → x-legal: header `x-api-key: XLEGAL_API_KEY`.
 * Webhook signature: HMAC-SHA256 hex of the exact raw body, header
 * `x-juez-signature`, secret `XLEGAL_WEBHOOK_SECRET`.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { safeErrorMessage } from "./safe-error";
import { storageReadJson } from "./storage";
import type { XlegalJob, XlegalResult, XlegalSession } from "./types";

/** Opaque bearer token issued by x-legal (never logged, never stored in clear). */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

/*
 * The webhook's schedule: how many sends, how long each may take, and how long
 * to wait between them. Since 2026-11-14 it is computed from the time the
 * function has left (webhookScheduleFor), not fixed.
 *
 * What it has to live with, on x-legal's side (src/app/api/webhooks/juez):
 *  - x-legal answers `evaluation.completed` only once ALL its work is done: it
 *    downloads our PDF (safeFetch, 30 s timeout), stores it, updates the
 *    evaluation and runs the phase close-out inline. Its handler has
 *    maxDuration 60; past that, its platform kills it.
 *  - A send we cut while x-legal is still working does NOT stop it, and the
 *    retry then finds the event claimed but not processed: claimWebhookEvent
 *    answers "retry" and x-legal runs the whole chain a SECOND time, in parallel.
 *  - If every send is cut but x-legal did finish, x-legal has the report and we
 *    think it was not delivered: the full result and the PDF stay in our store
 *    until the 30-day sweep (x-legal's reconciler only polls in_progress rows).
 * So a send should not be cut before x-legal can answer — but on the budget's
 * path only CLOSEOUT_RESERVE_MS (60 s) is left for the whole close-out, and a
 * delivery that outlasts the function writes nothing at all.
 */

/** The three sends of the base schedule: first send + retries after 2 s and 8 s. */
export const WEBHOOK_BACKOFF_MS: readonly number[] = [0, 2_000, 8_000];

/**
 * With time to spare, a fourth send 30 s after the third. Until 2026-11-14
 * every delivery had it, with no timeout per send; now only a schedule whose
 * four sends all get the long cap does. It covers a 5xx that lasts up to ~40 s
 * instead of ~10 s, and it lands after any earlier send has ended on x-legal's
 * side (see WEBHOOK_LONG_ATTEMPT_TIMEOUT_MS): it either finds the event
 * processed (`duplicate` → 200 at once, and the client is forgotten) or retries
 * cleanly.
 */
export const WEBHOOK_SPARE_BACKOFF_MS: readonly number[] = [...WEBHOOK_BACKOFF_MS, 30_000];

/**
 * With too little left for three sends of WEBHOOK_SHORT_ATTEMPT_TIMEOUT_MS, an
 * `evaluation.completed` gets the first two (see webhookScheduleFor).
 */
export const WEBHOOK_TWO_SEND_BACKOFF_MS: readonly number[] = WEBHOOK_BACKOFF_MS.slice(0, 2);

/**
 * The per-send cap when time allows: x-legal's PDF download at its 30 s limit
 * plus 15 s for the rest of its handler. A slow x-legal that is going to finish
 * is not cut. Cut at 45 s and waited 30 s, the fourth send starts 75 s after the
 * third — past x-legal's 60 s maxDuration.
 */
export const WEBHOOK_LONG_ATTEMPT_TIMEOUT_MS = 45_000;

/**
 * What each of the three sends is guaranteed on the budget's path: with
 * CLOSEOUT_RESERVE_MS intact, the schedule leaves every send at least this long
 * (a test holds it). x-legal answers `evaluation.failed` right away.
 */
export const WEBHOOK_SHORT_ATTEMPT_TIMEOUT_MS = 12_000;

/** Below this a send is pointless: the schedule falls back to a single send. */
export const WEBHOOK_MIN_ATTEMPT_TIMEOUT_MS = 5_000;

/**
 * Kept free after the webhook, for what the close-out does once x-legal
 * answers: delete the PDF, redact the result (up to three writes and a delete),
 * delete the token mapping and the job record.
 */
export const WEBHOOK_CLOSEOUT_MARGIN_MS = 10_000;

/** The longest a delivery on this schedule can take: every wait, and every send timing out. */
export function webhookWorstCaseMs({
  backoffMs = WEBHOOK_BACKOFF_MS,
  attemptTimeoutMs = WEBHOOK_SHORT_ATTEMPT_TIMEOUT_MS,
}: WebhookSchedule = {}): number {
  return backoffMs.reduce((total, wait) => total + wait, 0) + backoffMs.length * attemptTimeoutMs;
}

/** The base schedule at the short cap — 10 s + 3 × 12 s = 46 s, what the reserve has to hold. */
export const WEBHOOK_SHORT_WORST_CASE_MS = webhookWorstCaseMs();

/** The longest each send can be when `backoffMs` has to fit in `availableMs`, waits included. */
function longestSendMs(backoffMs: readonly number[], availableMs: number): number {
  const waits = webhookWorstCaseMs({ backoffMs, attemptTimeoutMs: 0 });
  return Math.floor((availableMs - waits) / backoffMs.length);
}

/**
 * The schedule for a delivery of `event` that starts with `remainingMs` left
 * before the platform ends the function. With at least 15 s left
 * (WEBHOOK_CLOSEOUT_MARGIN_MS + WEBHOOK_MIN_ATTEMPT_TIMEOUT_MS), its worst case
 * never takes more than `remainingMs - WEBHOOK_CLOSEOUT_MARGIN_MS`:
 *  1. time to spare → four sends (WEBHOOK_SPARE_BACKOFF_MS), each of 45 s;
 *  2. otherwise → the three base sends, each as long as fits, up to 45 s (a
 *     normal delivery after a ~2 min generation gets the full 45 s; the
 *     budget's path, with CLOSEOUT_RESERVE_MS intact, ~12-13 s);
 *  2b. an `evaluation.completed` whose three sends would each get less than
 *     WEBHOOK_SHORT_ATTEMPT_TIMEOUT_MS → two sends (WEBHOOK_TWO_SEND_BACKOFF_MS)
 *     if each still gets that much, or else one send with all that is left;
 *  3. not even three sends of WEBHOOK_MIN_ATTEMPT_TIMEOUT_MS fit (the reserve
 *     was eaten before the close-out began) → one send with what is left —
 *     which, with less than 15 s left, may not fit.
 * A longer send comes before one more: a send cut while x-legal still works on
 * `evaluation.completed` (it downloads our PDF first) is what makes it run its
 * chain twice, while a fast 5xx is what the reconciliation (/api/xlegal/status)
 * is there for. `evaluation.failed` keeps its three short sends: x-legal
 * answers it at once.
 */
export function webhookScheduleFor(
  remainingMs: number,
  event: XlegalWebhookPayload["event"],
): Required<WebhookSchedule> {
  const available = remainingMs - WEBHOOK_CLOSEOUT_MARGIN_MS;

  const spare = { backoffMs: WEBHOOK_SPARE_BACKOFF_MS, attemptTimeoutMs: WEBHOOK_LONG_ATTEMPT_TIMEOUT_MS };
  if (webhookWorstCaseMs(spare) <= available) return spare;

  const perSend = longestSendMs(WEBHOOK_BACKOFF_MS, available);
  if (perSend >= WEBHOOK_MIN_ATTEMPT_TIMEOUT_MS) {
    if (event === "evaluation.completed" && perSend < WEBHOOK_SHORT_ATTEMPT_TIMEOUT_MS) {
      const perSendOfTwo = longestSendMs(WEBHOOK_TWO_SEND_BACKOFF_MS, available);
      if (perSendOfTwo >= WEBHOOK_SHORT_ATTEMPT_TIMEOUT_MS) {
        return { backoffMs: WEBHOOK_TWO_SEND_BACKOFF_MS, attemptTimeoutMs: perSendOfTwo };
      }
      return { backoffMs: [0], attemptTimeoutMs: Math.floor(available) };
    }
    return {
      backoffMs: WEBHOOK_BACKOFF_MS,
      attemptTimeoutMs: Math.min(WEBHOOK_LONG_ATTEMPT_TIMEOUT_MS, perSend),
    };
  }

  // Never no send at all: with less than the minimum left it may not fit, and
  // the platform may end the function first — but a send that might land beats
  // a job that ends with no webhook.
  return {
    backoffMs: [0],
    attemptTimeoutMs: Math.max(WEBHOOK_MIN_ATTEMPT_TIMEOUT_MS, Math.floor(available)),
  };
}

export function xlegalConfigured(): boolean {
  return Boolean(
    process.env.XLEGAL_API_URL &&
      process.env.XLEGAL_API_KEY &&
      process.env.XLEGAL_WEBHOOK_SECRET,
  );
}

export function isValidToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

/** sha256 hex of the token — the only form ever persisted or logged (first 8 chars). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of a candidate api key against XLEGAL_API_KEY. */
export function apiKeyMatches(candidate: string): boolean {
  const expected = process.env.XLEGAL_API_KEY ?? "";
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(expected, "utf8");
  return expected.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The document URLs POST /api/xlegal/jobs accepts: a SIGNED object URL of a
 * Supabase project, over HTTPS (`https://<ref>.supabase.co/storage/v1/object/sign/...`),
 * which is what x-legal sends (its dispatch-evaluation job signs each case
 * document for 10 minutes). The signed path matters: a public-bucket URL or any
 * other Supabase endpoint is refused, so the key cannot be used to make this app
 * fetch arbitrary resources.
 *
 * Our own Vercel Blob is refused too (since 2026-11-14; x-legal never sent one).
 * A job lists its documents, and a URL of ours — another job's PDF under
 * `xlegal/informes/`, its documents, `casos/` — would be read and sent to
 * Gemini on the caller's say-so (and, before the close-out learned to leave an
 * api job's documents alone, deleted).
 */
export function isAllowedJobDocumentUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname.endsWith(".supabase.co") &&
    url.pathname.startsWith("/storage/v1/object/sign/")
  );
}

function apiUrl(): string {
  return (process.env.XLEGAL_API_URL ?? "").replace(/\/+$/, "");
}

/**
 * GET /api/juez/sessions/{token} on x-legal.
 * Returns the parsed session, or null with the HTTP status for error handling
 * (404 = unknown/expired token, 401/403 = misconfigured api key).
 */
export async function fetchXlegalSession(
  token: string,
): Promise<{ status: number; session: XlegalSession | null }> {
  try {
    const res = await fetch(
      `${apiUrl()}/api/juez/sessions/${encodeURIComponent(token)}`,
      {
        headers: { "x-api-key": process.env.XLEGAL_API_KEY ?? "" },
        cache: "no-store",
      },
    );
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        console.error("[xlegal] api key rejected by x-legal (session lookup)");
      }
      return { status: res.status, session: null };
    }
    const raw = (await res.json()) as Partial<XlegalSession>;
    // Be defensive: derive everything the UI needs from numbers/pdf.available
    // and treat unknown status values as "active".
    const session: XlegalSession = {
      cliente: {
        nombre: raw.cliente?.nombre ?? "",
        email: raw.cliente?.email ?? "",
        pais: raw.cliente?.pais ?? "",
      },
      attemptsAllowed: Number(raw.attemptsAllowed) || 0,
      attemptsUsed: Number(raw.attemptsUsed) || 0,
      status:
        raw.status === "delivered" || raw.status === "expired"
          ? raw.status
          : "active",
      pdf: {
        available: raw.pdf?.available === true,
        downloadUrl:
          typeof raw.pdf?.downloadUrl === "string" ? raw.pdf.downloadUrl : undefined,
      },
    };
    return { status: res.status, session };
  } catch (error) {
    console.error("[xlegal] session lookup failed:", safeErrorMessage(error));
    return { status: 0, session: null };
  }
}

/**
 * POST /api/juez/sessions/{token}/consume with { jobId }.
 * Idempotent by jobId on the x-legal side. 409 = no attempts left.
 */
export async function consumeXlegalAttempt(
  token: string,
  jobId: string,
): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(
      `${apiUrl()}/api/juez/sessions/${encodeURIComponent(token)}/consume`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.XLEGAL_API_KEY ?? "",
        },
        body: JSON.stringify({ jobId }),
        cache: "no-store",
      },
    );
    return { ok: res.ok, status: res.status };
  } catch (error) {
    console.error("[xlegal] consume failed:", safeErrorMessage(error));
    return { ok: false, status: 0 };
  }
}

export interface XlegalWebhookPayload {
  event: "evaluation.completed" | "evaluation.failed";
  token: string;
  jobId: string;
  completedAt?: string;
  result?: { pdfUrl: string; score: number; nivel: string; headline: string };
  error?: string;
}

/** A delivery schedule: the wait before each send (its length is the number of sends), and each send's timeout. */
export interface WebhookSchedule {
  backoffMs?: readonly number[];
  attemptTimeoutMs?: number;
}

/**
 * POST /api/webhooks/juez on x-legal, signed with HMAC-SHA256 over the exact
 * raw body sent, on the given schedule (webhookScheduleFor; the close-out
 * computes it from the time left). Without one, the base schedule at the short
 * cap: 3 sends after 0 / 2 / 8 s, 12 s each, at worst WEBHOOK_SHORT_WORST_CASE_MS.
 * Returns true only when x-legal answered 2xx.
 */
export async function deliverXlegalWebhook(
  payload: XlegalWebhookPayload,
  {
    backoffMs = WEBHOOK_BACKOFF_MS,
    attemptTimeoutMs = WEBHOOK_SHORT_ATTEMPT_TIMEOUT_MS,
  }: WebhookSchedule = {},
): Promise<boolean> {
  const raw = JSON.stringify(payload);
  const signature = createHmac("sha256", process.env.XLEGAL_WEBHOOK_SECRET ?? "")
    .update(raw, "utf8")
    .digest("hex");

  for (const wait of backoffMs) {
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      const res = await fetch(`${apiUrl()}/api/webhooks/juez`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-juez-signature": signature,
        },
        body: raw,
        cache: "no-store",
        signal: AbortSignal.timeout(attemptTimeoutMs),
      });
      if (res.ok) return true;
      console.error(
        `[xlegal] webhook ${payload.event} rejected (${res.status}), job ${payload.jobId}`,
      );
    } catch (error) {
      // A send that timed out logs as TimeoutError; a network failure, as its kind.
      console.error(
        `[xlegal] webhook ${payload.event} not delivered, job ${payload.jobId}:`,
        safeErrorMessage(error),
      );
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/*  Job storage layout + resume decision (shared by the page and the API)      */
/* -------------------------------------------------------------------------- */

export const jobPath = (jobId: string) => `xlegal/jobs/${jobId}.json`;
export const resultPath = (jobId: string) => `xlegal/results/${jobId}.json`;
export const tokenMapPath = (tokenHash: string) => `xlegal/tokens/${tokenHash}.json`;

/**
 * A job that never wrote a result is considered alive only within this window:
 * the route's whole maxDuration (300 s) plus a margin. Anything older was killed
 * by the platform before it could close itself, so it will never write anything.
 */
const RESUME_WINDOW_MS = 6 * 60_000;

/**
 * What to do with the job this token already started.
 * - `none`    → no job, or the previous one is dead/failed: start fresh.
 * - `done`    → finished: re-show the report.
 * - `running` → still within its budget: keep polling.
 */
export type ResumeDecision =
  | { kind: "none" }
  | { kind: "done"; jobId: string }
  | { kind: "running"; jobId: string };

/**
 * Single source of truth for "should this token resume its job?".
 *
 * It lives here because BOTH the server page (which decides whether to show the
 * upload form or the progress screen) and POST /api/xlegal/run need the exact
 * same answer. When this logic was duplicated, the page kept the client pinned
 * to a dead job forever while the API had already learned to move on.
 */
export async function resolveResumableJob(tokenHash: string): Promise<ResumeDecision> {
  const mapping = await storageReadJson<{ jobId: string }>(tokenMapPath(tokenHash));
  if (!mapping?.jobId) return { kind: "none" };

  const prior = await storageReadJson<XlegalResult>(resultPath(mapping.jobId));
  if (prior?.status === "done") return { kind: "done", jobId: mapping.jobId };
  // An explicit "error" result means the job closed itself: let the user retry.
  if (prior) return { kind: "none" };

  const job = await storageReadJson<XlegalJob>(jobPath(mapping.jobId));
  const age = job?.createdAt
    ? Date.now() - new Date(job.createdAt).getTime()
    : Infinity;
  if (age < RESUME_WINDOW_MS) return { kind: "running", jobId: mapping.jobId };

  console.error(
    `[xlegal] stale job ${mapping.jobId} (no result after ${Math.round(age / 1000)}s) — starting fresh`,
  );
  return { kind: "none" };
}
