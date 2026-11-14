import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { processXlegalJob, type JobDeps } from "../xlegal-job";
import { informePdfPath } from "../xlegal-closeout";
import { jobPath, resultPath, tokenMapPath } from "../xlegal";
import type { Informe, XlegalJob } from "../types";
import { FakeStore, captureLogs } from "./fake-store";

const JOB_ID = "0b6f1c1e-6a39-4c51-9f0c-2b1f8f4a7d10";
const TOKEN = "tok_abcdefghijklmnopqrstuvwxyz";
const TOKEN_HASH = "f".repeat(64);
const CLIENT = { nombre: "Cliente Demo E2E", email: "demo@e2e.local", pais: "Honduras" };
const INFORME = { score: 72, level: "medio", headline: "Caso con base" } as unknown as Informe;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let store: FakeStore;
let job: XlegalJob;

beforeEach(() => {
  store = new FakeStore();
  const ownDoc = store.seed(`xlegal/docs/${JOB_ID}/0-doc.pdf`, "pdf-bytes");
  job = {
    status: "processing",
    tokenHash: TOKEN_HASH,
    cliente: CLIENT,
    files: [{ url: ownDoc, name: "0-doc.pdf" }],
    createdAt: "2026-11-12T07:58:00.000Z",
    source: "page",
  };
  store.seed(jobPath(JOB_ID), job);
  store.seed(tokenMapPath(TOKEN_HASH), { jobId: JOB_ID });
});

function run(deps: Partial<JobDeps> = {}) {
  return processXlegalJob(JOB_ID, job, TOKEN, "https://juez.example", Date.now(), {
    generate: async () => ({ informe: INFORME, pdf: Buffer.from("%PDF") }),
    closeout: store,
    budgetMs: 60_000,
    ...deps,
  });
}

describe("processXlegalJob", () => {
  it("delivered: the client is forgotten before the job returns", async () => {
    await captureLogs(() => run());
    assert.deepEqual(store.json(resultPath(JOB_ID)), {
      status: "done",
      completedAt: store.webhooks[0].completedAt,
      webhookDelivered: true,
    });
    assert.equal(store.has(jobPath(JOB_ID)), false);
  });

  it("a budget that runs out during the webhook still waits for the client to be forgotten", async () => {
    // The report is ready and claimed (state.closed) when the budget fires: the
    // job must not return — and let the platform freeze the instance — before
    // the documents, the PDF and the job record are gone.
    const deliver = store.deliver;
    store.deliver = async (payload) => {
      await sleep(80);
      return deliver(payload);
    };
    await captureLogs(() => run({ budgetMs: 10 }));

    assert.equal(store.webhooks.length, 1);
    assert.equal(store.webhooks[0].event, "evaluation.completed");
    assert.equal(store.has(jobPath(JOB_ID)), false);
    assert.equal(store.has(informePdfPath(JOB_ID)), false);
    assert.equal(store.has(`xlegal/docs/${JOB_ID}/0-doc.pdf`), false);
    assert.equal(store.json<{ webhookDelivered?: boolean }>(resultPath(JOB_ID))?.webhookDelivered, true);
  });

  it("a budget that runs out during the generation closes the job as failed", async () => {
    await captureLogs(() =>
      run({
        budgetMs: 10,
        generate: () => new Promise(() => {}),
      }),
    );
    assert.equal(store.webhooks.length, 1);
    assert.equal(store.webhooks[0].event, "evaluation.failed");
    assert.equal(store.webhooks[0].error, "TIMEOUT_BUDGET");
  });

  it("reports a model answer that is not JSON as MODEL_JSON_INVALID, not GENERATION_FAILED", async () => {
    await captureLogs(() =>
      run({
        generate: async () => {
          throw new Error("MODEL_JSON_INVALID");
        },
      }),
    );
    assert.equal(store.webhooks[0].event, "evaluation.failed");
    assert.equal(store.webhooks[0].error, "MODEL_JSON_INVALID");
    assert.deepEqual(store.json(resultPath(JOB_ID)), { status: "error", error: "MODEL_JSON_INVALID" });
  });

  it("logs the kind of an uncoded error, never its message", async () => {
    // What JSON.parse threw before MODEL_JSON_INVALID: its message quotes the answer.
    const logs = await captureLogs(() =>
      run({
        generate: async () => JSON.parse('{"headline": "Cliente Demo E2E, Honduras'),
      }),
    );
    assert.equal(store.webhooks[0].error, "GENERATION_FAILED");
    assert.match(logs, /GENERATION_FAILED — SyntaxError/);
    assert.doesNotMatch(logs, /Cliente Demo|Honduras|headline/);
  });

  it("logs no score and no client data", async () => {
    const logs = await captureLogs(() => run());
    assert.doesNotMatch(logs, /score|\b72\b/);
    assert.doesNotMatch(logs, /Cliente Demo|demo@e2e\.local|Honduras/);
  });
});
