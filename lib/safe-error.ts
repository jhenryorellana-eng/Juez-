import { ApiError } from "@google/genai";

/**
 * Text that is safe to log. Internal errors are `CODE` or `CODE:detail`, and the
 * detail is often a document name — which usually carries the client's name —
 * so only the code survives. A message without a code is NOT logged at all, not
 * even truncated: nothing says what it quotes (a model's answer, a URL, a file
 * name), so only the error's kind is — plus the HTTP status of a Gemini API
 * error, which is what tells a quota from a bad request.
 *
 * Its own module so that lib/storage.ts and lib/gemini-uploads.ts can use it
 * without importing the x-legal close-out.
 */
export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const coded = /^([A-Z][A-Z0-9_]*)(?::|$)/.exec(message);
  if (coded) return coded[1];
  if (error instanceof ApiError && Number.isInteger(error.status)) {
    return `${error.name} (HTTP ${error.status})`;
  }
  return error instanceof Error ? error.name : typeof error;
}
