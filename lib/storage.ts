/**
 * Almacenamiento de los trabajos y archivos del flujo premium.
 * - Con BLOB_READ_WRITE_TOKEN → Vercel Blob (producción y preview).
 * - Sin token y fuera de producción → carpeta local `.dev-store/` (gitignored),
 *   para probar el flujo completo sin servicios externos. Las URLs locales se
 *   sirven mediante GET /api/dev/file?path=… (solo en desarrollo).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { put, del, list } from "@vercel/blob";

const DEV_ROUTE = "/api/dev/file?path=";
const BASE_DIR = path.join(process.cwd(), ".dev-store");

/** Rutas internas simples: letras/números y `/ . _ - espacio`, sin "..". */
const SAFE_PATH = /^[a-z0-9][a-z0-9 ._/-]*$/i;

export function blobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Modo de pruebas local: sin Blob y fuera de producción. */
export function localMode(): boolean {
  return !blobEnabled() && process.env.NODE_ENV !== "production";
}

export function storageAvailable(): boolean {
  return blobEnabled() || localMode();
}

function assertSafe(pathname: string): string {
  if (!SAFE_PATH.test(pathname) || pathname.includes("..")) {
    throw new Error(`UNSAFE_PATH:${pathname}`);
  }
  return pathname;
}

/** Ruta absoluta de un archivo del almacén local. */
export function localFilePath(pathname: string): string {
  return path.join(BASE_DIR, assertSafe(pathname));
}

export function isLocalUrl(url: string): boolean {
  return url.startsWith(DEV_ROUTE);
}

function localUrl(pathname: string): string {
  return DEV_ROUTE + encodeURIComponent(pathname);
}

function pathFromLocalUrl(url: string): string {
  return assertSafe(decodeURIComponent(url.slice(DEV_ROUTE.length)));
}

/** Guarda datos y devuelve la URL con la que luego se leen (Blob o local). */
export async function storagePut(
  pathname: string,
  data: Buffer | string,
  contentType: string,
): Promise<string> {
  if (blobEnabled()) {
    // allowOverwrite es imprescindible: los jobs y resultados se reescriben en
    // el mismo pathname (pending→processing, done→webhookDelivered) y sin él
    // Vercel Blob lanza excepción en el segundo put.
    const blob = await put(pathname, data, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return blob.url;
  }
  const file = localFilePath(pathname);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof data === "string" ? data : new Uint8Array(data));
  return localUrl(pathname);
}

/** Lee el contenido apuntado por una URL de storagePut (o de Vercel Blob). */
export async function storageRead(url: string): Promise<Buffer | null> {
  if (isLocalUrl(url)) {
    try {
      return await fs.readFile(localFilePath(pathFromLocalUrl(url)));
    } catch {
      return null;
    }
  }
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/** Lee y parsea un JSON guardado bajo un pathname interno. */
export async function storageReadJson<T>(pathname: string): Promise<T | null> {
  try {
    if (blobEnabled()) {
      const { blobs } = await list({ prefix: assertSafe(pathname), limit: 1 });
      if (blobs.length === 0) return null;
      const res = await fetch(blobs[0].url, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as T;
    }
    const raw = await fs.readFile(localFilePath(pathname), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Borra archivos por URL (mezcla libre de URLs de Blob y locales). */
export async function storageDelete(urls: string[]): Promise<void> {
  const locals = urls.filter(isLocalUrl);
  const remotes = urls.filter((u) => !isLocalUrl(u));
  for (const url of locals) {
    await fs.unlink(localFilePath(pathFromLocalUrl(url))).catch(() => {});
  }
  if (remotes.length > 0) {
    await del(remotes).catch(() => {});
  }
}

/** Borra un archivo por su pathname interno. */
export async function storageDeleteAt(pathname: string): Promise<void> {
  if (blobEnabled()) {
    const { blobs } = await list({ prefix: assertSafe(pathname), limit: 1 });
    if (blobs.length > 0) await del(blobs[0].url).catch(() => {});
    return;
  }
  await fs.unlink(localFilePath(pathname)).catch(() => {});
}
