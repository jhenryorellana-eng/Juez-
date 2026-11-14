/**
 * In-memory stand-in for lib/storage.ts + the x-legal webhook, for the tests of
 * the job close-out and the retention sweep. URLs look like Vercel Blob's so
 * that storagePathname() treats them as ours.
 */
import type { CloseoutDeps } from "../xlegal-closeout";
import type { PurgeDeps } from "../xlegal-purge";
import type { StoredObject } from "../storage";
import type { XlegalWebhookPayload } from "../xlegal";

const HOST = "https://store.public.blob.vercel-storage.com/";

interface Entry {
  data: string;
  uploadedAt: Date;
}

export class FakeStore implements CloseoutDeps, PurgeDeps {
  readonly objects = new Map<string, Entry>();
  readonly webhooks: XlegalWebhookPayload[] = [];
  readonly putCalls: string[] = [];
  readonly listCalls: string[] = [];
  /** Return true to make that put throw. `attempt` counts puts to the same pathname, from 1. */
  failPut: (pathname: string, attempt: number) => boolean = () => false;
  /** Runs inside put, before it resolves: lets a test change state mid-write. */
  onPut: (pathname: string) => void = () => {};
  /** Return false to make the webhook "fail". */
  webhookOk: (payload: XlegalWebhookPayload) => boolean = () => true;
  /** Refs (URLs) that deleteMany must refuse. */
  failDelete = new Set<string>();
  /** Pathnames that deleteAt must refuse (like storageDeleteAt when del() fails). */
  failDeleteAt = new Set<string>();
  /** The clock put() stamps uploads with. */
  now = () => new Date("2026-11-12T08:00:00.000Z");

  url(pathname: string): string {
    return HOST + pathname;
  }

  seed(pathname: string, value: unknown, uploadedAt: Date = this.now()): string {
    const data = typeof value === "string" ? value : JSON.stringify(value);
    this.objects.set(pathname, { data, uploadedAt });
    return this.url(pathname);
  }

  json<T>(pathname: string): T | undefined {
    const entry = this.objects.get(pathname);
    return entry ? (JSON.parse(entry.data) as T) : undefined;
  }

  has(pathname: string): boolean {
    return this.objects.has(pathname);
  }

  private pathnameOf(url: string): string {
    return url.startsWith(HOST) ? url.slice(HOST.length) : url;
  }

  // CloseoutDeps -------------------------------------------------------------

  put = async (pathname: string, data: Buffer | string): Promise<string> => {
    this.putCalls.push(pathname);
    const attempt = this.putCalls.filter((p) => p === pathname).length;
    this.onPut(pathname);
    if (this.failPut(pathname, attempt)) throw new Error("BLOB_UNAVAILABLE");
    this.objects.set(pathname, {
      data: typeof data === "string" ? data : data.toString("base64"),
      uploadedAt: this.now(),
    });
    return this.url(pathname);
  };

  readJson = async <T>(pathname: string): Promise<T | null> => this.json<T>(pathname) ?? null;

  deleteAt = async (pathname: string): Promise<void> => {
    if (this.failDeleteAt.has(pathname)) throw new Error("BLOB_DELETE_FAILED");
    this.objects.delete(pathname);
  };

  deliver = async (payload: XlegalWebhookPayload): Promise<boolean> => {
    this.webhooks.push(payload);
    return this.webhookOk(payload);
  };

  /** Deletes by URL; a ref in failDelete counts as failed, like storageDeleteMany. */
  deleteMany = async (refs: string[]): Promise<{ deleted: number; failed: number }> => {
    let deleted = 0;
    let failed = 0;
    for (const ref of refs) {
      if (this.failDelete.has(ref)) {
        failed += 1;
        continue;
      }
      this.objects.delete(this.pathnameOf(ref));
      deleted += 1;
    }
    return { deleted, failed };
  };

  // PurgeDeps ----------------------------------------------------------------

  list = async (prefix: string): Promise<StoredObject[]> => {
    this.listCalls.push(prefix);
    return [...this.objects.entries()]
      .filter(([pathname]) => pathname.startsWith(prefix))
      .map(([pathname, entry]) => ({
        pathname,
        uploadedAt: entry.uploadedAt,
        ref: this.url(pathname),
        size: Buffer.byteLength(entry.data),
      }));
  };
}

/** Captures console.log/console.error while `run` executes. */
export async function captureLogs(run: () => Promise<unknown>): Promise<string> {
  const lines: string[] = [];
  const original = { log: console.log, error: console.error };
  const sink = (...args: unknown[]) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  console.log = sink;
  console.error = sink;
  try {
    await run();
  } finally {
    console.log = original.log;
    console.error = original.error;
  }
  return lines.join("\n");
}
