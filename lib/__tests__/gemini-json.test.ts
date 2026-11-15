import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateJsonWith, parseModelJson, type GenerateContent } from "../gemini";

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

/* -------------------------------------------------------------------------- */
/*  generateJsonWith: what is retried, and how many times                      */
/* -------------------------------------------------------------------------- */

type ScriptedModel = GenerateContent & { calls: number };

/** A model that gives these answers in order: a string (or undefined) is its text, an Error is thrown. */
function scriptedModel(answers: Array<string | undefined | Error>): ScriptedModel {
  const model: ScriptedModel = Object.assign(
    async () => {
      const answer = answers[model.calls];
      model.calls += 1;
      if (answer instanceof Error) throw answer;
      return { text: answer };
    },
    { calls: 0 },
  );
  return model;
}

const PARAMS = { model: "gemini-test", contents: "x", config: {} };
const noWait = async () => {};
const overloaded = () => new Error("503 UNAVAILABLE: The model is overloaded");
const VALID = '{"score": 72}';

describe("generateJsonWith", () => {
  it("retries a blank or invalid answer once, and returns the second answer", async () => {
    for (const bad of [undefined, "", "   ", '{"headline": "cut']) {
      const model = scriptedModel([bad, VALID]);
      const answer = await generateJsonWith<{ score: number }>(model, PARAMS, noWait);
      assert.deepEqual(answer, { score: 72 }, JSON.stringify(bad));
      assert.equal(model.calls, 2);
    }
  });

  it("retries an invalid answer only once: a second one fails the call", async () => {
    const model = scriptedModel(["", "", VALID]);
    await assert.rejects(generateJsonWith(model, PARAMS, noWait), { message: "MODEL_JSON_INVALID" });
    assert.equal(model.calls, 2);
  });

  it("an invalid answer does not spend the retries of an overloaded model", async () => {
    // retries: 2 → up to two more tries on 503/429, whatever else went wrong before.
    const model = scriptedModel(["", overloaded(), overloaded(), VALID]);
    const answer = await generateJsonWith<{ score: number }>(model, { ...PARAMS, retries: 2 }, noWait);
    assert.deepEqual(answer, { score: 72 });
    assert.equal(model.calls, 4);
  });

  it("nor do the retries of an overloaded model spend the one of an invalid answer", async () => {
    const model = scriptedModel([overloaded(), overloaded(), "", VALID]);
    const answer = await generateJsonWith<{ score: number }>(model, { ...PARAMS, retries: 2 }, noWait);
    assert.deepEqual(answer, { score: 72 });
    assert.equal(model.calls, 4);
  });

  it("still stops after its retries of an overloaded model, with that error", async () => {
    const model = scriptedModel([overloaded(), overloaded(), overloaded(), VALID]);
    await assert.rejects(generateJsonWith(model, { ...PARAMS, retries: 2 }, noWait), /503/);
    assert.equal(model.calls, 3);
  });

  it("never retries any other error", async () => {
    const model = scriptedModel([new Error("400 INVALID_ARGUMENT"), VALID]);
    await assert.rejects(generateJsonWith(model, PARAMS, noWait), /400/);
    assert.equal(model.calls, 1);
  });
});
