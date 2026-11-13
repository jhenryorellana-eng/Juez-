/**
 * Almacenamiento de los trabajos y archivos del flujo premium.
 * - Con BLOB_READ_WRITE_TOKEN → Vercel Blob (producción y preview).
 * - Sin token y fuera de producción → carpeta local `.dev-store/` (gitignored),
 *   para probar el flujo completo sin servicios externos. Las URLs locales se
 *   sirven mediante GET /api/dev/file?path=… (solo en desarrollo).
 */
import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import { put, del, list } from "@vercel/blob";
import { exactBlob } from "./storage-paths";

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

/**
 * list() matches by prefix, so the exact pathname is looked for among the first
 * page of matches (lib/storage-paths.ts → exactBlob). Since /api/upload only
 * hands out tokens for `casos/` and `xlegal/docs/`, nobody but this server can
 * write under the prefixes read this way; the page size is the margin left for
 * whatever got there before that rule existed.
 */
const EXACT_LOOKUP_PAGE = 100;

/** The blob stored under exactly `pathname`, or undefined. */
async function findExactBlob(pathname: string) {
  const { blobs } = await list({ prefix: assertSafe(pathname), limit: EXACT_LOOKUP_PAGE });
  return exactBlob(blobs, pathname);
}

/** Lee y parsea un JSON guardado bajo un pathname interno. */
export async function storageReadJson<T>(pathname: string): Promise<T | null> {
  try {
    if (blobEnabled()) {
      const blob = await findExactBlob(pathname);
      if (!blob) return null;
      const res = await fetch(blob.url, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as T;
    }
    const raw = await fs.readFile(localFilePath(pathname), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * ¿Es una URL de NUESTRO almacenamiento (Vercel Blob o el disco local de dev)?
 * Un job servidor-a-servidor lee los documentos de x-legal con URLs firmadas de
 * Supabase: esos archivos no son nuestros y no se borran desde aquí.
 */
export function isOwnedStorageUrl(url: string): boolean {
  if (isLocalUrl(url)) return true;
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
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

/**
 * Borra un archivo por su pathname interno. Que ya no exista cuenta como
 * borrado; cualquier otro fallo se LANZA, para que quien llama no dé por
 * borrado algo que sigue ahí (los que no lo necesitan ya hacen `.catch`).
 */
export async function storageDeleteAt(pathname: string): Promise<void> {
  if (blobEnabled()) {
    const blob = await findExactBlob(pathname);
    if (blob) await del(blob.url);
    return;
  }
  await fs.unlink(localFilePath(pathname)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

/** An object in the store, as Vercel Blob's list() or the local disk describe it. */
export interface StoredObject {
  pathname: string;
  /** Last write: Blob's `uploadedAt`, or the file's mtime in local mode. */
  uploadedAt: Date;
  /** What storageDeleteMany takes: the blob URL, or the local URL in dev. */
  ref: string;
  /** Bytes. */
  size: number;
}

/** Blob's list() returns at most 1000 per page. */
const LIST_PAGE = 1000;

/**
 * Every object whose pathname starts with `prefix`, following list()'s cursor
 * to the last page. Locally it walks `.dev-store/` from the prefix's folder.
 */
export async function storageList(prefix: string): Promise<StoredObject[]> {
  assertSafe(prefix);
  if (blobEnabled()) {
    const objects: StoredObject[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: LIST_PAGE });
      for (const blob of page.blobs) {
        objects.push({
          pathname: blob.pathname,
          uploadedAt: new Date(blob.uploadedAt),
          ref: blob.url,
          size: blob.size,
        });
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return objects;
  }
  return listLocal(prefix);
}

async function listLocal(prefix: string): Promise<StoredObject[]> {
  const folder = prefix.slice(0, prefix.lastIndexOf("/") + 1);
  const objects: StoredObject[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // a folder that does not exist simply holds nothing
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const pathname = path.relative(BASE_DIR, full).split(path.sep).join("/");
      if (!pathname.startsWith(prefix)) continue;
      const { mtime, size } = await fs.stat(full);
      objects.push({ pathname, uploadedAt: mtime, ref: localUrl(pathname), size });
    }
  }

  await walk(path.join(BASE_DIR, folder));
  return objects;
}

/** URLs per del() request, so one huge sweep is not one huge request. */
const DELETE_BATCH = 100;

/**
 * Deletes objects by `ref` (as storageList returns them). Unlike storageDelete,
 * it reports what it could NOT delete instead of swallowing it: a retention
 * sweep that fails in silence is exactly the failure it exists to prevent.
 */
export async function storageDeleteMany(
  refs: string[],
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;

  for (const url of refs.filter(isLocalUrl)) {
    try {
      await fs.unlink(localFilePath(pathFromLocalUrl(url)));
      deleted += 1;
    } catch (error) {
      // Already gone is as good as deleted.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") deleted += 1;
      else failed += 1;
    }
  }

  const remotes = refs.filter((u) => !isLocalUrl(u));
  for (let i = 0; i < remotes.length; i += DELETE_BATCH) {
    const batch = remotes.slice(i, i + DELETE_BATCH);
    try {
      await del(batch);
      deleted += batch.length;
    } catch (error) {
      failed += batch.length;
      console.error(
        `[storage] could not delete a batch of ${batch.length}:`,
        (error as Error).message,
      );
    }
  }
  return { deleted, failed };
}
