import { NextResponse } from "next/server";
import { createCheckoutSession, stripeConfigured } from "@/lib/stripe";
import { storageAvailable, storagePut } from "@/lib/storage";
import { getClientIp, rateLimit } from "@/lib/ratelimit";
import { MAX_FILES, MAX_FILE_BYTES, MAX_FILE_MB } from "@/lib/analysis";
import type { ClienteInfo, ProJob } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CheckoutFields {
  nombre: string;
  email: string;
  pais: string;
}

/**
 * Crea el trabajo premium pendiente y la sesión de pago de $50.
 * - multipart/form-data → los archivos vienen en la propia solicitud (total
 *   bajo el límite del borde de Vercel); el servidor los guarda él mismo.
 * - application/json    → refs de archivos ya subidos a Vercel Blob.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`checkout:${getClientIp(request)}`, 5);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  if (!storageAvailable()) {
    return NextResponse.json(
      { error: "El servicio premium no está habilitado (falta el Blob store de Vercel)." },
      { status: 501 },
    );
  }

  const jobId = crypto.randomUUID();
  const contentType = request.headers.get("content-type") ?? "";

  let fields: CheckoutFields;
  let files: Array<{ url: string; name: string }>;
  try {
    if (contentType.includes("application/json")) {
      const parsed = await parseJsonBody(request);
      fields = parsed.fields;
      files = parsed.files;
    } else {
      const parsed = await parseMultipartBody(request, jobId);
      fields = parsed.fields;
      files = parsed.files;
    }
  } catch (error) {
    const message = (error as Error).message ?? "";
    if (message.startsWith("VALIDATION:")) {
      return NextResponse.json({ error: message.slice(11) }, { status: 400 });
    }
    console.error("[checkout] error leyendo la solicitud:", message);
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const nombre = fields.nombre.trim().slice(0, 120);
  const email = fields.email.trim().slice(0, 200);
  const pais = fields.pais.trim().slice(0, 80);

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

  const cliente: ClienteInfo = { nombre, email, pais };
  const job: ProJob = {
    status: "pending",
    cliente,
    files,
    createdAt: new Date().toISOString(),
  };

  try {
    await storagePut(`pro/jobs/${jobId}.json`, JSON.stringify(job), "application/json");
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

/** Camino JSON: los archivos ya están en Vercel Blob; validamos las refs. */
async function parseJsonBody(request: Request): Promise<{
  fields: CheckoutFields;
  files: Array<{ url: string; name: string }>;
}> {
  const body = (await request.json()) as {
    nombre?: string;
    email?: string;
    pais?: string;
    files?: Array<{ url: string; name: string }>;
  };
  const files = (body.files ?? []).filter(
    (f) => typeof f?.url === "string" && typeof f?.name === "string",
  );
  for (const f of files) {
    let host: string;
    try {
      host = new URL(f.url).hostname;
    } catch {
      throw new Error("VALIDATION:URL de archivo inválida.");
    }
    if (!host.endsWith(".blob.vercel-storage.com")) {
      throw new Error("VALIDATION:URL de archivo no permitida.");
    }
  }
  return {
    fields: { nombre: body.nombre ?? "", email: body.email ?? "", pais: body.pais ?? "" },
    files,
  };
}

/** Camino multipart: guardamos los archivos nosotros (Blob o almacén local). */
async function parseMultipartBody(
  request: Request,
  jobId: string,
): Promise<{ fields: CheckoutFields; files: Array<{ url: string; name: string }> }> {
  const form = await request.formData();
  const entries = form
    .getAll("file")
    .filter((e): e is File => e instanceof File && e.size > 0);

  if (entries.length > MAX_FILES) {
    throw new Error(`VALIDATION:Máximo ${MAX_FILES} documentos por informe.`);
  }

  const files: Array<{ url: string; name: string }> = [];
  for (const [i, file] of entries.entries()) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`VALIDATION:"${file.name}" supera los ${MAX_FILE_MB} MB.`);
    }
    const safeName = file.name.replace(/[^\w. -]/g, "_");
    const url = await storagePut(
      `pro/docs/${jobId}/${i}-${safeName}`,
      Buffer.from(await file.arrayBuffer()),
      file.type || "application/octet-stream",
    );
    files.push({ url, name: file.name });
  }

  return {
    fields: {
      nombre: String(form.get("nombre") ?? ""),
      email: String(form.get("email") ?? ""),
      pais: String(form.get("pais") ?? ""),
    },
    files,
  };
}

/** Origen público (detrás del proxy de Vercel). */
function resolveOrigin(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}
