import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { localFilePath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Sirve los archivos del almacén local `.dev-store/` (solo en desarrollo).
 * Es la contraparte de las URLs locales que genera lib/storage.ts cuando no
 * hay Blob store configurado.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "No disponible." }, { status: 404 });
  }

  const pathname = new URL(request.url).searchParams.get("path") ?? "";
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(localFilePath(pathname));
  } catch {
    return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  }

  const ext = pathname.slice(pathname.lastIndexOf(".")).toLowerCase();
  const name = pathname.slice(pathname.lastIndexOf("/") + 1);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
