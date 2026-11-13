import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  blobUrlPathname,
  exactBlob,
  isAllowedUploadPathname,
  isXlegalClientFilePathname,
  isXlegalUploadedDocUrl,
} from "../storage-paths";

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

const BLOB = "https://abc123.public.blob.vercel-storage.com/";

describe("blobUrlPathname", () => {
  it("is the decoded pathname of a Vercel Blob URL", () => {
    assert.equal(blobUrlPathname(`${BLOB}xlegal/docs/Acta%20Nacimiento-AbC.pdf`), "xlegal/docs/Acta Nacimiento-AbC.pdf");
  });

  it("is null for anything that is not a Vercel Blob https URL", () => {
    for (const url of [
      "https://abc.supabase.co/storage/v1/object/sign/docs/1.pdf?token=x",
      "http://abc123.public.blob.vercel-storage.com/xlegal/docs/a.pdf",
      "https://blob.vercel-storage.com.evil.example/xlegal/docs/a.pdf",
      "/api/dev/file?path=xlegal%2Fdocs%2Fa.pdf",
      "not a url",
      `${BLOB}xlegal/docs/%E0%A4%A.pdf`,
    ]) {
      assert.equal(blobUrlPathname(url), null, url);
    }
  });
});

describe("isXlegalClientFilePathname", () => {
  it("allows the client documents and the report PDF of a job", () => {
    assert.equal(isXlegalClientFilePathname("xlegal/docs/Documento-AbC.pdf"), true);
    assert.equal(isXlegalClientFilePathname("xlegal/docs/0b6f1c1e/0-Documento.pdf"), true);
    assert.equal(isXlegalClientFilePathname("xlegal/informes/informe-0b6f1c1e.pdf"), true);
  });

  it("refuses every other pathname, and any . or .. segment", () => {
    for (const pathname of [
      MARKER,
      "xlegal/results/a.json",
      "xlegal/jobs/a.json",
      "xlegal/tokens/a.json",
      "casos/a.pdf",
      "pro/results/a.json",
      "xlegal/docs/",
      "xlegal/docs/../.purge-marker.json",
      "xlegal/informes/./a.pdf",
    ]) {
      assert.equal(isXlegalClientFilePathname(pathname), false, pathname);
    }
  });
});

describe("isXlegalUploadedDocUrl", () => {
  it("accepts a document the page uploaded to xlegal/docs/", () => {
    assert.equal(isXlegalUploadedDocUrl(`${BLOB}xlegal/docs/Documento-AbC.pdf`), true);
  });

  it("refuses any other blob of the store, a traversal, or a non-Blob URL", () => {
    for (const url of [
      `${BLOB}xlegal/.purge-marker.json`,
      `${BLOB}xlegal/results/a.json`,
      `${BLOB}xlegal/informes/informe-a.pdf`,
      `${BLOB}casos/a.pdf`,
      `${BLOB}xlegal/docs/..%2F.purge-marker.json`,
      `${BLOB}xlegal/docs/%2E%2E%2Fresults%2Fa.json`,
      "https://abc.supabase.co/storage/v1/object/sign/xlegal/docs/a.pdf?token=x",
      "",
    ]) {
      assert.equal(isXlegalUploadedDocUrl(url), false, url);
    }
  });
});
