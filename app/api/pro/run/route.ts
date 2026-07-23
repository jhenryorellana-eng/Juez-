import { NextResponse, after } from "next/server";
import {
  storagePut,
  storageReadJson,
  storageDelete,
  storageDeleteAt,
} from "@/lib/storage";
import { buildInformeFromFiles } from "@/lib/informe-pipeline";
import { getCheckoutSession, stripeConfigured } from "@/lib/stripe";
import { getClientIp, rateLimit } from "@/lib/ratelimit";
import type { ProJob, ProResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/* -------------------------------------------------------------------------- */
/*  GET /api/pro/run?id=<jobId> — estado del informe premium                   */
/* -------------------------------------------------------------------------- */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
  }
  const result = await storageReadJson<ProResult>(`pro/results/${id}.json`);
  if (!result) return NextResponse.json({ status: "pending" }, { status: 202 });
  // A diferencia del demo, el resultado premium NO se borra: el cliente pagó
  // y debe poder recargar la página y volver a descargar su informe.
  return NextResponse.json(result);
}

/* -------------------------------------------------------------------------- */
/*  POST /api/pro/run — verifica el pago y arranca (o reanuda) el análisis     */
/* -------------------------------------------------------------------------- */
export async function POST(request: Request) {
  const limit = rateLimit(`pro-run:${getClientIp(request)}`, 10);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: { sessionId?: string; devJobId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  let jobId: string;

  if (body.devJobId && !stripeConfigured() && process.env.NODE_ENV !== "production") {
    // Modo desarrollo sin Stripe.
    jobId = body.devJobId;
  } else {
    if (!body.sessionId) {
      return NextResponse.json({ error: "Falta la sesión de pago." }, { status: 400 });
    }
    try {
      const session = await getCheckoutSession(body.sessionId);
      if (session.payment_status !== "paid") {
        return NextResponse.json(
          { error: "El pago no se ha completado." },
          { status: 402 },
        );
      }
      jobId = session.metadata?.jobId ?? "";
    } catch (error) {
      console.error("[pro:run] stripe:", (error as Error).message);
      return NextResponse.json(
        { error: "No pudimos verificar el pago." },
        { status: 502 },
      );
    }
  }

  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: "Trabajo no encontrado." }, { status: 404 });
  }

  // ¿Ya hay resultado? (recarga de página, reintento tras error…)
  const existing = await storageReadJson<ProResult>(`pro/results/${jobId}.json`);
  if (existing?.status === "done") {
    return NextResponse.json({ jobId });
  }

  const job = await storageReadJson<ProJob>(`pro/jobs/${jobId}.json`);
  if (!job) {
    return NextResponse.json({ error: "Trabajo no encontrado." }, { status: 404 });
  }

  // Evita doble arranque salvo que el intento anterior terminara en error.
  if (job.status === "pending" || existing?.status === "error") {
    if (existing?.status === "error") {
      await storageDeleteAt(`pro/results/${jobId}.json`).catch(() => {});
    }
    await storagePut(
      `pro/jobs/${jobId}.json`,
      JSON.stringify({ ...job, status: "processing" satisfies ProJob["status"] }),
      "application/json",
    );
    after(() => processProJob(jobId, job));
  }

  return NextResponse.json({ jobId }, { status: 202 });
}

/** Descarga los documentos, genera el informe + PDF y guarda el resultado. */
async function processProJob(jobId: string, job: ProJob): Promise<void> {
  let result: ProResult;
  try {
    const { informe, pdf } = await buildInformeFromFiles(job.files, job.cliente);
    const pdfUrl = await storagePut(
      `pro/informes/informe-${jobId}.pdf`,
      pdf,
      "application/pdf",
    );

    result = { status: "done", informe, pdfUrl, cliente: job.cliente };
  } catch (error) {
    console.error("[pro:job] error:", (error as Error).message);
    result = {
      status: "error",
      error:
        "No pudimos completar tu informe. Tu pago está registrado: vuelve a intentarlo desde esta misma página o contáctanos.",
    };
  }

  try {
    await storagePut(`pro/results/${jobId}.json`, JSON.stringify(result), "application/json");
  } catch (error) {
    console.error("[pro:job] no se pudo guardar el resultado:", (error as Error).message);
  }

  // Privacidad: los documentos del cliente se eliminan al terminar.
  if (result.status === "done") {
    await storageDelete(job.files.map((f) => f.url)).catch(() => {});
  }
}
