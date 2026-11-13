import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { purgeExpiredXlegalData, runPurgeIfDue } from "../xlegal-purge";
import { PURGE_MARKER_PATH, RETENTION_MS } from "../retention";
import { jobPath, resultPath, tokenMapPath } from "../xlegal";
import { FakeStore, captureLogs } from "./fake-store";

const NOW = new Date("2026-11-12T08:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const OLD = (ms = 0) => new Date(NOW.getTime() - RETENTION_MS - HOUR - ms);
const FRESH = new Date(NOW.getTime() - HOUR);
const JOB_A = "0b6f1c1e-6a39-4c51-9f0c-2b1f8f4a7d10";
const JOB_B = "7c2d9e0a-1b3f-4a5c-8d6e-9f0a1b2c3d4e";
const TOKEN_HASH = "e".repeat(64);
const CLIENT = { nombre: "Cliente Demo E2E", email: "demo@e2e.local", pais: "Honduras" };
const INFORME = { score: 72, level: "medio", headline: "Caso con base", detalle: "x".repeat(2000) };

let store: FakeStore;

beforeEach(() => {
  store = new FakeStore();
  store.now = () => NOW;
});

describe("purgeExpiredXlegalData", () => {
  it("deletes what is older than 30 days under xlegal/, and nothing else", async () => {
    store.seed(`xlegal/results/${JOB_A}.json`, { status: "error", error: "X" }, OLD());
    store.seed(`xlegal/docs/${JOB_A}/0-Nombre Cliente.pdf`, "pdf", OLD());
    store.seed(`xlegal/jobs/${JOB_B}.json`, { status: "processing" }, FRESH);
    store.seed("pro/results/old.json", {}, OLD());
    store.seed(PURGE_MARKER_PATH, { lastRunAt: OLD().toISOString() }, OLD());

    const logs = await captureLogs(async () => {
      const report = await purgeExpiredXlegalData("cron", { now: NOW }, store);
      assert.equal(report.expired, 2);
      assert.equal(report.deleted, 2);
      assert.equal(report.failed, 0);
      assert.equal(report.remaining, 0);
      assert.deepEqual(report.byFolder, { results: 1, docs: 1 });
    });

    assert.equal(store.has(`xlegal/results/${JOB_A}.json`), false);
    assert.equal(store.has(`xlegal/docs/${JOB_A}/0-Nombre Cliente.pdf`), false);
    assert.equal(store.has(`xlegal/jobs/${JOB_B}.json`), true);
    assert.equal(store.has("pro/results/old.json"), true);
    // The log carries counts per folder, never a pathname.
    assert.doesNotMatch(logs, /Nombre Cliente/);
  });

  it("stamps the marker only after a complete sweep", async () => {
    store.seed(`xlegal/jobs/${JOB_A}.json`, {}, OLD());
    await captureLogs(() => purgeExpiredXlegalData("cron", { now: NOW }, store));
    assert.deepEqual(store.json(PURGE_MARKER_PATH), {
      lastRunAt: NOW.toISOString(),
      trigger: "cron",
    });
  });

  it("with a cap, deletes the oldest first, reports the rest and leaves the marker alone", async () => {
    store.seed(`xlegal/jobs/${JOB_A}.json`, {}, OLD(3 * HOUR));
    store.seed(`xlegal/jobs/${JOB_B}.json`, {}, OLD(2 * HOUR));
    store.seed(`xlegal/results/${JOB_B}.json`, {}, OLD(1 * HOUR));

    let report;
    await captureLogs(async () => {
      report = await purgeExpiredXlegalData("jobs", { now: NOW, maxDeletes: 2 }, store);
    });
    assert.equal(report!.deleted, 2);
    assert.equal(report!.remaining, 1);
    assert.equal(store.has(`xlegal/jobs/${JOB_A}.json`), false);
    assert.equal(store.has(`xlegal/jobs/${JOB_B}.json`), false);
    assert.equal(store.has(`xlegal/results/${JOB_B}.json`), true);
    assert.equal(store.has(PURGE_MARKER_PATH), false);
  });

  it("does not stamp the marker when a delete fails, so the next request retries", async () => {
    const ref = store.seed(`xlegal/jobs/${JOB_A}.json`, {}, OLD());
    store.failDelete.add(ref);
    let report;
    await captureLogs(async () => {
      report = await purgeExpiredXlegalData("jobs", { now: NOW }, store);
    });
    assert.equal(report!.failed, 1);
    assert.equal(store.has(PURGE_MARKER_PATH), false);
  });

  it("cron: redacts a delivered result written before 2026-11-12 and forgets its job", async () => {
    store.seed(
      resultPath(JOB_A),
      {
        status: "done",
        informe: INFORME,
        pdfUrl: "https://store.public.blob.vercel-storage.com/x.pdf",
        cliente: CLIENT,
        completedAt: "2026-11-01T10:00:00.000Z",
        webhookDelivered: true,
      },
      FRESH,
    );
    store.seed(jobPath(JOB_A), { tokenHash: TOKEN_HASH, cliente: CLIENT }, FRESH);
    store.seed(tokenMapPath(TOKEN_HASH), { jobId: JOB_A }, FRESH);
    // Not delivered: the reconciliation path still needs it.
    const pending = {
      status: "done",
      informe: INFORME,
      pdfUrl: "u",
      cliente: CLIENT,
      completedAt: "2026-11-11T10:00:00.000Z",
      webhookDelivered: false,
    };
    store.seed(resultPath(JOB_B), pending, FRESH);

    let report;
    const logs = await captureLogs(async () => {
      report = await purgeExpiredXlegalData("cron", { now: NOW }, store);
    });

    assert.equal(report!.redacted, 1);
    assert.deepEqual(store.json(resultPath(JOB_A)), {
      status: "done",
      completedAt: "2026-11-01T10:00:00.000Z",
      webhookDelivered: true,
    });
    assert.equal(store.has(jobPath(JOB_A)), false);
    assert.equal(store.has(tokenMapPath(TOKEN_HASH)), false);
    assert.deepEqual(store.json(resultPath(JOB_B)), pending);
    assert.doesNotMatch(logs, /Cliente Demo|demo@e2e\.local|Honduras/);
  });

  it("the opportunistic trigger does not read results (no backfill inside an evaluation)", async () => {
    store.seed(
      resultPath(JOB_A),
      { status: "done", informe: INFORME, cliente: CLIENT, completedAt: "x", webhookDelivered: true },
      FRESH,
    );
    let report;
    await captureLogs(async () => {
      report = await purgeExpiredXlegalData("jobs", { now: NOW }, store);
    });
    assert.equal(report!.redacted, 0);
    assert.ok(store.json<{ informe?: unknown }>(resultPath(JOB_A))?.informe);
  });
});

describe("runPurgeIfDue", () => {
  it("does nothing within 24 h of the last complete sweep", async () => {
    store.seed(PURGE_MARKER_PATH, { lastRunAt: new Date(NOW.getTime() - HOUR).toISOString() });
    const report = await runPurgeIfDue("jobs", { now: NOW, env: {} }, store);
    assert.equal(report, null);
    assert.deepEqual(store.listCalls, []);
  });

  it("sweeps when the marker is stale, capped", async () => {
    store.seed(PURGE_MARKER_PATH, { lastRunAt: new Date(NOW.getTime() - 25 * HOUR).toISOString() });
    store.seed(`xlegal/jobs/${JOB_A}.json`, {}, OLD());
    let report;
    await captureLogs(async () => {
      report = await runPurgeIfDue("jobs", { now: NOW, env: {} }, store);
    });
    assert.equal(report!.deleted, 1);
    assert.ok(report!.maxDeletes !== null && report!.maxDeletes > 0);
  });

  it("never sweeps from a Vercel preview, which shares production's Blob store", async () => {
    store.seed(`xlegal/jobs/${JOB_A}.json`, {}, OLD());
    const report = await runPurgeIfDue("jobs", { now: NOW, env: { VERCEL_ENV: "preview" } }, store);
    assert.equal(report, null);
    assert.equal(store.has(`xlegal/jobs/${JOB_A}.json`), true);
    assert.deepEqual(store.listCalls, []);
  });

  it("never throws", async () => {
    store.list = async () => {
      throw new Error("BLOB_UNAVAILABLE");
    };
    let report;
    await captureLogs(async () => {
      report = await runPurgeIfDue("jobs", { now: NOW, env: {} }, store);
    });
    assert.equal(report, null);
  });
});
