import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseModelJson } from "../gemini";

describe("parseModelJson", () => {
  it("parses the model's JSON answer", () => {
    assert.deepEqual(parseModelJson('{"score": 72, "headline": "Caso con base"}'), {
      score: 72,
      headline: "Caso con base",
    });
  });

  it("throws MODEL_JSON_INVALID for a missing or blank answer, instead of an empty report", () => {
    // `{}` typed as a Verdict or an Informe failed later and far from the cause
    // (the PDF, the webhook's score); a blank answer is an invalid answer.
    for (const text of [undefined, "", "   ", "\n\t "]) {
      assert.throws(() => parseModelJson(text), { message: "MODEL_JSON_INVALID" }, JSON.stringify(text));
    }
  });

  it("throws MODEL_JSON_INVALID, with neither the answer nor the parse error attached", () => {
    const answer = '{"headline": "Cliente Demo E2E, Honduras", "summary": "demo@e2e.local';
    let thrown: unknown;
    try {
      parseModelJson(answer);
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown instanceof Error);
    assert.equal(thrown.message, "MODEL_JSON_INVALID");
    assert.equal(thrown.cause, undefined);
    assert.doesNotMatch(String(thrown.stack), /Cliente Demo|Honduras|demo@e2e\.local/);
  });
});
