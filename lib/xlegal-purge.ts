/**
 * The retention sweep of `xlegal/` — applies the policy in lib/retention.ts.
 *
 * Two triggers, one code path:
 *  - the daily Vercel cron → GET /api/xlegal/purge (CRON_SECRET). This is the
 *    real path: no cap, and it also redacts delivered results written before
 *    2026-11-12 (they still carry the report; see `redactLegacyDeliveredResults`);
 *  - a safety net that needs no new secret: after every authenticated
 *    POST /api/xlegal/jobs, at most once every 24 h (runPurgeIfDue). It shares
 *    the invocation with an evaluation, so it deletes at most
 *    MAX_OPPORTUNISTIC_DELETES objects (oldest first) and reads no results.
 *
 * The marker (`xlegal/.purge-marker.json`) is stamped only after a sweep that
 * left nothing expired behind: a sweep that died halfway, hit its cap or failed
 * a delete is retried by the next request instead of waiting 24 h. Two sweeps
 * racing are harmless — deleting is idempotent.
 *
 * Runs only in production, or locally without the Blob token
 * (sweepEnabledHere): every holder of the token reaches production's store.
 */
import { storageList, type StoredObject } from "./storage";
import {
  MAX_OPPORTUNISTIC_DELETES,
  PURGE_MARKER_PATH,
  REDACTED_RESULT_MAX_BYTES,
  RETENTION_DAYS,
  RETENTION_MS,
  XLEGAL_PREFIX,
  folderOf,
  oldestFirst,
  purgeIsDue,
  resultJobId,
  selectExpired,
  sweepEnabledHere,
} from "./retention";
import {
  defaultCloseoutDeps,
  forgetDeliveredJob,
  isDeliveredFullResult,
  safeErrorMessage,
  type CloseoutDeps,
} from "./xlegal-closeout";
import { jobPath } from "./xlegal";
import type { XlegalJob, XlegalResult } from "./types";

export type PurgeTrigger = "cron" | "jobs";

interface PurgeMarker {
  lastRunAt: string;
  trigger: PurgeTrigger;
}

export interface PurgeDeps
  extends Pick<CloseoutDeps, "put" | "readJson" | "deleteAt" | "deleteMany"> {
  list(prefix: string): Promise<StoredObject[]>;
}

export const defaultPurgeDeps: PurgeDeps = {
  ...defaultCloseoutDeps,
  list: storageList,
};

export interface PurgeOptions {
  now?: Date;
  /** Most objects to delete in this run (oldest first). Omitted = no cap. */
  maxDeletes?: number;
}

export interface PurgeReport {
  trigger: PurgeTrigger;
  retentionDays: number;
  /** Objects uploaded before this instant are expired. */
  cutoff: string;
  scanned: number;
  expired: number;
  deleted: number;
  failed: number;
  /** Expired objects left for the next run because of `maxDeletes`. */
  remaining: number;
  maxDeletes: number | null;
  /** Delivered results written before 2026-11-12, reduced to their outcome (cron only). */
  redacted: number;
  /** Of those, the ones whose report could be neither redacted nor deleted (in the log). */
  redactionFailed: number;
  /**
   * Expired objects per folder (jobs, results, tokens, docs, informes…).
   * Counts only: a pathname under docs/ carries the client's file name.
   */
  byFolder: Record<string, number>;
}

