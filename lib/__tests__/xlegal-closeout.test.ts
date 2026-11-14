import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  closeFailedJob,
  deliverReport,
  forgetDeliveredJob,
  informePdfPath,
  pollAnswerWithoutJob,
  pollWithoutJob,
  type JobState,
} from "../xlegal-closeout";
import { jobPath, resultPath, tokenMapPath } from "../xlegal";
import type { Informe, XlegalJob, XlegalResult } from "../types";
import { FakeStore, captureLogs } from "./fake-store";

const JOB_ID = "0b6f1c1e-6a39-4c51-9f0c-2b1f8f4a7d10";
const OTHER_JOB_ID = "7c2d9e0a-1b3f-4a5c-8d6e-9f0a1b2c3d4e";
const TOKEN = "tok_abcdefghijklmnopqrstuvwxyz";
const TOKEN_HASH = "f".repeat(64);
const CLIENT = { nombre: "Cliente Demo E2E", email: "demo@e2e.local", pais: "Honduras" };
const FOREIGN_DOC = "https://abc.supabase.co/storage/v1/object/sign/docs/1.pdf?token=x";
const INFORME = { score: 72, level: "medio", headline: "Caso con base" } as unknown as Informe;

let store: FakeStore;
let job: XlegalJob;
let ownDoc: string;

beforeEach(() => {
  store = new FakeStore();
  ownDoc = store.seed(`xlegal/docs/${JOB_ID}/0-doc.pdf`, "pdf-bytes");
  job = {
    status: "processing",
    tokenHash: TOKEN_HASH,
    cliente: CLIENT,
    files: [
      { url: ownDoc, name: "0-doc.pdf" },
      { url: FOREIGN_DOC, name: "1.pdf" },
    ],
    createdAt: "2026-11-12T07:58:00.000Z",
    source: "page",
  };
  store.seed(jobPath(JOB_ID), job);
  store.seed(tokenMapPath(TOKEN_HASH), { jobId: JOB_ID });
});

function report(state: JobState = { closed: false }) {
  return deliverReport(
    {
      jobId: JOB_ID,
      job,
      token: TOKEN,
      origin: "https://juez.example",
      state,
      informe: INFORME,
      pdf: Buffer.from("%PDF"),
    },
    store,
  );
}

