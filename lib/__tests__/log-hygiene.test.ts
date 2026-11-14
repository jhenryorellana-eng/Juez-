/**
 * The README promises that the /xlegal logs carry an error's code, never its
 * message: an internal `CODE:detail` usually names the client's document, and a
 * message without a code can quote anything (a URL, the model's answer, a file
 * name). This reads the sources and fails on any console call whose arguments
 * use a `message` — `error.message`, `(error as Error).message`, or a local
 * `message` that holds one. The way to log an error is safeErrorMessage(error)
 * (lib/safe-error.ts), or safeBlobErrorMessage for a Blob call.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

/** The /xlegal path, the demo flow (embedded in ContyGo's /admin/demo) and what both call. */
const FILES = [
  "app/api/xlegal/jobs/route.ts",
  "app/api/xlegal/run/route.ts",
  "app/api/xlegal/status/route.ts",
  "app/api/xlegal/purge/route.ts",
  "app/api/evaluate/route.ts",
  "lib/xlegal.ts",
  "lib/xlegal-job.ts",
  "lib/xlegal-closeout.ts",
  "lib/xlegal-purge.ts",
  "lib/gemini.ts",
  "lib/gemini-uploads.ts",
  "lib/informe-pipeline.ts",
];

/**
 * The argument list of every console.log/error/warn/info call, with the text of
 * its string literals blanked out (a log line may well say "message") and the
 * `${…}` expressions of its template literals kept.
 */
function consoleCallArguments(source: string): string[] {
  const calls: string[] = [];
  const start = /console\.(?:log|error|warn|info)\(/g;
  let match: RegExpExecArray | null;
  while ((match = start.exec(source))) {
    let i = match.index + match[0].length;
    let depth = 1;
    let code = "";
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === '"' || ch === "'") {
        i += 1;
        while (i < source.length && source[i] !== ch) i += source[i] === "\\" ? 2 : 1;
        i += 1;
        code += '""';
        continue;
      }
      if (ch === "`") {
        i += 1;
        while (i < source.length && source[i] !== "`") {
          if (source[i] === "\\") {
            i += 2;
          } else if (source[i] === "$" && source[i + 1] === "{") {
            i += 2;
            let braces = 1;
            let expression = "";
            while (i < source.length) {
              if (source[i] === "{") braces += 1;
              if (source[i] === "}" && (braces -= 1) === 0) break;
              expression += source[i];
              i += 1;
            }
            i += 1;
            code += ` ${expression} `;
          } else {
            i += 1;
          }
        }
        i += 1;
        code += "``";
        continue;
      }
      if (ch === "(") depth += 1;
      if (ch === ")" && (depth -= 1) === 0) break;
      code += ch;
      i += 1;
    }
    calls.push(code.replace(/\s+/g, " ").trim());
  }
  return calls;
}

describe("log hygiene", () => {
  it("finds a raw message, and ignores one that only appears in a string", () => {
    const source = [
      'console.error("[x] failed:", (error as Error).message);',
      "console.error(`[x] ${jobId} failed: ${err.message}`);",
      'console.error("[x] failed:", message);',
      'console.error("[x] the message was not logged:", safeErrorMessage(error));',
    ].join("\n");
    const raw = consoleCallArguments(source).filter((args) => /\bmessage\b/.test(args));
    assert.equal(raw.length, 3);
  });

  it("no console call on the /xlegal path, the demo or Gemini logs an error's raw message", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const source = readFileSync(join(ROOT, file), "utf8");
      for (const args of consoleCallArguments(source)) {
        if (/\bmessage\b/.test(args)) offenders.push(`${file}: console(${args})`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});
