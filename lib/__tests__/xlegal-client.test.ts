import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WEBHOOK_BACKOFF_MS,
  WEBHOOK_CLOSEOUT_MARGIN_MS,
  WEBHOOK_LONG_ATTEMPT_TIMEOUT_MS,
  WEBHOOK_MIN_ATTEMPT_TIMEOUT_MS,
  WEBHOOK_SHORT_ATTEMPT_TIMEOUT_MS,
  WEBHOOK_SHORT_WORST_CASE_MS,
  WEBHOOK_SPARE_BACKOFF_MS,
  WEBHOOK_TWO_SEND_BACKOFF_MS,
  consumeXlegalAttempt,
  deliverXlegalWebhook,
  fetchXlegalSession,
  isAllowedJobDocumentUrl,
  webhookScheduleFor,
  webhookWorstCaseMs,
  type XlegalWebhookPayload,
} from "../xlegal";
import { CLOSEOUT_RESERVE_MS, MAX_DURATION_MS } from "../xlegal-job";
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

  it("cuts each send at the schedule's timeout, and sends as many times as it has waits", { timeout: 5_000 }, async () => {
    stubFetch(hangs);
    const started = Date.now();
    await captureLogs(() => deliverXlegalWebhook(FAILED, { backoffMs: [0, 1, 1, 1], attemptTimeoutMs: 40 }));
    const elapsed = Date.now() - started;
    assert.equal(calls.length, 4);
    assert.ok(elapsed >= 4 * 40 - 20 && elapsed < 2_000, `${elapsed} ms`);
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

/* -------------------------------------------------------------------------- */
/*  The schedule, from the time the function has left                          */
/* -------------------------------------------------------------------------- */

/** Time left when the budget closes a job: the reserve, minus the failure close-out's writes before the webhook. */
const BUDGET_PATH_REMAINING_MS = [CLOSEOUT_RESERVE_MS - 4_000, CLOSEOUT_RESERVE_MS - 1_000, CLOSEOUT_RESERVE_MS];

const ON_COMPLETED = "evaluation.completed";
const ON_FAILED = "evaluation.failed";
const EVENTS = [ON_COMPLETED, ON_FAILED] as const;

describe("webhookScheduleFor", () => {
  it("a normal delivery (a ~2 min generation) gets three sends long enough for x-legal's whole handler", () => {
    // x-legal answers evaluation.completed only after its PDF download (30 s
    // timeout) and the rest of its handler (maxDuration 60): a 12 s cut made a
    // slow x-legal run the chain twice, or left the report here for 30 days.
    for (const generationMs of [90_000, 120_000, 135_000]) {
      const schedule = webhookScheduleFor(MAX_DURATION_MS - generationMs, ON_COMPLETED);
      assert.deepEqual(schedule.backoffMs, WEBHOOK_BACKOFF_MS, `generation ${generationMs} ms`);
      assert.equal(schedule.attemptTimeoutMs, WEBHOOK_LONG_ATTEMPT_TIMEOUT_MS, `generation ${generationMs} ms`);
    }
  });

  it("a longer generation gets three sends as long as the time left allows, between the short and the long cap", () => {
    // 200 s of generation: 100 s left → (100 − 10 margin − 10 waits) / 3.
    const schedule = webhookScheduleFor(MAX_DURATION_MS - 200_000, ON_COMPLETED);
    assert.deepEqual(schedule, { backoffMs: WEBHOOK_BACKOFF_MS, attemptTimeoutMs: 26_666 });
  });

  it("with time to spare (a quick generation), a fourth send 30 s after the third, every send at 45 s", () => {
    const schedule = webhookScheduleFor(MAX_DURATION_MS - 40_000, ON_COMPLETED);
    assert.deepEqual(schedule, {
      backoffMs: WEBHOOK_SPARE_BACKOFF_MS,
      attemptTimeoutMs: WEBHOOK_LONG_ATTEMPT_TIMEOUT_MS,
    });
    assert.deepEqual(WEBHOOK_SPARE_BACKOFF_MS, [0, 2_000, 8_000, 30_000]);
  });

  it("the budget's path (only the reserve left) gets three short sends, of at least 12 s each", () => {
    for (const event of EVENTS) {
      for (const remaining of BUDGET_PATH_REMAINING_MS) {
        const schedule = webhookScheduleFor(remaining, event);
        assert.deepEqual(schedule.backoffMs, WEBHOOK_BACKOFF_MS, `${event}, remaining ${remaining} ms`);
        assert.ok(schedule.attemptTimeoutMs >= WEBHOOK_SHORT_ATTEMPT_TIMEOUT_MS, `${event}, remaining ${remaining} ms`);
        assert.ok(schedule.attemptTimeoutMs < 14_000, `${event}, remaining ${remaining} ms: ${schedule.attemptTimeoutMs}`);
      }
    }
  });

  it("evaluation.completed with less than that left prefers fewer, longer sends: two of at least 12 s each", () => {
    // 40 s left (a report ready as the budget ran out, after slow writes): three
    // sends would be cut at 6.7 s, while x-legal downloads the PDF before it
    // answers — and every send cut while it works makes it run the chain again.
    assert.deepEqual(webhookScheduleFor(40_000, ON_COMPLETED), {
      backoffMs: WEBHOOK_TWO_SEND_BACKOFF_MS,
      attemptTimeoutMs: 14_000,
    });
    assert.deepEqual(WEBHOOK_TWO_SEND_BACKOFF_MS, [0, 2_000]);
  });

  it("evaluation.completed with even less left gets one send with all of it", () => {
    // 35 s left: two sends would get 11.5 s each.
    assert.deepEqual(webhookScheduleFor(35_000, ON_COMPLETED), { backoffMs: [0], attemptTimeoutMs: 25_000 });
  });

  it("evaluation.failed keeps its three short sends there: x-legal answers it at once", () => {
    assert.deepEqual(webhookScheduleFor(40_000, ON_FAILED), { backoffMs: WEBHOOK_BACKOFF_MS, attemptTimeoutMs: 6_666 });
    assert.deepEqual(webhookScheduleFor(35_000, ON_FAILED), { backoffMs: WEBHOOK_BACKOFF_MS, attemptTimeoutMs: 5_000 });
  });

  it("evaluation.completed never cuts a send under 12 s while 12 s fit", () => {
    for (
      let remaining = WEBHOOK_CLOSEOUT_MARGIN_MS + WEBHOOK_MIN_ATTEMPT_TIMEOUT_MS;
      remaining <= MAX_DURATION_MS;
      remaining += 100
    ) {
      const available = remaining - WEBHOOK_CLOSEOUT_MARGIN_MS;
      const schedule = webhookScheduleFor(remaining, ON_COMPLETED);
      assert.ok(
        schedule.attemptTimeoutMs >= Math.min(WEBHOOK_SHORT_ATTEMPT_TIMEOUT_MS, available),
        `remaining ${remaining} ms → ${JSON.stringify(schedule)}`,
      );
    }
  });

  it("the worst case always fits in the time left, with the close-out's margin to spare", () => {
    for (const event of EVENTS) {
      for (
        let remaining = WEBHOOK_CLOSEOUT_MARGIN_MS + WEBHOOK_MIN_ATTEMPT_TIMEOUT_MS;
        remaining <= MAX_DURATION_MS;
        remaining += 100
      ) {
        const schedule = webhookScheduleFor(remaining, event);
        const where = `${event}, remaining ${remaining} ms → ${JSON.stringify(schedule)}`;
        assert.ok(webhookWorstCaseMs(schedule) <= remaining - WEBHOOK_CLOSEOUT_MARGIN_MS, where);
        assert.ok(schedule.attemptTimeoutMs >= WEBHOOK_MIN_ATTEMPT_TIMEOUT_MS, where);
        assert.ok(schedule.attemptTimeoutMs <= WEBHOOK_LONG_ATTEMPT_TIMEOUT_MS, where);
        assert.ok(schedule.backoffMs.length >= 1, where);
      }
    }
  });

  it("with almost nothing left, one send with what there is (never none)", () => {
    for (const event of EVENTS) {
      assert.deepEqual(webhookScheduleFor(WEBHOOK_CLOSEOUT_MARGIN_MS + 8_000, event), {
        backoffMs: [0],
        attemptTimeoutMs: 8_000,
      });
      for (const remaining of [WEBHOOK_CLOSEOUT_MARGIN_MS, 1_000, 0, -5_000]) {
        assert.deepEqual(webhookScheduleFor(remaining, event), {
          backoffMs: [0],
          attemptTimeoutMs: WEBHOOK_MIN_ATTEMPT_TIMEOUT_MS,
        });
      }
    }
  });

  it("the reserve holds the short schedule, its margin and the failure close-out's own writes", () => {
    // 10 s of waits + 3 × 12 s.
    assert.equal(WEBHOOK_SHORT_WORST_CASE_MS, 46_000);
    // closeFailedJob deletes our documents and writes the error result BEFORE
    // the webhook: at least 4 s for those two calls.
    assert.ok(
      WEBHOOK_SHORT_WORST_CASE_MS + WEBHOOK_CLOSEOUT_MARGIN_MS + 4_000 <= CLOSEOUT_RESERVE_MS,
      `short worst case ${WEBHOOK_SHORT_WORST_CASE_MS} ms + margin vs reserve ${CLOSEOUT_RESERVE_MS} ms`,
    );
  });

  it("the long cap covers x-legal's handler, and the fourth send lands after x-legal's maxDuration", () => {
    const XLEGAL_PDF_DOWNLOAD_TIMEOUT_MS = 30_000; // safeFetch in applyEvaluationCompleted
    const XLEGAL_WEBHOOK_MAX_DURATION_MS = 60_000; // maxDuration of src/app/api/webhooks/juez
    assert.ok(WEBHOOK_LONG_ATTEMPT_TIMEOUT_MS >= XLEGAL_PDF_DOWNLOAD_TIMEOUT_MS + 15_000);
    const lastWait = WEBHOOK_SPARE_BACKOFF_MS[WEBHOOK_SPARE_BACKOFF_MS.length - 1];
    assert.ok(WEBHOOK_LONG_ATTEMPT_TIMEOUT_MS + lastWait > XLEGAL_WEBHOOK_MAX_DURATION_MS);
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
