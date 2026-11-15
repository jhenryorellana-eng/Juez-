import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../../app/api/upload/route";
import { captureLogs } from "./fake-store";

const ORIGINAL_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = ORIGINAL_TOKEN;
});

describe("POST /api/upload", () => {
  it("refuses a pathname outside the upload folders and logs its code, never the file name", async () => {
    // A placeholder, not a real token: the request is refused before any use of it.
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_placeholder_for_tests";
    let status = 0;
    const logs = await captureLogs(async () => {
      const res = await POST(
        new Request("https://juez.example/api/upload", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "10.0.1.1" },
          body: JSON.stringify({
            type: "blob.generate-client-token",
            payload: {
              pathname: "xlegal/results/Pasaporte Nombre Cliente.pdf",
              callbackUrl: "https://juez.example/api/upload",
              clientPayload: null,
              multipart: false,
            },
          }),
        }),
      );
      status = res.status;
    });
    assert.equal(status, 400);
    assert.match(logs, /\[upload\] error: PATHNAME_NOT_ALLOWED/);
    assert.doesNotMatch(logs, /Pasaporte|Nombre|Cliente|xlegal\/results/);
  });
});
