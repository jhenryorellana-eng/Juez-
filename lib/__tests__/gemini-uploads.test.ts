import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GeminiUploads } from "../gemini-uploads";
import { captureLogs } from "./fake-store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function recorder() {
  const deleted: string[] = [];
  const deleteFile = async (name: string) => {
    await new Promise((r) => setTimeout(r, 5));
    deleted.push(name);
  };
  return { deleted, deleteFile };
}

describe("GeminiUploads", () => {
  it("release() deletes every uploaded file and only resolves once they are deleted", async () => {
    const { deleted, deleteFile } = recorder();
    const uploads = new GeminiUploads(deleteFile);
    await uploads.upload(async () => ({ name: "files/a" }));
    await uploads.upload(async () => ({ name: "files/b" }));

    await uploads.release();
    assert.deepEqual(deleted.sort(), ["files/a", "files/b"]);
  });

  it("waits for an upload still in flight and deletes it too", async () => {
    const { deleted, deleteFile } = recorder();
    const uploads = new GeminiUploads(deleteFile);
    const pending = deferred<{ name: string }>();
    const upload = uploads.upload(() => pending.promise);

    const released = uploads.release();
    setTimeout(() => pending.resolve({ name: "files/late" }), 10);
    await released;
    await upload;
    assert.deepEqual(deleted, ["files/late"]);
  });

  it("a failed upload does not break release()", async () => {
    const { deleted, deleteFile } = recorder();
    const uploads = new GeminiUploads(deleteFile);
    await assert.rejects(
      uploads.upload(async () => {
        throw new Error("UPLOAD_FAILED");
      }),
    );
    await uploads.release();
    assert.deepEqual(deleted, []);
  });

  it("a delete that fails is logged, never thrown", async () => {
    const uploads = new GeminiUploads(async () => {
      throw new Error("PERMISSION_DENIED");
    });
    await uploads.upload(async () => ({ name: "files/a" }));
    const logs = await captureLogs(() => uploads.release());
    assert.match(logs, /could not delete/);
  });

  it("ignores an upload without a name", async () => {
    const { deleted, deleteFile } = recorder();
    const uploads = new GeminiUploads(deleteFile);
    await uploads.upload(async () => ({}));
    await uploads.release();
    assert.deepEqual(deleted, []);
  });

  it("an upload that lands after release() is deleted on arrival", async () => {
    const { deleted, deleteFile } = recorder();
    const uploads = new GeminiUploads(deleteFile);
    await uploads.release();
    await uploads.upload(async () => ({ name: "files/after" }));
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(deleted, ["files/after"]);
  });
});
