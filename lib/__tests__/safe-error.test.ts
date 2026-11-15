import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "@google/genai";
import { safeErrorMessage } from "../safe-error";

describe("safeErrorMessage", () => {
  it("keeps only the code of a CODE:detail message, whose detail may be a client's file name", () => {
    assert.equal(safeErrorMessage(new Error("FILE_NOT_ACTIVE:Pasaporte Cliente.pdf")), "FILE_NOT_ACTIVE");
    assert.equal(safeErrorMessage(new Error("UNSAFE_PATH:xlegal/docs/a b.pdf")), "UNSAFE_PATH");
    assert.equal(safeErrorMessage(new Error("ENOENT: no such file, unlink 'xlegal/docs/Cliente.pdf'")), "ENOENT");
  });

  it("keeps a message that is a code and nothing else", () => {
    assert.equal(safeErrorMessage(new Error("TIMEOUT_BUDGET")), "TIMEOUT_BUDGET");
    assert.equal(safeErrorMessage(new Error("MODEL_JSON_INVALID")), "MODEL_JSON_INVALID");
  });

  it("logs only the kind of an error whose message has no code, never the message", () => {
    assert.equal(safeErrorMessage(new Error("fetch failed")), "Error");
    assert.equal(safeErrorMessage(new TypeError("Cannot read 'Cliente Demo E2E'")), "TypeError");
    let parseError: unknown;
    try {
      JSON.parse('{"headline": "Cliente Demo E2E, Honduras');
    } catch (error) {
      parseError = error;
    }
    assert.equal(safeErrorMessage(parseError), "SyntaxError");
  });

  it("logs a thrown non-Error by its type, never its content", () => {
    assert.equal(safeErrorMessage("Cliente Demo E2E ".repeat(30)), "string");
    assert.equal(safeErrorMessage({ email: "demo@e2e.local" }), "object");
    assert.equal(safeErrorMessage(undefined), "undefined");
  });

  it("adds the HTTP status of a Gemini API error, without its message", () => {
    const quota = new ApiError({ message: "Quota exceeded for Cliente Demo E2E", status: 429 });
    assert.equal(safeErrorMessage(quota), "ApiError (HTTP 429)");
    const unavailable = new ApiError({ message: '{"error":{"message":"overloaded"}}', status: 503 });
    assert.equal(safeErrorMessage(unavailable), "ApiError (HTTP 503)");
  });
});
