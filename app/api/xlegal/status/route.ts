import { NextResponse } from "next/server";
import { storageReadJson } from "@/lib/storage";
import { apiKeyMatches, xlegalConfigured } from "@/lib/xlegal";
import { getClientIp, rateLimit } from "@/lib/ratelimit";
import type { XlegalResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * GET /api/xlegal/status?jobId=<uuid> — reconciliation endpoint for x-legal.
 * Protected with the shared XLEGAL_API_KEY (v1 decision: one secret in both
 * directions), compared in constant time. If the webhook never landed, x-legal
 * polls here and pulls the result (including the still-undeleted pdfUrl).
 */
export async function GET(request: Request) {
  const limit = rateLimit(`xlegal-status:${getClientIp(request)}`, 30);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  if (!xlegalConfigured()) {
    return NextResponse.json({ error: "Not configured." }, { status: 501 });
  }
  if (!apiKeyMatches(request.headers.get("x-api-key") ?? "")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const jobId = new URL(request.url).searchParams.get("jobId") ?? "";
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "Invalid jobId." }, { status: 400 });
  }

  const result = await storageReadJson<XlegalResult>(`xlegal/results/${jobId}.json`);
  if (!result) return NextResponse.json({ status: "pending" }, { status: 202 });

  if (result.status === "error") {
    return NextResponse.json({ status: "error", error: result.error });
  }
  return NextResponse.json({
    status: "done",
    completedAt: result.completedAt,
    webhookDelivered: result.webhookDelivered,
    result: {
      pdfUrl: result.pdfUrl,
      score: result.informe.score,
      nivel: result.informe.level,
      headline: result.informe.headline,
    },
  });
}
