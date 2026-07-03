import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { createCheckoutSession, stripeConfigured } from "@/lib/stripe";
import { getClientIp, rateLimit } from "@/lib/ratelimit";
import { MAX_FILES } from "@/lib/analysis";
import type { ClienteInfo, ProJob } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CheckoutBody {
  nombre?: string;
  email?: string;
  pais?: string;
  files?: Array<{ url: string; name: string }>;
}

/** Crea el trabajo premium pendiente y la sesión de pago de $50. */
export async function POST(request: Request) {
  const limit = rateLimit(`checkout:${getClientIp(request)}`, 5);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "El servicio premium no está habilitado (falta el Blob store de Vercel)." },
      { status: 501 },
    );
  }

  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const nombre = (body.nombre ?? "").trim().slice(0, 120);
  const email = (body.email ?? "").trim().slice(0, 200);
  const pais = (body.pais ?? "").trim().slice(0, 80);
  const files = (body.files ?? []).filter(
    (f) => typeof f?.url === "string" && typeof f?.name === "string",
  );

  if (nombre.length < 3) {
    return NextResponse.json({ error: "Escribe tu nombre completo." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Escribe un correo válido." }, { status: 400 });
  }
  if (files.length === 0 || files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Envía entre 1 y ${MAX_FILES} documentos.` },
      { status: 400 },
    );
  }
  for (const f of files) {
    let host: string;
    try {
      host = new URL(f.url).hostname;
    } catch {
      return NextResponse.json({ error: "URL de archivo inválida." }, { status: 400 });
    }
    if (!host.endsWith(".blob.vercel-storage.com")) {
      return NextResponse.json({ error: "URL de archivo no permitida." }, { status: 400 });
    }
  }

  const cliente: ClienteInfo = { nombre, email, pais };
  const jobId = crypto.randomUUID();
  const job: ProJob = {
    status: "pending",
    cliente,
    files,
    createdAt: new Date().toISOString(),
  };

  try {
    await put(`pro/jobs/${jobId}.json`, JSON.stringify(job), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
    });
  } catch (error) {
    console.error("[checkout] no se pudo guardar el trabajo:", (error as Error).message);
    return NextResponse.json(
      { error: "No pudimos registrar tu solicitud. Inténtalo de nuevo." },
      { status: 500 },
    );
  }

  const origin = resolveOrigin(request);

  // Modo desarrollo sin Stripe: permite probar el flujo completo sin pagar.
  if (!stripeConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ url: `${origin}/pro/resultado?dev_job=${jobId}` });
    }
    return NextResponse.json(
      { error: "Los pagos aún no están habilitados (falta STRIPE_SECRET_KEY)." },
      { status: 501 },
    );
  }

  try {
    const session = await createCheckoutSession({ jobId, email, origin });
    if (!session.url) throw new Error("SESSION_WITHOUT_URL");
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[checkout] stripe:", (error as Error).message);
    return NextResponse.json(
      { error: "No pudimos iniciar el pago. Inténtalo de nuevo." },
      { status: 502 },
    );
  }
}

/** Origen público (detrás del proxy de Vercel). */
function resolveOrigin(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}
