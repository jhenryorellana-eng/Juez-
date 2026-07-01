import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { MAX_FILE_BYTES } from "@/lib/analysis";
import { getClientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Emite tokens para que el navegador suba los documentos DIRECTO a Vercel Blob
 * (el borde de Vercel rechaza cuerpos > 4.5 MB, así que los archivos grandes
 * no pueden pasar por la función). Requiere BLOB_READ_WRITE_TOKEN.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`upload:${getClientIp(request)}`, 40);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        error:
          "El almacenamiento para archivos grandes no está habilitado en el servidor (falta el Blob store de Vercel).",
      },
      { status: 501 },
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
        ],
        maximumSizeInBytes: MAX_FILE_BYTES,
        addRandomSuffix: true,
      }),
      // El procesamiento ocurre en /api/evaluate; aquí no hay nada que hacer.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[upload] error:", (error as Error).message);
    return NextResponse.json(
      { error: "No se pudo autorizar la subida del archivo." },
      { status: 400 },
    );
  }
}
