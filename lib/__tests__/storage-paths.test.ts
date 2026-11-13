import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exactBlob, isAllowedUploadPathname } from "../storage-paths";

const MARKER = "xlegal/.purge-marker.json";

describe("exactBlob", () => {
  it("returns the blob whose pathname is exactly the one asked for", () => {
    const real = { pathname: MARKER, url: "real" };
    const planted = { pathname: `${MARKER}/x-AbC123.txt`, url: "planted" };
    assert.equal(exactBlob([planted, real], MARKER), real);
  });

  it("does not take a longer pathname that merely starts with it", () => {
    const planted = { pathname: `${MARKER}/x-AbC123.txt`, url: "planted" };
    assert.equal(exactBlob([planted], MARKER), undefined);
  });
});

describe("isAllowedUploadPathname", () => {
  it("allows the folders the browser uploads to", () => {
    assert.equal(isAllowedUploadPathname("casos/Documento.pdf"), true);
    assert.equal(isAllowedUploadPathname("xlegal/docs/Documento.pdf"), true);
    assert.equal(isAllowedUploadPathname("casos/Acta..final.pdf"), true);
  });

  it("refuses every other pathname of the store", () => {
    for (const pathname of [
      MARKER,
      `${MARKER}/x.txt`,
      "xlegal/results/0b6f1c1e-6a39-4c51-9f0c-2b1f8f4a7d10.json/x.txt",
      "xlegal/jobs/a.json",
      "xlegal/tokens/a.json",
      "xlegal/informes/a.pdf",
      "pro/results/a.json",
      "xlegal/docs/../results/a.json",
      "casos/./a.pdf",
      "casos/",
      "",
    ]) {
      assert.equal(isAllowedUploadPathname(pathname), false, pathname);
    }
  });
});
