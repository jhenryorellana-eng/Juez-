/**
 * Text that is safe to log. Internal errors are `CODE:detail`, and the detail is
 * often a document name — which usually carries the client's name — so only the
 * code survives. Anything else is kept, truncated.
 *
 * Its own module so that lib/storage.ts and lib/gemini-uploads.ts can use it
 * without importing the x-legal close-out.
 */
export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const coded = /^([A-Z][A-Z0-9_]*):/.exec(message);
  return coded ? coded[1] : message.slice(0, 200);
}
