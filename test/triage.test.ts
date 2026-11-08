import { test } from "node:test";
import assert from "node:assert/strict";
import type { LlmClient } from "../src/llm";
import { triageReply, extractJson } from "../src/triage";
import { checkOutput } from "../src/checks";

/** A fake model that returns canned answers in order. */
function fake(...answers: string[]): LlmClient & { calls: number } {
  const c = {
    calls: 0,
    async complete() {
      const a = answers[Math.min(c.calls, answers.length - 1)]!;
      c.calls++;
      return a;
    },
  };
  return c;
}

const ok = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    category: "interested",
    confidence: 0.95,
    extracted: { rate: null, email: null, availability: null },
    draft: "Thanks so much! A teammate will follow up with details soon.",
    ...over,
  });

test("valid JSON passes and needs no human", async () => {
  const r = await triageReply("I'm in!", fake(ok()));
  assert.equal(r.category, "interested");
  assert.equal(r.needsHuman, false);
  assert.equal(r.attempts, 1);
});

test("JSON inside a code fence is parsed", async () => {
  const r = await triageReply("I'm in!", fake("Here you go:\n```json\n" + ok() + "\n```"));
  assert.equal(r.category, "interested");
});

test("invalid first answer is retried and succeeds", async () => {
  const client = fake("not json at all", ok());
  const r = await triageReply("I'm in!", client);
  assert.equal(r.category, "interested");
  assert.equal(r.attempts, 2);
  assert.equal(client.calls, 2);
});

test("two invalid answers route to a human", async () => {
  const r = await triageReply("hi", fake("nope", '{"category":"weird"}'));
  assert.equal(r.needsHuman, true);
  assert.equal(r.category, null);
  assert.ok(r.reasons[0]!.startsWith("invalid_output"));
});

test("low confidence routes to a human", async () => {
  const r = await triageReply("maybe?", fake(ok({ confidence: 0.4 })));
  assert.equal(r.needsHuman, true);
  assert.ok(r.reasons.includes("low_confidence"));
});

test("a draft with a dollar amount is blocked", async () => {
  const r = await triageReply("I'm in!", fake(ok({ draft: "Great, we can pay you $500 for it." })));
  assert.equal(r.needsHuman, true);
  assert.equal(r.draft, null);
  assert.ok(r.reasons.includes("draft_mentions_price"));
});

test("a draft with an email not in the input is blocked", () => {
  const reasons = checkOutput(
    { category: "interested", confidence: 0.9, extracted: { rate: null, email: null, availability: null }, draft: "Write to boss@company.com" },
    "I'm in!",
  );
  assert.ok(reasons.includes("draft_contains_contact_info"));
});

test("a draft repeating the sender's own email is allowed", () => {
  const reasons = checkOutput(
    { category: "interested", confidence: 0.9, extracted: { rate: null, email: null, availability: null }, draft: "We'll write to you at me@x.com" },
    "reach me at me@x.com",
  );
  assert.deepEqual(reasons, []);
});

test("unsubscribe with a draft is flagged", async () => {
  const r = await triageReply("STOP", fake(ok({ category: "unsubscribe" })));
  assert.equal(r.needsHuman, true);
  assert.ok(r.reasons.includes("unexpected_draft"));
});

test("question category always goes to a human", async () => {
  const r = await triageReply("how long?", fake(ok({ category: "question" })));
  assert.equal(r.needsHuman, true);
});

test("extractJson throws when there is no JSON", () => {
  assert.throws(() => extractJson("hello"));
});