describe("forgetDeliveredJob", () => {
  it("leaves only { status, completedAt, webhookDelivered } and deletes the job and its mapping", async () => {
    store.seed(resultPath(JOB_ID), { status: "done", informe: INFORME, cliente: CLIENT });
    await forgetDeliveredJob(JOB_ID, TOKEN_HASH, "2026-11-12T08:00:00.000Z", store);

    assert.deepEqual(store.json(resultPath(JOB_ID)), {
      status: "done",
      completedAt: "2026-11-12T08:00:00.000Z",
      webhookDelivered: true,
    });
    assert.equal(store.has(jobPath(JOB_ID)), false);
    assert.equal(store.has(tokenMapPath(TOKEN_HASH)), false);
  });

  it("keeps a token mapping that already points at another job", async () => {
    store.seed(tokenMapPath(TOKEN_HASH), { jobId: OTHER_JOB_ID });
    await forgetDeliveredJob(JOB_ID, TOKEN_HASH, "2026-11-12T08:00:00.000Z", store);
    assert.deepEqual(store.json(tokenMapPath(TOKEN_HASH)), { jobId: OTHER_JOB_ID });
  });

  it("retries the redaction once when the first write fails", async () => {
    store.seed(resultPath(JOB_ID), { status: "done", informe: INFORME, cliente: CLIENT });
    store.failPut = (pathname, attempt) => pathname === resultPath(JOB_ID) && attempt === 1;
    await forgetDeliveredJob(JOB_ID, TOKEN_HASH, "2026-11-12T08:00:00.000Z", store);
    assert.equal(store.json<{ webhookDelivered: boolean }>(resultPath(JOB_ID))?.webhookDelivered, true);
    assert.equal(Object.keys(store.json(resultPath(JOB_ID)) ?? {}).length, 3);
  });

  it("deletes the full result when the redaction fails twice, and logs no client data", async () => {
    store.seed(resultPath(JOB_ID), { status: "done", informe: INFORME, cliente: CLIENT });
    store.failPut = (pathname) => pathname === resultPath(JOB_ID);
    let forgotten: boolean | undefined;
    const logs = await captureLogs(async () => {
      forgotten = await forgetDeliveredJob(JOB_ID, TOKEN_HASH, "2026-11-12T08:00:00.000Z", store);
    });
    assert.equal(forgotten, true);
    assert.equal(store.has(resultPath(JOB_ID)), false);
    assert.equal(store.has(jobPath(JOB_ID)), false);
    assert.doesNotMatch(logs, /Cliente Demo|demo@e2e\.local|Honduras/);
  });

  it("keeps the token mapping when the result had to be deleted instead of redacted", async () => {
    // With no result left, the mapping ({ jobId }, no client data) is what still
    // ties this jobId to the token, so a page that is polling can find its report.
    store.seed(resultPath(JOB_ID), { status: "done", informe: INFORME, cliente: CLIENT });
    store.failPut = (pathname) => pathname === resultPath(JOB_ID);
    await captureLogs(() =>
      forgetDeliveredJob(JOB_ID, TOKEN_HASH, "2026-11-12T08:00:00.000Z", store),
    );
    assert.equal(store.has(resultPath(JOB_ID)), false);
    assert.equal(store.has(jobPath(JOB_ID)), false);
    assert.deepEqual(store.json(tokenMapPath(TOKEN_HASH)), { jobId: JOB_ID });
  });

  it("after deleting the unredactable result, tries once more to leave the completion record", async () => {
    // Without any record of the jobId, a retried POST /api/xlegal/jobs for it
    // would start a second generation (Codex [P2]).
    store.seed(resultPath(JOB_ID), { status: "done", informe: INFORME, cliente: CLIENT });
    store.failPut = (pathname, attempt) => pathname === resultPath(JOB_ID) && attempt <= 2;
    let forgotten: boolean | undefined;
    await captureLogs(async () => {
      forgotten = await forgetDeliveredJob(JOB_ID, TOKEN_HASH, "2026-11-12T08:00:00.000Z", store);
    });
    assert.equal(forgotten, true);
    assert.deepEqual(store.json(resultPath(JOB_ID)), {
      status: "done",
      completedAt: "2026-11-12T08:00:00.000Z",
      webhookDelivered: true,
    });
    assert.equal(store.has(jobPath(JOB_ID)), false);
    // The record answers the page's poll now: the mapping can go too.
    assert.equal(store.has(tokenMapPath(TOKEN_HASH)), false);
  });

  it("says so when no completion record could be left at all", async () => {
    store.seed(resultPath(JOB_ID), { status: "done", informe: INFORME, cliente: CLIENT });
    store.failPut = (pathname) => pathname === resultPath(JOB_ID);
    const logs = await captureLogs(() =>
      forgetDeliveredJob(JOB_ID, TOKEN_HASH, "2026-11-12T08:00:00.000Z", store),
    );
    assert.match(logs, /no completion record left/);
  });

  it("reports a full result it could neither redact nor delete, instead of claiming it is gone", async () => {
    store.seed(resultPath(JOB_ID), { status: "done", informe: INFORME, cliente: CLIENT });
    store.failPut = (pathname) => pathname === resultPath(JOB_ID);
    store.failDeleteAt.add(resultPath(JOB_ID));
    let forgotten: boolean | undefined;
    const logs = await captureLogs(async () => {
      forgotten = await forgetDeliveredJob(JOB_ID, TOKEN_HASH, "2026-11-12T08:00:00.000Z", store);
    });
    assert.equal(forgotten, false);
    assert.equal(store.has(resultPath(JOB_ID)), true);
    assert.match(logs, /could not delete the unredacted result/);
    assert.doesNotMatch(logs, /deleted instead of redacted/);
    // The job record still goes: less client data is better than none removed.
    assert.equal(store.has(jobPath(JOB_ID)), false);
  });
});

