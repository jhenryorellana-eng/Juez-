import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WEBHOOK_ATTEMPT_TIMEOUT_MS,
  WEBHOOK_BACKOFF_MS,
  WEBHOOK_WORST_CASE_MS,
  consumeXlegalAttempt,
  deliverXlegalWebhook,
  fetchXlegalSession,
  isAllowedJobDocumentUrl,
  type XlegalWebhookPayload,
} from "../xlegal";
import { CLOSEOUT_RESERVE_MS } from "../xlegal-job";
import { captureLogs } from "./fake-store";

const JOB_ID = "0b6f1c1e-6a39-4c51-9f0c-2b1f8f4a7d10";
const OTHER_JOB_ID = "7c2d9e0a-1b3f-4a5c-8d6e-9f0a1b2c3d4e";
const TOKEN = "tok_abcdefghijklmnopqrstuvwxyz";
const BLOB = "https://abc123.public.blob.vercel-storage.com/";
const SIGNED = "https://abc.supabase.co/storage/v1/object/sign/case-documents/c1/acta.pdf?token=x";

describe("isAllowedJobDocumentUrl (POST /api/xlegal/jobs)", () => {
  it("accepts a signed Supabase object URL, which is what x-legal sends", () => {
    assert.equal(isAllowedJobDocumentUrl(SIGNED), true);
  });

  it("refuses every URL of our own Blob, xlegal/ in particular", () => {
    // A job lists its documents, and the close-out used to delete the ones it
    // found under xlegal/: another job's PDF or documents must not be nameable.
    for (const url of [
      `${BLOB}xlegal/informes/informe-${OTHER_JOB_ID}.pdf`,
      `${BLOB}xlegal/docs/${OTHER_JOB_ID}/0-acta.pdf`,
      `${BLOB}xlegal/results/${OTHER_JOB_ID}.json`,
      `${BLOB}xlegal/jobs/${OTHER_JOB_ID}.json`,
      `${BLOB}casos/acta.pdf`,
      `${BLOB}pro/a.pdf`,
    ]) {
      assert.equal(isAllowedJobDocumentUrl(url), false, url);
    }
  });

  it("refuses anything that is not a signed Supabase object URL over HTTPS", () => {
    for (const url of [
      "https://abc.supabase.co/storage/v1/object/public/case-documents/acta.pdf",
      "https://abc.supabase.co/storage/v1/object/sign/../public/case-documents/acta.pdf",
      "https://abc.supabase.co/storage/v1/object/sign/%2e%2e/public/case-documents/acta.pdf",
      "https://abc.supabase.co/rest/v1/cases",
      "http://abc.supabase.co/storage/v1/object/sign/case-documents/acta.pdf?token=x",
      "https://abc.supabase.co.evil.example/storage/v1/object/sign/case-documents/acta.pdf",
      "https://abc.supabase.co@evil.example/storage/v1/object/sign/case-documents/acta.pdf",
      "https://supabase.co/storage/v1/object/sign/case-documents/acta.pdf",
      "/api/dev/file?path=xlegal%2Fdocs%2Fa.pdf",
      "not a url",
    ]) {
      assert.equal(isAllowedJobDocumentUrl(url), false, url);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Calls to x-legal, against a stubbed fetch                                  */
/* -------------------------------------------------------------------------- */

type FetchStub = (url: string, init: RequestInit) => Promise<Response>;

const realFetch = globalThis.fetch;
const env = { ...process.env };
let calls: Array<{ url: string; init: RequestInit }>;

function stubFetch(stub: FetchStub): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return stub(url, init ?? {});
  }) as typeof fetch;
}

/** A send that never answers: it only settles when its signal aborts it. */
const hangs: FetchStub = (_url, init) =>
  new Promise((_, reject) => {
    const signal = init.signal;
    if (!signal) return; // no timeout: hangs forever (the test's own timeout catches it)
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });

const FAILED: XlegalWebhookPayload = { event: "evaluation.failed", token: TOKEN, jobId: JOB_ID, error: "TIMEOUT_BUDGET" };

beforeEach(() => {
  calls = [];
  process.env.XLEGAL_API_URL = "https://xlegal.example";
  process.env.XLEGAL_API_KEY = "test-api-key";
  process.env.XLEGAL_WEBHOOK_SECRET = "test-webhook-secret";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const key of ["XLEGAL_API_URL", "XLEGAL_API_KEY", "XLEGAL_WEBHOOK_SECRET"]) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
});

describe("deliverXlegalWebhook", () => {
  it("gives every send its own timeout: an x-legal that never answers cannot hold the close-out", { timeout: 5_000 }, async () => {
    stubFetch(hangs);
    let delivered: boolean | undefined;
    await captureLogs(async () => {
      delivered = await deliverXlegalWebhook(FAILED, { backoffMs: [0, 1, 1], attemptTimeoutMs: 20 });
    });
    assert.equal(delivered, false);
    assert.equal(calls.length, 3);
    for (const { init } of calls) assert.ok(init.signal instanceof AbortSignal);
  });

  it("uses a timeout by default too", async () => {
    stubFetch(async () => new Response(null, { status: 200 }));
    assert.equal(await deliverXlegalWebhook(FAILED), true);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].init.signal instanceof AbortSignal);
    assert.equal(calls[0].url, "https://xlegal.example/api/webhooks/juez");
  });

  it("retries after a rejection and stops at the first 2xx", async () => {
    let sends = 0;
    stubFetch(async () => new Response(null, { status: (sends += 1) === 1 ? 503 : 200 }));
    let delivered: boolean | undefined;
    await captureLogs(async () => {
      delivered = await deliverXlegalWebhook(FAILED, { backoffMs: [0, 1, 1], attemptTimeoutMs: 1_000 });
    });
    assert.equal(delivered, true);
    assert.equal(calls.length, 2);
  });

  it("the worst case (every wait, every send timing out) fits in the close-out reserve, with room for its Blob writes", () => {
    const waits = WEBHOOK_BACKOFF_MS.reduce((total, wait) => total + wait, 0);
    assert.equal(WEBHOOK_WORST_CASE_MS, waits + WEBHOOK_BACKOFF_MS.length * WEBHOOK_ATTEMPT_TIMEOUT_MS);
    // What else the close-out writes and deletes in that reserve (result,
    // documents, PDF, redaction, job record, mapping): at least 10 s for it.
    assert.ok(
      WEBHOOK_WORST_CASE_MS + 10_000 <= CLOSEOUT_RESERVE_MS,
      `webhook worst case ${WEBHOOK_WORST_CASE_MS} ms vs reserve ${CLOSEOUT_RESERVE_MS} ms`,
    );
  });

  it("logs the kind of a network error, never its message", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed: Cliente Demo E2E https://xlegal.example/secret");
    });
    const logs = await captureLogs(() =>
      deliverXlegalWebhook(FAILED, { backoffMs: [0], attemptTimeoutMs: 1_000 }),
    );
    assert.match(logs, /TypeError/);
    assert.doesNotMatch(logs, /Cliente Demo|xlegal\.example|fetch failed/);
  });

  it("logs a timed-out send as TimeoutError", { timeout: 5_000 }, async () => {
    stubFetch(hangs);
    const logs = await captureLogs(() =>
      deliverXlegalWebhook(FAILED, { backoffMs: [0], attemptTimeoutMs: 20 }),
    );
    assert.match(logs, /TimeoutError/);
  });
});

