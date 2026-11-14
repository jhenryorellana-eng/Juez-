import { safeErrorMessage } from "./safe-error";

/**
 * How long one files.delete may take. release() runs before a finished report
 * is handed back, so an unbounded delete could spend the job's budget and turn
 * a ready report into TIMEOUT_BUDGET. A DELETE normally answers in well under a
 * second, the deletes run in parallel, and a file left behind is dropped by
 * Google after 48 h anyway.
 */
export const DELETE_TIMEOUT_MS = 5_000;

/**
 * The files one evaluation uploaded to the Gemini Files API. They are the
 * client's documents, and Google keeps them for 48 h unless they are deleted,
 * so every evaluation deletes its own as soon as it is over (release()).
 *
 * The deleter is injected so this can be tested without Gemini (lib/gemini.ts
 * passes the real files.delete). It receives an AbortSignal that fires after
 * `deleteTimeoutMs`; release() stops waiting at that point even if the deleter
 * ignores the signal.
 */
export class GeminiUploads {
  private readonly names: string[] = [];
  private readonly inflight = new Set<Promise<unknown>>();
  private drained = false;

  constructor(
    private readonly deleteFile: (name: string, signal: AbortSignal) => Promise<void>,
    private readonly deleteTimeoutMs: number = DELETE_TIMEOUT_MS,
  ) {}

  /**
   * Runs one upload and remembers the file it created. The upload is tracked
   * while in flight, so release() can wait for it: when a sibling upload fails,
   * Promise.all rejects early and release() runs while the others are still
   * uploading — and in serverless a delete nobody awaits can die with the
   * invocation.
   */
  upload<T extends { name?: string }>(start: () => Promise<T>): Promise<T> {
    const running = start().then((file) => {
      this.track(file.name);
      return file;
    });
    const settled = running.then(
      () => undefined,
      () => undefined,
    );
    this.inflight.add(settled);
    void settled.then(() => this.inflight.delete(settled));
    return running;
  }

  /**
   * Waits for the uploads still in flight, then deletes every file. Never
   * throws: cleanup must not break an evaluation (Google drops the files after
   * 48 h anyway).
   */
  async release(): Promise<void> {
    await Promise.all([...this.inflight]);
    this.drained = true;
    const names = this.names.splice(0);
    await Promise.all(names.map((name) => this.safeDelete(name)));
  }

  private track(name: string | undefined): void {
    if (!name) return;
    // Only an upload started after release() can land here: nobody waits for it
    // any more, so delete it on arrival.
    if (this.drained) void this.safeDelete(name);
    else this.names.push(name);
  }

  private async safeDelete(name: string): Promise<void> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve("timeout");
      }, this.deleteTimeoutMs);
    });
    try {
      const outcome = await Promise.race([this.deleteFile(name, controller.signal), timedOut]);
      if (outcome === "timeout") {
        console.error(
          `[gemini:files] deleting an uploaded file timed out after ${this.deleteTimeoutMs} ms`,
        );
      }
    } catch (err) {
      console.error("[gemini:files] could not delete an uploaded file:", safeErrorMessage(err));
    } finally {
      clearTimeout(timer);
    }
  }
}