describe("deliverReport", () => {
  it("delivered: deletes our PDF and our copies of the documents, never x-legal's, and forgets the client", async () => {
    await report();

    assert.equal(store.has(informePdfPath(JOB_ID)), false);
    assert.equal(store.has(`xlegal/docs/${JOB_ID}/0-doc.pdf`), false);
    assert.deepEqual(store.json(resultPath(JOB_ID)), {
      status: "done",
      completedAt: store.webhooks[0].completedAt,
      webhookDelivered: true,
    });
    assert.equal(store.has(jobPath(JOB_ID)), false);
    assert.equal(store.webhooks[0].event, "evaluation.completed");
    assert.equal(store.webhooks[0].result?.score, 72);
  });

  it("webhook failed: deletes our documents, keeps the full result, the PDF and the job for reconciliation", async () => {
    store.webhookOk = () => false;
    await report();

    const result = store.json<{ webhookDelivered: boolean; informe?: unknown }>(resultPath(JOB_ID));
    assert.equal(result?.webhookDelivered, false);
    assert.ok(result?.informe);
    assert.equal(store.has(informePdfPath(JOB_ID)), true);
    assert.equal(store.has(jobPath(JOB_ID)), true);
    // Reconciliation serves the result and the PDF, never the documents.
    assert.equal(store.has(`xlegal/docs/${JOB_ID}/0-doc.pdf`), false);
  });

  it("deletes our documents before the webhook, so a frozen delivery does not leave them behind", async () => {
    let docAtWebhook: boolean | undefined;
    let pdfAtWebhook: boolean | undefined;
    const deliver = store.deliver;
    store.deliver = async (payload) => {
      docAtWebhook = store.has(`xlegal/docs/${JOB_ID}/0-doc.pdf`);
      pdfAtWebhook = store.has(informePdfPath(JOB_ID));
      return deliver(payload);
    };
    await report();
    assert.equal(docAtWebhook, false);
    // The PDF is what the webhook points at: it goes only once x-legal has it.
    assert.equal(pdfAtWebhook, true);
    assert.equal(store.has(informePdfPath(JOB_ID)), false);
  });

  it("logs how many of our copies it could not delete, never their URLs", async () => {
    store.failDelete.add(ownDoc);
    store.failDelete.add(store.url(informePdfPath(JOB_ID)));
    const logs = await captureLogs(() => report());

    assert.match(logs, /could not delete 1 of 1 \(documents\)/);
    assert.match(logs, /could not delete 1 of 1 \(PDF\)/);
    assert.doesNotMatch(logs, /0-doc\.pdf|informe-|blob\.vercel-storage/);
    // The close-out goes on: the client is forgotten all the same.
    assert.equal(store.has(jobPath(JOB_ID)), false);
  });

  it("does not store a PDF when the budget already closed the job", async () => {
    await report({ closed: true });
    assert.equal(store.putCalls.length, 0);
    assert.equal(store.webhooks.length, 0);
  });

  it("deletes the PDF it just stored when the budget closes the job during the write", async () => {
    const state: JobState = { closed: false };
    store.onPut = (pathname) => {
      if (pathname === informePdfPath(JOB_ID)) state.closed = true;
    };
    await report(state);

    assert.equal(store.has(informePdfPath(JOB_ID)), false);
    assert.equal(store.has(resultPath(JOB_ID)), false);
    assert.equal(store.webhooks.length, 0);
  });

  it("logs no client data", async () => {
    const logs = await captureLogs(() => report());
    assert.doesNotMatch(logs, /Cliente Demo|demo@e2e\.local|Honduras/);
  });

  it("the result could not be stored: still delivers the webhook and, on 2xx, forgets the client", async () => {
    store.failPut = (pathname, attempt) => pathname === resultPath(JOB_ID) && attempt === 1;
    await captureLogs(() => report());

    assert.equal(store.webhooks.length, 1);
    assert.equal(store.webhooks[0].event, "evaluation.completed");
    assert.ok(store.webhooks[0].result?.pdfUrl);
    assert.deepEqual(store.json(resultPath(JOB_ID)), {
      status: "done",
      completedAt: store.webhooks[0].completedAt,
      webhookDelivered: true,
    });
    assert.equal(store.has(jobPath(JOB_ID)), false);
    assert.equal(store.has(informePdfPath(JOB_ID)), false);
    assert.equal(store.has(`xlegal/docs/${JOB_ID}/0-doc.pdf`), false);
  });

  it("the result could not be stored and the webhook failed: deletes our PDF and documents", async () => {
    // Nothing can reconcile this report (/status has no result to serve), so no
    // copy of the client's documents or evaluation is kept for 30 days.
    store.failPut = (pathname) => pathname === resultPath(JOB_ID);
    store.webhookOk = () => false;
    await captureLogs(() => report());

    assert.equal(store.webhooks.length, 1);
    assert.equal(store.has(resultPath(JOB_ID)), false);
    assert.equal(store.has(informePdfPath(JOB_ID)), false);
    assert.equal(store.has(`xlegal/docs/${JOB_ID}/0-doc.pdf`), false);
    // The record stays: it is then the only trace of the job.
    assert.equal(store.has(jobPath(JOB_ID)), true);
  });

  it("a result write that committed but answered an error keeps the PDF it points at", async () => {
    // Blob stored the result but the response was lost: /api/xlegal/status
    // serves that result, so its pdfUrl must still work for reconciliation.
    const put = store.put;
    store.put = async (pathname: string, data: Buffer | string) => {
      const url = await put(pathname, data);
      if (pathname === resultPath(JOB_ID) && store.putCalls.filter((p) => p === pathname).length === 1) {
        throw new Error("BLOB_RESPONSE_LOST");
      }
      return url;
    };
    store.webhookOk = () => false;
    await captureLogs(() => report());

    assert.equal(store.json<{ webhookDelivered?: boolean }>(resultPath(JOB_ID))?.webhookDelivered, false);
    assert.equal(store.has(informePdfPath(JOB_ID)), true);
    assert.equal(store.has(jobPath(JOB_ID)), true);
    // The documents go all the same: nothing reconciles from them.
    assert.equal(store.has(`xlegal/docs/${JOB_ID}/0-doc.pdf`), false);
  });

  it("keeps the PDF when it cannot confirm that no result points at it", async () => {
    store.failPut = (pathname) => pathname === resultPath(JOB_ID);
    store.webhookOk = () => false;
    store.readJson = async () => null; // a failed read looks like "absent"
    store.failDeleteAt.add(resultPath(JOB_ID));
    await captureLogs(() => report());

    assert.equal(store.has(informePdfPath(JOB_ID)), true);
    assert.equal(store.has(`xlegal/docs/${JOB_ID}/0-doc.pdf`), false);
  });

  it("only deletes our blobs under xlegal/docs/ or xlegal/informes/, never another path of the store", async () => {
    const marker = store.seed("xlegal/.purge-marker.json", { lastRunAt: "x" });
    const demo = store.seed("casos/demo.pdf", "pdf");
    job.files.push({ url: marker, name: "a" }, { url: demo, name: "b" });
    await report();

    assert.equal(store.has("xlegal/.purge-marker.json"), true);
    assert.equal(store.has("casos/demo.pdf"), true);
    assert.equal(store.has(`xlegal/docs/${JOB_ID}/0-doc.pdf`), false);
  });
});

