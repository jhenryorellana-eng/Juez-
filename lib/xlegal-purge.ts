/**
 * The retention sweep of `xlegal/` — applies the policy in lib/retention.ts.
 *
 * Two triggers, one code path:
 *  - the daily Vercel cron → GET /api/xlegal/purge (CRON_SECRET);
 *  - a safety net that needs no new secret: after every authenticated
 *    POST /api/xlegal/jobs, at most once every 24 h (runPurgeIfDue), so the
 *    data still ages out if the cron is ever missing or misconfigured.
 *
 * The first run after this shipped also clears everything accumulated since the
 * integration went live: there is no "since" — anything older than 30 days goes.
 */
import { storageDeleteMany, storageList, storagePut, storageReadJson } from "./storage";
import {
  PURGE_MARKER_PATH,
  RETENTION_DAYS,
  RETENTION_MS,
  XLEGAL_PREFIX,
  folderOf,
  purgeIsDue,
  selectExpired,
} from "./retention";

export type PurgeTrigger = "cron" | "jobs";

interface PurgeMarker {
  lastRunAt: string;
  trigger: PurgeTrigger;
}

export interface PurgeReport {
  trigger: PurgeTrigger;
  retentionDays: number;
  /** Objects uploaded before this instant were deleted. */
  cutoff: string;
  scanned: number;
  expired: number;
  deleted: number;
  failed: number;
  /**
   * Expired objects per folder (jobs, results, tokens, docs, informes…).
   * Counts only: a pathname under docs/ carries the client's file name.
   */
  byFolder: Record<string, number>;
}

/** Sweeps `xlegal/` now, whatever the marker says (the cron path). */
export async function purgeExpiredXlegalData(
  trigger: PurgeTrigger,
  now: Date = new Date(),
): Promise<PurgeReport> {
  // Stamp first: a sweep that dies halfway still counts as today's attempt for
  // the opportunistic path, and the cron — which ignores the marker — finishes
  // the job the next day. Two sweeps racing are harmless: deleting is idempotent.
  const marker: PurgeMarker = { lastRunAt: now.toISOString(), trigger };
  await storagePut(PURGE_MARKER_PATH, JSON.stringify(marker), "application/json");

  const objects = await storageList(XLEGAL_PREFIX);
  const expired = selectExpired(objects, now);

  const byFolder: Record<string, number> = {};
  for (const o of expired) {
    const folder = folderOf(o.pathname);
    byFolder[folder] = (byFolder[folder] ?? 0) + 1;
  }

  const { deleted, failed } = await storageDeleteMany(expired.map((o) => o.ref));

  const report: PurgeReport = {
    trigger,
    retentionDays: RETENTION_DAYS,
    cutoff: new Date(now.getTime() - RETENTION_MS).toISOString(),
    scanned: objects.length,
    expired: expired.length,
    deleted,
    failed,
    byFolder,
  };
  const log = failed > 0 ? console.error : console.log;
  log(
    `[xlegal:purge] ${trigger}: scanned ${report.scanned}, expired ${report.expired} ` +
      `${JSON.stringify(byFolder)}, deleted ${deleted}, failed ${failed}`,
  );
  return report;
}

/**
 * The safety net: sweeps only if the last sweep is at least 24 h old. Never
 * throws — it runs inside after(), where an exception would only be noise next
 * to the evaluation job sharing the same invocation.
 */
export async function runPurgeIfDue(
  trigger: PurgeTrigger,
  now: Date = new Date(),
): Promise<PurgeReport | null> {
  try {
    const marker = await storageReadJson<Partial<PurgeMarker>>(PURGE_MARKER_PATH);
    if (!purgeIsDue(marker?.lastRunAt, now)) return null;
    return await purgeExpiredXlegalData(trigger, now);
  } catch (error) {
    console.error(`[xlegal:purge] ${trigger}: sweep failed:`, (error as Error).message);
    return null;
  }
}
