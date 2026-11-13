import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// lib/storage.ts fixes its `.dev-store/` under process.cwd() when it loads, so
// the test moves to a scratch folder and imports it afterwards. Each test file
// runs in its own process (node --test), so this does not leak.
let dir: string;
let storage: typeof import("../storage");
const originalCwd = process.cwd();

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "juez-storage-"));
  process.chdir(dir);
  delete process.env.BLOB_READ_WRITE_TOKEN;
  storage = await import("../storage");
});

after(() => {
  process.chdir(originalCwd);
  // On Windows something (search indexer, antivirus) can still hold a handle on
  // a file just written: rmSync then fails with EPERM, and the whole file is
  // reported as failed although every test passed. rmSync retries EPERM/EBUSY.
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe("storageDeleteAt (local store)", () => {
  it("deletes the file", async () => {
    const file = path.join(dir, ".dev-store", "xlegal", "jobs", "a.json");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "{}");
    await storage.storageDeleteAt("xlegal/jobs/a.json");
    assert.equal(existsSync(file), false);
  });

  it("treats a file that is already gone as deleted", async () => {
    await storage.storageDeleteAt("xlegal/jobs/missing.json");
  });

  it("surfaces any other failure, so a caller never reports a deletion that did not happen", async () => {
    mkdirSync(path.join(dir, ".dev-store", "xlegal", "results", "dir.json"), { recursive: true });
    await assert.rejects(storage.storageDeleteAt("xlegal/results/dir.json"));
  });
});