describe("closeFailedJob", () => {
  const fail = () =>
    closeFailedJob({ jobId: JOB_ID, job, token: TOKEN, code: "TIMEOUT_BUDGET" }, store);

  it("delivered: keeps only { status, error } and deletes the job record and our documents", async () => {
    await fail();

    assert.deepEqual(store.json(resultPath(JOB_ID)), { status: "error", error: "TIMEOUT_BUDGET" });
    assert.equal(store.has(jobPath(JOB_ID)), false);
    assert.equal(store.has(`xlegal/docs/${JOB_ID}/0-doc.pdf`), false);
    assert.equal(store.webhooks[0].event, "evaluation.failed");
    assert.equal(store.webhooks[0].error, "TIMEOUT_BUDGET");
  });

  it("never touches the token mapping: a retry may be writing its own right now", async () => {
    // x-legal returns the attempt when it accepts evaluation.failed, so the page
    // can start a new job (and write a new mapping) while this close-out runs.
    // The mapping only holds { jobId }, and resolveResumableJob already treats a
    // mapping to an error result as "start fresh".
    const original = store.readJson;
    store.readJson = async <T>(pathname: string) => {
      const value = await original<T>(pathname);
      if (pathname === tokenMapPath(TOKEN_HASH)) store.seed(pathname, { jobId: OTHER_JOB_ID });
      return value;
    };
    await fail();
    assert.deepEqual(store.json(tokenMapPath(TOKEN_HASH)), { jobId: JOB_ID });
    assert.equal(store.has(jobPath(JOB_ID)), false);
  });

  it("webhook failed: keeps the job record", async () => {
    store.webhookOk = () => false;
    await fail();
    assert.equal(store.has(jobPath(JOB_ID)), true);
    assert.equal(store.has(`xlegal/docs/${JOB_ID}/0-doc.pdf`), false);
  });

  it("keeps the job record when the error result could not be written", async () => {
    store.failPut = (pathname) => pathname === resultPath(JOB_ID);
    await fail();
    assert.equal(store.has(jobPath(JOB_ID)), true);
  });

  it("logs how many documents it could not delete, never their URLs", async () => {
    store.failDelete.add(ownDoc);
    const logs = await captureLogs(() => fail());
    assert.match(logs, /could not delete 1 of 1 \(documents\)/);
    assert.doesNotMatch(logs, /0-doc\.pdf|blob\.vercel-storage/);
  });
});

