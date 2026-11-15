import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BlobError, BlobServiceNotAvailable } from "@vercel/blob";
import { safeBlobErrorMessage, storageDeleteMany } from "../storage";
import { captureLogs } from "./fake-store";

const BLOB = "https://abc123.public.blob.vercel-storage.com/";
const CLIENT_FILE = `${BLOB}xlegal/docs/Pasaporte%20Nombre%20Cliente-AbC.pdf`;

describe("safeBlobErrorMessage", () => {
  it("keeps the fixed message of a known Blob error", () => {
    assert.match(safeBlobErrorMessage(new BlobServiceNotAvailable()), /not available/);
  });

  it("drops a message the Blob server wrote, which may quote a URL or pathname", () => {
    const message = safeBlobErrorMessage(
      new BlobError(`Bad request: ${CLIENT_FILE} xlegal/docs/Nombre Cliente.pdf`),
    );
    assert.doesNotMatch(message, /Nombre|Cliente|xlegal|https?:/);
    assert.match(message, /BlobError/);
  });

  it("keeps only the kind of any other error", () => {
    const message = safeBlobErrorMessage(new TypeError(`fetch failed for ${CLIENT_FILE}`));
    assert.equal(message, "TypeError");
  });

  it("keeps the code of one of our own CODE:detail errors, never its detail", () => {
    // /api/upload refuses a pathname with PATHNAME_NOT_ALLOWED, and storagePut
    // with UNSAFE_PATH:<pathname> — whose pathname carries the client's file name.
    assert.equal(safeBlobErrorMessage(new Error("PATHNAME_NOT_ALLOWED")), "PATHNAME_NOT_ALLOWED");
    assert.equal(
      safeBlobErrorMessage(new Error("UNSAFE_PATH:pro/docs/job/0-Pasaporte Nombre Cliente.pdf")),
      "UNSAFE_PATH",
    );
  });
});

describe("storageDeleteMany", () => {
  it("counts a refused batch as failed and logs no URL of it", async () => {
    let result;
    const logs = await captureLogs(async () => {
      result = await storageDeleteMany([CLIENT_FILE], async () => {
        throw new BlobError(`Bad request: ${CLIENT_FILE}`);
      });
    });
    assert.deepEqual(result, { deleted: 0, failed: 1 });
    assert.match(logs, /could not delete a batch of 1/);
    assert.doesNotMatch(logs, /Nombre|Cliente|Pasaporte|https?:/);
  });

  it("deletes in batches of 100", async () => {
    const refs = Array.from({ length: 150 }, (_, i) => `${BLOB}xlegal/jobs/${i}.json`);
    const batches: number[] = [];
    const result = await storageDeleteMany(refs, async (urls) => {
      batches.push(urls.length);
    });
    assert.deepEqual(result, { deleted: 150, failed: 0 });
    assert.deepEqual(batches, [100, 50]);
  });
});
