import type { LlmClient } from "./llm";
import { buildMessages, type PromptVersion } from "./prompts";
import { ModelOutputSchema, type ModelOutput, type TriageResult } from "./schema";
import { checkOutput } from "./checks";

/** Models sometimes wrap JSON in ```json fences or add a sentence around it. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON object found");
  return JSON.parse(candidate.slice(start, end + 1));
}

function parseModelOutput(text: string): ModelOutput {
  const parsed = ModelOutputSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return parsed.data;
}

/**
 * Classify one reply. Tries up to twice (the second time telling the model what was wrong),
 * then runs our own checks. Anything we don't trust goes to a human.
 */
export async function triageReply(
  reply: string,
  client: LlmClient,
  version: PromptVersion = "v2",
): Promise<TriageResult> {
  const messages = buildMessages(reply, version);
  let lastError = "unknown";

  for (let attempt = 1; attempt <= 2; attempt++) {
    let text: string;
    try {
      text = await client.complete(messages);
    } catch (err) {
      return failure(`llm_error: ${(err as Error).message}`, attempt);
    }

    try {
      const output = parseModelOutput(text);
      const reasons = checkOutput(output, reply);
      return {
        category: output.category,
        confidence: output.confidence,
        extracted: output.extracted,
        // Never hand back a draft that failed a safety check.
        draft: reasons.some((r) => r.startsWith("draft_") || r === "unexpected_draft") ? null : output.draft,
        needsHuman: reasons.length > 0,
        reasons,
        attempts: attempt,
      };
    } catch (err) {
      lastError = (err as Error).message;
      messages.push(
        { role: "assistant", content: text },
        {
          role: "user",
          content: `That was invalid (${lastError}). Return ONLY the JSON object in the required format.`,
        },
      );
    }
  }
  return failure(`invalid_output: ${lastError}`, 2);
}

function failure(reason: string, attempts: number): TriageResult {
  return {
    category: null,
    confidence: null,
    extracted: null,
    draft: null,
    needsHuman: true,
    reasons: [reason],
    attempts,
  };
}