describe("pollWithoutJob", () => {
  it("a delivered report whose result could be neither redacted nor deleted still asks x-legal (Codex [P2])", async () => {
    // The job is gone, the full result is still there with webhookDelivered
    // false, and the mapping was kept: the page must not poll until it times out.
    store.seed(resultPath(JOB_ID), {
      status: "done",
      informe: INFORME,
      pdfUrl: "u",
      cliente: CLIENT,
      completedAt: "x",
      webhookDelivered: false,
    });
    store.failPut = (pathname) => pathname === resultPath(JOB_ID);
    store.failDeleteAt.add(resultPath(JOB_ID));
    await captureLogs(() => forgetDeliveredJob(JOB_ID, TOKEN_HASH, "x", store));
    assert.equal(store.has(jobPath(JOB_ID)), false);

    assert.equal((await pollWithoutJob(JOB_ID, TOKEN_HASH, store)).answer, "ask-xlegal");
  });

  it("does not read the mapping when the result already decides", async () => {
    store.seed(resultPath(JOB_ID), { status: "error", error: "TIMEOUT_BUDGET" });
    const read: string[] = [];
    const original = store.readJson;
    store.readJson = async <T>(pathname: string): Promise<T | null> => {
      read.push(pathname);
      return original<T>(pathname);
    };
    const { answer, result } = await pollWithoutJob(JOB_ID, TOKEN_HASH, store);
    assert.equal(answer, "error");
    assert.deepEqual(result, { status: "error", error: "TIMEOUT_BUDGET" });
    assert.deepEqual(read, [resultPath(JOB_ID)]);
  });

  it("an unknown jobId is not found, and another token's mapping does not count", async () => {
    assert.equal((await pollWithoutJob(OTHER_JOB_ID, TOKEN_HASH, store)).answer, "not-found");
    store.seed(tokenMapPath(TOKEN_HASH), { jobId: OTHER_JOB_ID });
    assert.equal((await pollWithoutJob(JOB_ID, TOKEN_HASH, store)).answer, "not-found");
  });
});

describe("pollAnswerWithoutJob", () => {
  it("asks x-legal for an undelivered report when the token's mapping points at it", () => {
    const undelivered: XlegalResult = {
      status: "done",
      informe: INFORME,
      pdfUrl: "u",
      cliente: CLIENT,
      completedAt: "x",
      webhookDelivered: false,
    };
    assert.equal(pollAnswerWithoutJob(undelivered, true), "ask-xlegal");
    assert.equal(pollAnswerWithoutJob({ status: "error", error: "X" }, true), "error");
  });

  it("answers the error of a failed job", () => {
    const result: XlegalResult = { status: "error", error: "TIMEOUT_BUDGET" };
    assert.equal(pollAnswerWithoutJob(result), "error");
  });

  it("asks x-legal only for a delivered result", () => {
    assert.equal(
      pollAnswerWithoutJob({ status: "done", completedAt: "x", webhookDelivered: true }),
      "ask-xlegal",
    );
  });

  it("asks x-legal when there is no result but the token's mapping points at this jobId", () => {
    assert.equal(pollAnswerWithoutJob(null, true), "ask-xlegal");
  });

  it("is not found for an unknown jobId or a result not delivered yet", () => {
    assert.equal(pollAnswerWithoutJob(null), "not-found");
    assert.equal(pollAnswerWithoutJob(null, false), "not-found");
    assert.equal(
      pollAnswerWithoutJob({
        status: "done",
        informe: INFORME,
        pdfUrl: "u",
        cliente: CLIENT,
        completedAt: "x",
        webhookDelivered: false,
      }),
      "not-found",
    );
  });
});
