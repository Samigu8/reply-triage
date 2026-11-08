import type { ModelOutput } from "./schema";

export const MIN_CONFIDENCE = 0.7;
export const MAX_DRAFT_LENGTH = 600;

const EMAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE_RE = /\+?\d[\d\s().-]{8,}\d/g;
const MONEY_RE = /[$€£]\s?\d|\b\d+\s?(usd|dollars)\b/i;
const DRAFT_CATEGORIES = new Set(["interested", "question"]);

/**
 * Checks that run AFTER the model answers. Each failure becomes a reason and the
 * reply is routed to a human instead of being trusted.
 */
export function checkOutput(output: ModelOutput, originalReply: string): string[] {
  const reasons: string[] = [];

  if (output.confidence < MIN_CONFIDENCE) reasons.push("low_confidence");

  if (output.category === "question") reasons.push("needs_answer_from_human");

  if (output.draft !== null && !DRAFT_CATEGORIES.has(output.category)) {
    reasons.push("unexpected_draft");
  }
  if (output.draft === null && output.category === "interested") {
    reasons.push("missing_draft");
  }

  if (output.draft !== null) {
    if (output.draft.length > MAX_DRAFT_LENGTH) reasons.push("draft_too_long");
    if (MONEY_RE.test(output.draft)) reasons.push("draft_mentions_price");

    const allowed = new Set((originalReply.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()));
    const leaked = (output.draft.match(EMAIL_RE) ?? []).some((e) => !allowed.has(e.toLowerCase()));
    if (leaked || PHONE_RE.test(output.draft)) reasons.push("draft_contains_contact_info");
  }

  return reasons;
}
