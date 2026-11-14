import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PURGE_INTERVAL_MS,
  PURGE_MARKER_PATH,
  RETENTION_MS,
  folderOf,
  oldestFirst,
  purgeIsDue,
  resultJobId,
  selectExpired,
  sweepEnabledHere,
} from "../retention";

const NOW = new Date("2026-11-12T08:00:00.000Z");
const CUTOFF = NOW.getTime() - RETENTION_MS;
const HOUR = 60 * 60 * 1000;
const JOB_ID = "0b6f1c1e-6a39-4c51-9f0c-2b1f8f4a7d10";

const obj = (pathname: string, uploadedAt: Date | number) => ({
  pathname,
  uploadedAt: uploadedAt instanceof Date ? uploadedAt : new Date(uploadedAt),
});

describe("selectExpired", () => {
  it("never selects anything outside xlegal/", () => {
    const old = CUTOFF - 365 * 24 * HOUR;
    const picked = selectExpired(
      [obj("pro/results/x.json", old), obj("casos/a.pdf", old), obj("xlegalx/a.json", old)],
      NOW,
    );
    assert.deepEqual(picked, []);
  });

  it("never selects the purge marker, however old", () => {
    const picked = selectExpired([obj(PURGE_MARKER_PATH, 0)], NOW);
    assert.deepEqual(picked, []);
  });

  it("keeps an object uploaded exactly at the cutoff and deletes one 1 ms older", () => {
    const atCutoff = obj("xlegal/results/a.json", CUTOFF);
    const older = obj("xlegal/results/b.json", CUTOFF - 1);
    assert.deepEqual(selectExpired([atCutoff, older], NOW), [older]);
  });

  it("keeps an object whose date cannot be read", () => {
    assert.deepEqual(selectExpired([obj("xlegal/jobs/a.json", new Date("x"))], NOW), []);
  });

  it("selects nothing when `now` is invalid", () => {
    const old = obj("xlegal/jobs/a.json", 0);
    assert.deepEqual(selectExpired([old], new Date("not a date")), []);
  });
});

describe("purgeIsDue", () => {
  it("is due without a marker or with an unreadable one", () => {
    assert.equal(purgeIsDue(null, NOW), true);
    assert.equal(purgeIsDue(undefined, NOW), true);
    assert.equal(purgeIsDue("basura", NOW), true);
  });

  it("is not due 23 h after the last sweep, and is due at 24 h", () => {
    assert.equal(purgeIsDue(new Date(NOW.getTime() - 23 * HOUR).toISOString(), NOW), false);
    assert.equal(
      purgeIsDue(new Date(NOW.getTime() - PURGE_INTERVAL_MS).toISOString(), NOW),
      true,
    );
  });

  it("treats a marker more than a whole interval in the future as a broken clock (due)", () => {
    assert.equal(purgeIsDue(new Date(NOW.getTime() + 25 * HOUR).toISOString(), NOW), true);
    // A few seconds of skew between instances is not a broken clock.
    assert.equal(purgeIsDue(new Date(NOW.getTime() + 5_000).toISOString(), NOW), false);
  });
});

describe("folderOf", () => {
  it("returns the folder, never the file name", () => {
    assert.equal(folderOf(`xlegal/results/${JOB_ID}.json`), "results");
    assert.equal(folderOf("xlegal/docs/abc/0-Nombre Cliente.pdf"), "docs");
    assert.equal(folderOf(PURGE_MARKER_PATH), "(root)");
  });
});

describe("oldestFirst", () => {
  it("orders by upload time, oldest first, and caps the list", () => {
    const a = obj("xlegal/a", 3);
    const b = obj("xlegal/b", 1);
    const c = obj("xlegal/c", 2);
    assert.deepEqual(oldestFirst([a, b, c]), [b, c, a]);
    assert.deepEqual(oldestFirst([a, b, c], 2), [b, c]);
  });

  it("does not reorder the caller's array", () => {
    const list = [obj("xlegal/a", 2), obj("xlegal/b", 1)];
    oldestFirst(list, 1);
    assert.equal(list[0].pathname, "xlegal/a");
  });
});

describe("resultJobId", () => {
  it("extracts the jobId of a result path and rejects everything else", () => {
    assert.equal(resultJobId(`xlegal/results/${JOB_ID}.json`), JOB_ID);
    assert.equal(resultJobId(`xlegal/results/${JOB_ID}.json/planted.txt`), null);
    assert.equal(resultJobId(`xlegal/jobs/${JOB_ID}.json`), null);
    assert.equal(resultJobId("xlegal/results/not-a-uuid.json"), null);
  });
});

describe("sweepEnabledHere", () => {
  it("is off in Vercel preview deployments, which share production's Blob store", () => {
    assert.equal(sweepEnabledHere({ VERCEL_ENV: "preview" }), false);
  });

  it("is on in production and locally", () => {
    assert.equal(sweepEnabledHere({ VERCEL_ENV: "production" }), true);
    assert.equal(sweepEnabledHere({ VERCEL_ENV: "production", BLOB_READ_WRITE_TOKEN: "t" }), true);
    assert.equal(sweepEnabledHere({}), true);
  });

  it("is off on a local machine that holds the Blob token: there is only one store, production's", () => {
    assert.equal(sweepEnabledHere({ BLOB_READ_WRITE_TOKEN: "t" }), false);
  });

  it("is off in any environment that is not production (allow list, not deny list)", () => {
    // `vercel env pull` writes VERCEL_ENV=development into .env.local.
    assert.equal(sweepEnabledHere({ VERCEL_ENV: "development" }), false);
    assert.equal(sweepEnabledHere({ VERCEL_ENV: "development", BLOB_READ_WRITE_TOKEN: "t" }), false);
    assert.equal(sweepEnabledHere({ VERCEL_ENV: "staging" }), false);
  });
});
