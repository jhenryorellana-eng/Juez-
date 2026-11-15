/**
 * Retention policy for the x-legal integration data (everything under `xlegal/`).
 *
 * Pure on purpose — no storage, no clock of its own — so the rule that decides
 * what gets deleted can be exercised with plain data. The I/O that applies it
 * lives in lib/xlegal-purge.ts.
 *
 * The rule (owner's decision, 2026-11-12):
 *  - once x-legal acknowledges the webhook it holds the report, and nothing
 *    about the client stays here: lib/xlegal-closeout.ts redacts the result and
 *    deletes the job record and the token mapping;
 *  - whatever is left under `xlegal/` — redacted results, results whose webhook
 *    never landed (they still hold the report, because /api/xlegal/status is
 *    their reconciliation path), jobs that died, documents and PDFs nobody
 *    cleaned up — is deleted once it is older than RETENTION_DAYS.
 *
 * Age is the upload time the store reports (Vercel Blob's `uploadedAt`; the
 * file's mtime in local dev). A rewrite is a new upload, so a result redacted
 * at delivery is kept 30 days from that moment, not from the job's start.
 *
 * Out of scope: the premium flow (`pro/`) keeps its own lifecycle — the client
 * paid for that report and can come back to download it.
 */

/** The only prefix the sweep ever touches. */
export const XLEGAL_PREFIX = "xlegal/";

export const RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export const RETENTION_MS = RETENTION_DAYS * DAY_MS;

/** Marker of the last sweep. It lives under the prefix, and the sweep never deletes it. */
export const PURGE_MARKER_PATH = "xlegal/.purge-marker.json";

/** The opportunistic sweep (after POST /api/xlegal/jobs) runs at most this often. */
export const PURGE_INTERVAL_MS = DAY_MS;

export interface AgedObject {
  pathname: string;
  uploadedAt: Date;
}

/** Inside `xlegal/`, and not the marker. */
export function isSweepable(pathname: string): boolean {
  return pathname.startsWith(XLEGAL_PREFIX) && pathname !== PURGE_MARKER_PATH;
}

/**
 * The objects to delete: sweepable and uploaded strictly before
 * `now - retentionMs`.
 *
 * An object whose date cannot be read is KEPT (`NaN < cutoff` is false): a
 * parsing bug must not turn into deleting a job that may still be running. The
 * same goes for an invalid `now` — the cutoff becomes NaN and nothing matches.
 */
export function selectExpired<T extends AgedObject>(
  objects: readonly T[],
  now: Date,
  retentionMs: number = RETENTION_MS,
): T[] {
  const cutoff = now.getTime() - retentionMs;
  return objects.filter(
    (o) => isSweepable(o.pathname) && o.uploadedAt.getTime() < cutoff,
  );
}

/**
 * Whether the opportunistic sweep should run, given the marker's `lastRunAt`.
 * No marker, an unreadable one, or one dated further in the future than a whole
 * interval (a broken clock, not a few seconds of skew between instances) all
 * mean "due": the failure mode to avoid is a sweep that never runs again.
 */
export function purgeIsDue(
  lastRunAt: string | null | undefined,
  now: Date,
  intervalMs: number = PURGE_INTERVAL_MS,
): boolean {
  if (!lastRunAt) return true;
  const last = Date.parse(lastRunAt);
  if (!Number.isFinite(last)) return true;
  const elapsed = now.getTime() - last;
  return elapsed >= intervalMs || elapsed < -intervalMs;
}

/** `xlegal/results/abc.json` → `results`. For the sweep's report: counts per folder, never pathnames. */
export function folderOf(pathname: string): string {
  const rest = pathname.startsWith(XLEGAL_PREFIX)
    ? pathname.slice(XLEGAL_PREFIX.length)
    : pathname;
  const slash = rest.indexOf("/");
  return slash === -1 ? "(root)" : rest.slice(0, slash);
}

/**
 * Most deletions the safety net may do in one go. It runs inside the same
 * invocation as an evaluation (after() in POST /api/xlegal/jobs), so its work
 * must stay small next to the evaluation's 300 s. 500 = five del() batches.
 * The cron has its own invocation and no cap.
 */
export const MAX_OPPORTUNISTIC_DELETES = 500;

/**
 * Oldest first, at most `max`: a capped sweep spends its budget on what is the
 * most overdue. Returns a new array.
 */
export function oldestFirst<T extends AgedObject>(
  objects: readonly T[],
  max: number = Infinity,
): T[] {
  return [...objects]
    .sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime())
    .slice(0, Math.max(0, max));
}

const RESULT_PATH_RE =
  /^xlegal\/results\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/;

/** `xlegal/results/<uuid>.json` → `<uuid>`; anything else → null. */
export function resultJobId(pathname: string): string | null {
  return RESULT_PATH_RE.exec(pathname)?.[1] ?? null;
}

/**
 * A redacted result (`{ status, completedAt, webhookDelivered }`) or an error
 * result is well under this; a result that still carries the report is several
 * KB. The cron only reads results above it, looking for delivered reports
 * written before 2026-11-12 (lib/xlegal-purge.ts).
 */
export const REDACTED_RESULT_MAX_BYTES = 512;

/**
 * Whether this deployment may run the sweep. There is ONE Blob store, and every
 * holder of BLOB_READ_WRITE_TOKEN reaches it: Vercel previews, and a local
 * `next dev` with the token in `.env.local`. A sweep from any of them — a branch
 * with a retention rule still under review, a laptop with its own clock — would
 * delete production data. So it is an allow list:
 *  - production (VERCEL_ENV=production);
 *  - a local machine WITHOUT the token, whose store is `.dev-store/`.
 * Everything else — preview, development (what `vercel env pull` writes), a
 * local machine holding the token — never sweeps.
 */
export function sweepEnabledHere(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (env.VERCEL_ENV === "production") return true;
  return !env.VERCEL_ENV && !env.BLOB_READ_WRITE_TOKEN;
}
