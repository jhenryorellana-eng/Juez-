import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRO_CLOSEOUT_RESERVE_MS,
  PRO_JOB_ERROR_MESSAGE,
  PRO_MAX_DURATION_MS,
  processProJob,
  proInformePath,
  proResultPath,
  type ProJobDeps,
} from "../pro-job";
import type { Informe, ProJob, ProResult } from "../types";
import { FakeStore, captureLogs } from "./fake-store";

const JOB_ID = "4c0a7f3e-1d2b-4e5f-8a9b-0c1d2e3f4a5b";
const CLIENT = { nombre: "Cliente Demo E2E", email: "demo@e2e.local", pais: "Honduras" };
const INFORME = { score: 72, level: "moderado", headline: "Caso con base" } as unknown as Informe;

let store: FakeStore;
let job: ProJob;
let deleted: string[][];

beforeEach(() => {
  store = new FakeStore();
  deleted = [];
  job = {
    status: "processing",
    cliente: CLIENT,
    files: [{ url: store.seed("casos/abc/0-doc.pdf", "pdf-bytes"), name: "0-doc.pdf" }],
    createdAt: "2026-11-14T08:00:00.000Z",
  };
});

function deps(overrides: Partial<ProJobDeps> = {}): ProJobDeps {
  return {
    build: async () => ({ informe: INFORME, pdf: Buffer.from("%PDF") }),
    put: store.put,
    deleteFiles: async (urls) => {
      deleted.push(urls);
    },
    ...overrides,
  };
}

describe("processProJob", () => {
  it("stores the report and its PDF, and deletes the client's documents", async () => {
    await captureLogs(() => processProJob(JOB_ID, job, Date.now(), deps()));
    const result = store.json<ProResult>(proResultPath(JOB_ID));
    assert.equal(result?.status, "done");
    assert.ok(store.has(proInformePath(JOB_ID)));
    assert.deepEqual(deleted, [[job.files[0].url]]);
  });

  it("a failed generation ends in an error result the client sees (and can retry), keeping the documents", async () => {
    const logs = await captureLogs(() =>
      processProJob(
        JOB_ID,
        job,
        Date.now(),
        deps({
          build: async () => {
            throw new Error("MODEL_JSON_INVALID");
          },
        }),
      ),
    );
    assert.deepEqual(store.json(proResultPath(JOB_ID)), { status: "error", error: PRO_JOB_ERROR_MESSAGE });
    assert.equal(store.has(proInformePath(JOB_ID)), false);
    // POST /api/pro/run restarts an error result, and the retry needs the documents.
    assert.deepEqual(deleted, []);
    assert.match(logs, /\[pro:job\] error: MODEL_JSON_INVALID/);
  });

  it("hands the generation a deadline: the request's start + maxDuration, minus what the PDF and the writes need", async () => {
    // generateJsonWith retries an invalid answer only if a second try fits
    // before it: past maxDuration the platform kills the job, which then never
    // writes a result and the client is left on «processing».
    const requestStartedAt = Date.now() - 42_000;
    let deadline: number | undefined;
    await captureLogs(() =>
      processProJob(
        JOB_ID,
        job,
        requestStartedAt,
        deps({
          build: async (_files, _cliente, options) => {
            deadline = options.deadline;
            return { informe: INFORME, pdf: Buffer.from("%PDF") };
          },
        }),
      ),
    );
    assert.equal(deadline, requestStartedAt + PRO_MAX_DURATION_MS - PRO_CLOSEOUT_RESERVE_MS);
    assert.ok(PRO_CLOSEOUT_RESERVE_MS >= 20_000 && PRO_CLOSEOUT_RESERVE_MS < PRO_MAX_DURATION_MS / 4);
  });

  it("measures that deadline against the maxDuration /api/pro/run declares", async () => {
    // A route's segment config must stay a literal (Next reads it statically):
    // this is what keeps the two from drifting apart.
    const route = await import("../../app/api/pro/run/route");
    assert.equal(route.maxDuration * 1000, PRO_MAX_DURATION_MS);
  });

  it("logs a coded error's code, never its detail (the document's name)", async () => {
    const logs = await captureLogs(() =>
      processProJob(
        JOB_ID,
        job,
        Date.now(),
        deps({
          build: async () => {
            throw new Error("DOWNLOAD_FAILED:0-Pasaporte Cliente Demo.pdf");
          },
        }),
      ),
    );
    assert.match(logs, /DOWNLOAD_FAILED/);
    assert.doesNotMatch(logs, /Pasaporte|Cliente Demo/);
  });
});
