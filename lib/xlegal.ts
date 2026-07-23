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
import type { XlegalSession } from "./types";

/** Opaque bearer token issued by x-legal (never logged, never stored in clear). */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

/** Webhook retry waits (ms): initial try + 3 retries = 4 sends total. */
const WEBHOOK_BACKOFF_MS = [0, 2_000, 8_000, 30_000];

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
    console.error("[xlegal] session lookup failed:", (error as Error).message);
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
    console.error("[xlegal] consume failed:", (error as Error).message);
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

/**
 * POST /api/webhooks/juez on x-legal, signed with HMAC-SHA256 over the exact
 * raw body sent. Retries with 2 s / 8 s / 30 s backoff (4 sends total).
 * Returns true only when x-legal answered 2xx.
 */
export async function deliverXlegalWebhook(
  payload: XlegalWebhookPayload,
): Promise<boolean> {
  const raw = JSON.stringify(payload);
  const signature = createHmac("sha256", process.env.XLEGAL_WEBHOOK_SECRET ?? "")
    .update(raw, "utf8")
    .digest("hex");

  for (const wait of WEBHOOK_BACKOFF_MS) {
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
      });
      if (res.ok) return true;
      console.error(
        `[xlegal] webhook ${payload.event} rejected (${res.status}), job ${payload.jobId}`,
      );
    } catch (error) {
      console.error(
        `[xlegal] webhook ${payload.event} network error, job ${payload.jobId}:`,
        (error as Error).message,
      );
    }
  }
  return false;
}
