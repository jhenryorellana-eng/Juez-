/**
 * Pathname rules of the store, kept pure so they can be tested without Blob.
 */

/**
 * The blob whose pathname is EXACTLY `pathname`. Vercel Blob's list() matches
 * by prefix, so `xlegal/.purge-marker.json/x.txt` also answers a list for
 * `xlegal/.purge-marker.json`: taking the first hit would read (or delete) an
 * object somebody else planted under our name.
 */
export function exactBlob<B extends { pathname: string }>(
  blobs: readonly B[],
  pathname: string,
): B | undefined {
  return blobs.find((b) => b.pathname === pathname);
}

/**
 * Folders the browser may upload to through /api/upload: the demo and premium
 * flows (`casos/`) and the embedded x-legal page (`xlegal/docs/`). Everything
 * else in the store — jobs, results, token mappings, the purge marker, `pro/` —
 * is written only by the server.
 */
const UPLOAD_PREFIXES = ["casos/", "xlegal/docs/"] as const;

/** A file (not the folder itself) under one of `prefixes`, with no "." or ".." segment. */
function isFileUnder(pathname: string, prefixes: readonly string[]): boolean {
  if (typeof pathname !== "string") return false;
  // A "." or ".." segment is refused outright; "Acta..final.pdf" is just a name.
  if (pathname.split("/").some((segment) => segment === "." || segment === "..")) return false;
  return prefixes.some((prefix) => pathname.startsWith(prefix) && pathname.length > prefix.length);
}

export function isAllowedUploadPathname(pathname: string): boolean {
  return isFileUnder(pathname, UPLOAD_PREFIXES);
}

/**
 * Where an x-legal job keeps the client's files: the documents the page uploaded
 * (or the server stored for it) and the report PDF. The ONLY folders the job
 * close-out deletes from (lib/xlegal-closeout.ts → ownedUrls).
 */
const XLEGAL_CLIENT_FILE_PREFIXES = ["xlegal/docs/", "xlegal/informes/"] as const;

export function isXlegalClientFilePathname(pathname: string): boolean {
  return isFileUnder(pathname, XLEGAL_CLIENT_FILE_PREFIXES);
}

const BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

/**
 * The store pathname of a Vercel Blob URL
 * (`https://<store>.public.blob.vercel-storage.com/<pathname>`), percent-decoded
 * — so an encoded "%2F.." shows up as the ".." segment it would become. null for
 * anything else, or an undecodable URL.
 */
export function blobUrlPathname(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(BLOB_HOST_SUFFIX)) return null;
  try {
    return decodeURIComponent(url.pathname.slice(1));
  } catch {
    return null;
  }
}

/**
 * What POST /api/xlegal/run accepts as a document in a JSON body: a file the
 * page uploaded to `xlegal/docs/` (XlegalFlow, through /api/upload). Any other
 * blob — a result, the purge marker, `casos/` — would be read, sent to Gemini
 * and, at the end of the job, deleted on the caller's say-so.
 */
export function isXlegalUploadedDocUrl(raw: string): boolean {
  const pathname = blobUrlPathname(raw);
  return pathname !== null && isFileUnder(pathname, ["xlegal/docs/"]);
}

/**
 * What POST /api/evaluate (demo) and POST /api/checkout (premium) accept as a
 * document in a JSON body: a file the browser uploaded to `casos/`
 * (AnalyzingCard and app/pro/page.tsx, through /api/upload). Both flows delete
 * the files they were handed once they are done — /api/evaluate's del() and
 * /api/pro/run's storageDelete() — so any other blob of the store (`xlegal/`,
 * a result, `pro/`) would be deleted on the caller's say-so.
 */
export function isDemoUploadedDocUrl(raw: string): boolean {
  const pathname = blobUrlPathname(raw);
  return pathname !== null && isFileUnder(pathname, ["casos/"]);
}
