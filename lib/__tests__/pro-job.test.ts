import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRO_JOB_ERROR_MESSAGE,
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
    await captureLogs(() => processProJob(JOB_ID, job, deps()));
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

  it("logs a coded error's code, never its detail (the document's name)", async () => {
    const logs = await captureLogs(() =>
      processProJob(
        JOB_ID,
        job,
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