describe("session lookup and consume", () => {
  const networkError = async (): Promise<Response> => {
    throw new TypeError("getaddrinfo ENOTFOUND Cliente Demo E2E demo@e2e.local");
  };

  it("fetchXlegalSession logs the kind of a network error, never its message", async () => {
    stubFetch(networkError);
    let answer: Awaited<ReturnType<typeof fetchXlegalSession>> | undefined;
    const logs = await captureLogs(async () => {
      answer = await fetchXlegalSession(TOKEN);
    });
    assert.deepEqual(answer, { status: 0, session: null });
    assert.match(logs, /TypeError/);
    assert.doesNotMatch(logs, /Cliente Demo|demo@e2e\.local|ENOTFOUND/);
  });

  it("consumeXlegalAttempt logs the kind of a network error, never its message", async () => {
    stubFetch(networkError);
    let answer: Awaited<ReturnType<typeof consumeXlegalAttempt>> | undefined;
    const logs = await captureLogs(async () => {
      answer = await consumeXlegalAttempt(TOKEN, JOB_ID);
    });
    assert.deepEqual(answer, { ok: false, status: 0 });
    assert.match(logs, /TypeError/);
    assert.doesNotMatch(logs, /Cliente Demo|demo@e2e\.local|ENOTFOUND/);
  });
});
