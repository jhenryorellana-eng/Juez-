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

export function isAllowedUploadPathname(pathname: string): boolean {
  if (typeof pathname !== "string") return false;
  // A "." or ".." segment is refused outright; "Acta..final.pdf" is just a name.
  if (pathname.split("/").some((segment) => segment === "." || segment === "..")) return false;
  return UPLOAD_PREFIXES.some(
    (prefix) => pathname.startsWith(prefix) && pathname.length > prefix.length,
  );
}