/** Sweeps `xlegal/` now, whatever the marker says. */
export async function purgeExpiredXlegalData(
  trigger: PurgeTrigger,
  { now = new Date(), maxDeletes }: PurgeOptions = {},
  deps: PurgeDeps = defaultPurgeDeps,
): Promise<PurgeReport> {
  const objects = await deps.list(XLEGAL_PREFIX);
  const expired = selectExpired(objects, now);
  const batch = oldestFirst(expired, maxDeletes ?? Infinity);

  const byFolder: Record<string, number> = {};
  for (const o of batch) {
    const folder = folderOf(o.pathname);
    byFolder[folder] = (byFolder[folder] ?? 0) + 1;
  }

  const { deleted, failed } =
    batch.length > 0 ? await deps.deleteMany(batch.map((o) => o.ref)) : { deleted: 0, failed: 0 };
  const remaining = expired.length - batch.length;

  // Reading results is a fetch per candidate: the cron's job, not the net's.
  const expiredSet = new Set(expired);
  const { redacted, redactionFailed } =
    trigger === "cron"
      ? await redactLegacyDeliveredResults(
          objects.filter((o) => !expiredSet.has(o)),
          deps,
        )
      : { redacted: 0, redactionFailed: 0 };

  if (remaining === 0 && failed === 0) {
    const marker: PurgeMarker = { lastRunAt: now.toISOString(), trigger };
    // The sweep itself is done: a marker that cannot be written only means the
    // next POST /api/xlegal/jobs sweeps again (idempotent). It must not turn a
    // complete sweep into "sweep failed" — the cron would answer 500 without its
    // report, and the net would log it as if nothing had been deleted.
    try {
      await deps.put(PURGE_MARKER_PATH, JSON.stringify(marker), "application/json");
    } catch (error) {
      console.error(
        `[xlegal:purge] ${trigger}: sweep done, but the marker could not be written (the next request sweeps again):`,
        safeErrorMessage(error),
      );
    }
  }

  const report: PurgeReport = {
    trigger,
    retentionDays: RETENTION_DAYS,
    cutoff: new Date(now.getTime() - RETENTION_MS).toISOString(),
    scanned: objects.length,
    expired: expired.length,
    deleted,
    failed,
    remaining,
    maxDeletes: maxDeletes ?? null,
    redacted,
    redactionFailed,
    byFolder,
  };
  const log = failed > 0 || redactionFailed > 0 ? console.error : console.log;
  log(
    `[xlegal:purge] ${trigger}: scanned ${report.scanned}, expired ${report.expired} ` +
      `${JSON.stringify(byFolder)}, deleted ${deleted}, failed ${failed}, ` +
      `remaining ${remaining}, redacted ${redacted}, redaction failed ${redactionFailed}`,
  );
  return report;
}

/**
 * Results delivered before 2026-11-12 still carry the report, name, email and
 * country: back then delivery only flipped `webhookDelivered`. They get what a
 * delivery gets today (forgetDeliveredJob) instead of waiting out their 30 days.
 *
 * Only results larger than a redacted one are read — after the first run that
 * leaves just the reports whose webhook never landed, which stay as they are:
 * /api/xlegal/status still needs them. Never throws: one bad result must not
 * stop the sweep.
 *
 * A null read counts as a failure, not as "not a legacy result": list() just
 * returned this object with more than REDACTED_RESULT_MAX_BYTES, and
 * storageReadJson answers null on ANY error (list, fetch or JSON). Skipping it
 * would answer 200 while a delivered report may still be stored. (A result
 * deleted in between — the redaction fallback — is a rare false alarm, and the
 * next run clears it.)
 */
async function redactLegacyDeliveredResults(
  objects: readonly StoredObject[],
  deps: PurgeDeps,
): Promise<{ redacted: number; redactionFailed: number }> {
  let redacted = 0;
  let redactionFailed = 0;
  for (const o of objects) {
    const jobId = resultJobId(o.pathname);
    if (!jobId || o.size <= REDACTED_RESULT_MAX_BYTES) continue;
    try {
      const result = await deps.readJson<XlegalResult>(o.pathname);
      if (result === null) {
        redactionFailed += 1;
        console.error(`[xlegal:purge] could not read the result ${jobId}`);
        continue;
      }
      if (!isDeliveredFullResult(result)) continue;
      const job = await deps.readJson<Pick<XlegalJob, "tokenHash">>(jobPath(jobId));
      if (await forgetDeliveredJob(jobId, job?.tokenHash, result.completedAt, deps)) redacted += 1;
      else redactionFailed += 1;
    } catch (error) {
      redactionFailed += 1;
      console.error(`[xlegal:purge] could not redact ${jobId}:`, safeErrorMessage(error));
    }
  }
  return { redacted, redactionFailed };
}

/**
 * The safety net: sweeps only if the last complete sweep is at least 24 h old,
 * capped at MAX_OPPORTUNISTIC_DELETES. Never throws — it runs inside after(),
 * where an exception would only be noise next to the evaluation job sharing the
 * same invocation.
 */
export async function runPurgeIfDue(
  trigger: PurgeTrigger,
  {
    now = new Date(),
    env = process.env,
  }: { now?: Date; env?: Readonly<Record<string, string | undefined>> } = {},
  deps: PurgeDeps = defaultPurgeDeps,
): Promise<PurgeReport | null> {
  if (!sweepEnabledHere(env)) return null;
  try {
    const marker = await deps.readJson<Partial<PurgeMarker>>(PURGE_MARKER_PATH);
    if (!purgeIsDue(marker?.lastRunAt, now)) return null;
    return await purgeExpiredXlegalData(
      trigger,
      { now, maxDeletes: MAX_OPPORTUNISTIC_DELETES },
      deps,
    );
  } catch (error) {
    console.error(`[xlegal:purge] ${trigger}: sweep failed:`, safeErrorMessage(error));
    return null;
  }
}
