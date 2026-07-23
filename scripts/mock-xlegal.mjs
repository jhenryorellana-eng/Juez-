/**
 * Standalone x-legal mock for local QA of the /xlegal integration.
 * No dependencies. Run: node scripts/mock-xlegal.mjs  (port 4545)
 *
 * Env:
 *   MOCK_API_KEY        expected x-api-key (default "dev-key")
 *   MOCK_WEBHOOK_SECRET HMAC secret (default "dev-secret")
 *
 * Fail simulation: GET /control?failWebhook=N makes the next N webhook posts
 * answer 500 (to exercise Juez's retries and the /api/xlegal/status
 * reconciliation). GET /control alone reports current state.
 */
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 4545;
const API_KEY = process.env.MOCK_API_KEY ?? "dev-key";
const SECRET = process.env.MOCK_WEBHOOK_SECRET ?? "dev-secret";
const FILES_DIR = mkdtempSync(path.join(tmpdir(), "mock-xlegal-"));

/** In-memory sessions, seeded with one active client. */
const sessions = new Map([
  [
    "dev-token-maria-0001-abcdef",
    {
      cliente: { nombre: "María González", email: "maria@example.com", pais: "Venezuela" },
      attemptsAllowed: 1,
      attemptsUsed: 0,
      status: "active",
      pdf: { available: false },
      consumedJobIds: new Set(),
      pdfFile: null,
    },
  ],
]);

let failWebhooksLeft = 0;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function publicSession(token, s) {
  return {
    cliente: s.cliente,
    attemptsAllowed: s.attemptsAllowed,
    attemptsUsed: s.attemptsUsed,
    status: s.status,
    pdf: s.pdf.available
      ? { available: true, downloadUrl: `http://localhost:${PORT}/files/${token}.pdf` }
      : { available: false },
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const parts = url.pathname.split("/").filter(Boolean);

  // GET /control[?failWebhook=N] — test controls
  if (url.pathname === "/control") {
    const n = url.searchParams.get("failWebhook");
    if (n !== null) failWebhooksLeft = Number(n) || 0;
    return json(res, 200, {
      failWebhooksLeft,
      sessions: [...sessions.entries()].map(([t, s]) => ({
        token: t,
        attemptsUsed: s.attemptsUsed,
        status: s.status,
        pdfAvailable: s.pdf.available,
      })),
    });
  }

  // GET /files/:token.pdf — serve the "stored" PDF like x-legal's storage would
  if (req.method === "GET" && parts[0] === "files" && parts[1]?.endsWith(".pdf")) {
    const s = sessions.get(parts[1].slice(0, -4));
    if (!s?.pdfFile) return json(res, 404, { error: "NOT_FOUND" });
    res.writeHead(200, { "content-type": "application/pdf" });
    return res.end(readFileSync(s.pdfFile));
  }

  // GET /api/juez/sessions/:token
  if (
    req.method === "GET" &&
    parts[0] === "api" && parts[1] === "juez" && parts[2] === "sessions" && parts[3]
  ) {
    if (req.headers["x-api-key"] !== API_KEY) return json(res, 401, { error: "BAD_API_KEY" });
    const s = sessions.get(parts[3]);
    if (!s) return json(res, 404, { error: "NOT_FOUND" });
    log(`session lookup ${parts[3].slice(0, 12)}… → used ${s.attemptsUsed}/${s.attemptsAllowed}, pdf ${s.pdf.available}`);
    return json(res, 200, publicSession(parts[3], s));
  }

  // POST /api/juez/sessions/:token/consume
  if (
    req.method === "POST" &&
    parts[0] === "api" && parts[1] === "juez" && parts[2] === "sessions" && parts[4] === "consume"
  ) {
    if (req.headers["x-api-key"] !== API_KEY) return json(res, 401, { error: "BAD_API_KEY" });
    const s = sessions.get(parts[3]);
    if (!s) return json(res, 404, { error: "NOT_FOUND" });
    const { jobId } = JSON.parse((await readBody(req)).toString() || "{}");
    if (s.consumedJobIds.has(jobId)) {
      log(`consume idempotent (${jobId})`);
      return json(res, 200, { ok: true, attemptsRemaining: s.attemptsAllowed - s.attemptsUsed });
    }
    if (s.attemptsUsed >= s.attemptsAllowed) {
      log(`consume rejected: NO_ATTEMPTS_LEFT (${jobId})`);
      return json(res, 409, { error: "NO_ATTEMPTS_LEFT" });
    }
    s.attemptsUsed += 1;
    s.consumedJobIds.add(jobId);
    log(`consume OK (${jobId}) → used ${s.attemptsUsed}/${s.attemptsAllowed}`);
    return json(res, 200, { ok: true, attemptsRemaining: s.attemptsAllowed - s.attemptsUsed });
  }

  // POST /api/webhooks/juez
  if (req.method === "POST" && url.pathname === "/api/webhooks/juez") {
    const raw = await readBody(req);
    const expected = createHmac("sha256", SECRET).update(raw).digest("hex");
    const got = req.headers["x-juez-signature"];
    if (got !== expected) {
      log(`webhook REJECTED: bad signature (got ${String(got).slice(0, 12)}…)`);
      return json(res, 401, { error: "BAD_SIGNATURE" });
    }
    if (failWebhooksLeft > 0) {
      failWebhooksLeft -= 1;
      log(`webhook FORCED FAIL (remaining ${failWebhooksLeft})`);
      return json(res, 500, { error: "FORCED_FAILURE" });
    }

    const payload = JSON.parse(raw.toString());
    const s = sessions.get(payload.token);
    if (!s) return json(res, 404, { error: "NOT_FOUND" });

    if (payload.event === "evaluation.completed") {
      // x-legal downloads and stores the PDF BEFORE answering 200.
      const pdfRes = await fetch(payload.result.pdfUrl);
      if (!pdfRes.ok) {
        log(`webhook: could not download PDF (${pdfRes.status})`);
        return json(res, 502, { error: "PDF_DOWNLOAD_FAILED" });
      }
      const file = path.join(FILES_DIR, `${payload.token}.pdf`);
      writeFileSync(file, Buffer.from(await pdfRes.arrayBuffer()));
      s.pdfFile = file;
      s.pdf = { available: true };
      s.status = "delivered";
      log(`webhook evaluation.completed OK — signature VALID, PDF stored (${payload.result.score}%, ${payload.result.nivel})`);
      return json(res, 200, { ok: true });
    }

    if (payload.event === "evaluation.failed") {
      // Return the attempt to the client.
      s.attemptsUsed = Math.max(0, s.attemptsUsed - 1);
      s.consumedJobIds.delete(payload.jobId);
      log(`webhook evaluation.failed — attempt returned (used ${s.attemptsUsed}/${s.attemptsAllowed})`);
      return json(res, 200, { ok: true });
    }
    return json(res, 400, { error: "UNKNOWN_EVENT" });
  }

  json(res, 404, { error: "NOT_FOUND" });
});

server.listen(PORT, () => {
  log(`mock x-legal listening on http://localhost:${PORT}`);
  log(`seeded token: dev-token-maria-0001-abcdef (1 attempt)`);
  log(`api key: ${API_KEY} · webhook secret: ${SECRET}`);
});
