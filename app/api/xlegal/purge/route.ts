import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { storageAvailable } from "@/lib/storage";
import { purgeExpiredXlegalData } from "@/lib/xlegal-purge";
import { sweepEnabledHere } from "@/lib/retention";
import { getClientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/xlegal/purge — the daily retention sweep of `xlegal/`
 * (policy: lib/retention.ts · sweep: lib/xlegal-purge.ts).
 *
 * Called by the Vercel cron declared in vercel.json. When the project has a
 * CRON_SECRET variable, Vercel sends it as `Authorization: Bearer <CRON_SECRET>`.
 * Without that variable this route refuses to run (503): an unauthenticated
 * "delete things" endpoint is worse than a sweep that waits for its secret.
 * CRON_SECRET is REQUIRED in production: this is the real sweep (no cap, plus
 * the redaction of delivered results written before 2026-11-12). The after()
 * net in POST /api/xlegal/jobs only runs when x-legal asks for an evaluation,
 * and it is capped.
 *
 * Never from a Vercel preview: previews share production's Blob store.
 */
export async function GET(request: Request) {
  const limit = rateLimit(`xlegal-purge:${getClientIp(request)}`, 10);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) {
    console.error(
      "[xlegal:purge] CRON_SECRET is not set: refusing to run. Set it in Vercel → Settings → Environment Variables.",
    );
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  if (!bearerMatches(request.headers.get("authorization") ?? "", secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!storageAvailable()) {
    return NextResponse.json({ error: "Not configured." }, { status: 501 });
  }
  if (!sweepEnabledHere()) {
    return NextResponse.json({ error: "Sweeps only run in production." }, { status: 403 });
  }

  try {
    const report = await purgeExpiredXlegalData("cron");
    // 500 when something that should be gone is still there: the cron's
    // failures then show up in Vercel instead of only in a log line.
    const incomplete = report.failed > 0 || report.redactionFailed > 0;
    return NextResponse.json(report, { status: incomplete ? 500 : 200 });
  } catch (error) {
    console.error("[xlegal:purge] cron: sweep failed:", (error as Error).message);
    return NextResponse.json({ error: "Purge failed." }, { status: 500 });
  }
}

/** Constant-time check of `Authorization: Bearer <secret>`. */
function bearerMatches(header: string, secret: string): boolean {
  const got = Buffer.from(header, "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  return got.length === expected.length && timingSafeEqual(got, expected);
}
