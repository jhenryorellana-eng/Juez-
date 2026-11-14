import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../../app/api/xlegal/purge/route";
import { captureLogs } from "./fake-store";

const ORIGINAL_SECRET = process.env.CRON_SECRET;

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
});

/**
 * Every call sends a WRONG bearer, so none of them can reach the sweep itself
 * (which, on a machine without a Blob token, would sweep `.dev-store/`). A
 * distinct IP per test keeps the per-IP rate limit out of the way.
 */
async function callPurge(secret: string, ip: string): Promise<{ status: number; logs: string }> {
  process.env.CRON_SECRET = secret;
  let status = 0;
  const logs = await captureLogs(async () => {
    const res = await GET(
      new Request("https://juez.example/api/xlegal/purge", {
        headers: { authorization: "Bearer not-the-secret", "x-forwarded-for": ip },
      }),
    );
    status = res.status;
  });
  return { status, logs };
}

describe("GET /api/xlegal/purge — CRON_SECRET", () => {
  it("refuses to run with a secret shorter than 32 bytes, and never logs it", async () => {
    const secret = "weak-cron-secret-of-31-bytes-xx";
    assert.equal(Buffer.byteLength(secret, "utf8"), 31);
    const { status, logs } = await callPurge(secret, "10.0.0.1");
    assert.equal(status, 503);
    assert.match(logs, /shorter than 32 bytes/);
    assert.doesNotMatch(logs, /weak-cron-secret/);
  });

  it("counts bytes, not characters: 16 «ñ» are 32 bytes and go on to the bearer check", async () => {
    const secret = "ñ".repeat(16);
    assert.equal(Buffer.byteLength(secret, "utf8"), 32);
    const { status } = await callPurge(secret, "10.0.0.2");
    assert.equal(status, 401);
  });

  it("a 32-byte secret goes on to the bearer check", async () => {
    const { status } = await callPurge("s".repeat(32), "10.0.0.3");
    assert.equal(status, 401);
  });

  it("an unset secret is still refused with 503", async () => {
    const { status, logs } = await callPurge("", "10.0.0.4");
    assert.equal(status, 503);
    assert.match(logs, /CRON_SECRET is not set/);
  });
});
