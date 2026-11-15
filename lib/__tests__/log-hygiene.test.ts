/**
 * The README promises that the logs of /xlegal, the demo and the premium flow
 * carry an error's code, never its message: an internal `CODE:detail` usually
 * names the client's document, and a message without a code can quote anything
 * (a URL, the model's answer, a file name, an email in a Stripe error). This
 * reads the sources and fails on any console call that would print one:
 *  - an argument that uses a `message` or a `stack` — `error.message`,
 *    `(error as Error).message`, or a local `message` that holds one;
 *  - the error itself — a bare `error`, `err` or `e` argument, `${error}`,
 *    `String(error)` or `{ error }` — which prints its message (and its stack).
 * The way to log an error is safeErrorMessage(error) (lib/safe-error.ts), or
 * safeBlobErrorMessage for a Blob call (lib/storage.ts).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

/**
 * The /xlegal path, the demo flow (embedded in ContyGo's /admin/demo), the
 * premium flow ($50: checkout → upload → pro/run) and what they all call.
 */
const FILES = [
  "app/api/xlegal/jobs/route.ts",
  "app/api/xlegal/run/route.ts",
  "app/api/xlegal/status/route.ts",
  "app/api/xlegal/purge/route.ts",
  "app/api/evaluate/route.ts",
  "app/api/upload/route.ts",
  "app/api/pro/run/route.ts",
  "app/api/checkout/route.ts",
  "lib/xlegal.ts",
  "lib/xlegal-job.ts",
  "lib/xlegal-closeout.ts",
  "lib/xlegal-purge.ts",
  "lib/gemini.ts",
  "lib/gemini-uploads.ts",
  "lib/informe-pipeline.ts",
  "lib/pro-job.ts",
  "lib/storage.ts",
];

/**
 * The argument list of every console.log/error/warn/info/debug/trace call, with
 * the text of its string literals blanked out (a log line may well say
 * "message"), and each `${…}` of its template literals appended as one more
 * argument — which is what it is: a value the line prints.
 */
function consoleCallArguments(source: string): string[] {
  const calls: string[] = [];
  const start = /console\.(?:log|error|warn|info|debug|trace)\(/g;
  let match: RegExpExecArray | null;
  while ((match = start.exec(source))) {
    let i = match.index + match[0].length;
    let depth = 1;
    let code = "";
    const interpolated: string[] = [];
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
            interpolated.push(expression);
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
    calls.push([code, ...interpolated].join(", ").replace(/\s+/g, " ").trim());
  }
  return calls;
}

/** Splits an argument list at its top-level commas (not those inside (), [] or {}). */
function topLevelArguments(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of args) {
    if ("([{".includes(ch)) depth += 1;
    if (")]}".includes(ch)) depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());
  return parts.filter((part) => part.length > 0);
}

/** What an error is called where it is caught: `catch (error)`, `(err) =>`, `catch (e)`. */
const ERROR_NAME = "(?:error|err|e)";

/** The error itself, or its String(), or its toString(). */
const BARE_ERROR = new RegExp(
  `^(?:String\\(\\s*${ERROR_NAME}\\s*\\)|${ERROR_NAME}(?:\\.toString\\(\\))?)$`,
);

/** `{ error }`, `{ jobId, err }`: shorthand that puts the whole error in an object. */
const SHORTHAND_ERROR = new RegExp(`[{,]\\s*${ERROR_NAME}\\s*[,}]`);

/** Why a console call's arguments would print an error's text, or null if they would not. */
function rawErrorIn(args: string): string | null {
  if (/\b(?:message|stack)\b/.test(args)) return "uses a message or a stack";
  for (const argument of topLevelArguments(args)) {
    if (BARE_ERROR.test(argument)) return `logs the error itself (${argument})`;
    if (SHORTHAND_ERROR.test(argument)) return `puts the error in an object (${argument})`;
  }
  return null;
}

describe("log hygiene", () => {
  it("finds a raw message or stack, and ignores one that only appears in a string", () => {
    const source = [
      'console.error("[x] failed:", (error as Error).message);',
      "console.error(`[x] ${jobId} failed: ${err.message}`);",
      'console.error("[x] failed:", message);',
      'console.error("[x] failed:", error.stack);',
      'console.error("[x] the message was not logged:", safeErrorMessage(error));',
    ].join("\n");
    const raw = consoleCallArguments(source).filter((args) => rawErrorIn(args) !== null);
    assert.equal(raw.length, 4);
  });

  it("finds the error itself passed as an argument, in any form that prints it", () => {
    const source = [
      'console.error("[x] failed:", error);',
      "console.error(err);",
      'console.warn("[x] failed:", e, jobId);',
      "console.error(`[x] ${jobId} failed: ${error}`);",
      'console.error("[x] failed:", String(err));',
      'console.error("[x] failed:", e.toString());',
      'console.error("[x] failed", { jobId, error });',
      'console.error("[x] failed", { err });',
    ].join("\n");
    const calls = consoleCallArguments(source);
    assert.equal(calls.length, 8);
    assert.deepEqual(
      calls.filter((args) => rawErrorIn(args) === null),
      [],
    );
  });

  it("also reads console.debug and console.trace", () => {
    const source = [
      'console.debug("[x] failed:", error);',
      'console.trace("[x] failed:", (err as Error).message);',
    ].join("\n");
    const calls = consoleCallArguments(source);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((args) => rawErrorIn(args) !== null), calls.join(" | "));
  });

  it("lets through what only names an error, or logs it safely", () => {
    const source = [
      'console.error("[x] failed:", safeErrorMessage(error));',
      'console.error("[x] failed:", safeBlobErrorMessage(err));',
      "console.error(`[x] ${jobId} failed: ${errorCode(error)}`);",
      'console.error("[x] failed", { error: "TIMEOUT_BUDGET", errors: 2 });',
      'console.log("[x] the error was logged elsewhere", jobId, elapsed);',
    ].join("\n");
    assert.deepEqual(
      consoleCallArguments(source).filter((args) => rawErrorIn(args) !== null),
      [],
    );
  });

  it("no console call on the /xlegal path, the demo, the premium flow or Gemini logs an error's raw text", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const source = readFileSync(join(ROOT, file), "utf8");
      for (const args of consoleCallArguments(source)) {
        const why = rawErrorIn(args);
        if (why) offenders.push(`${file}: console(${args}) — ${why}`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});
