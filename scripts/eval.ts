import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { clientFromEnv } from "../src/llm";
import { triageReply } from "../src/triage";
import { CATEGORIES, type Category } from "../src/schema";
import type { PromptVersion } from "../src/prompts";

// Usage: npm run eval -- v1   (or v2)
const version = (process.argv[2] ?? "v2") as PromptVersion;
if (version !== "v1" && version !== "v2") throw new Error("Prompt version must be v1 or v2");

interface Item {
  id: number;
  label: Category;
  text: string;
}
interface Row {
  id: number;
  label: Category;
  predicted: Category | null;
  result: Awaited<ReturnType<typeof triageReply>>;
}
const items: Item[] = JSON.parse(readFileSync("data/replies.json", "utf8"));
const delay = Number(process.env.EVAL_DELAY_MS ?? 2500);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const client = clientFromEnv();
const rows: Row[] = [];
for (const item of items) {
  const result = await triageReply(item.text, client, version);
  rows.push({ id: item.id, label: item.label, predicted: result.category, result });
  console.log(`#${item.id} expected=${item.label} got=${result.category ?? "FAILED"} human=${result.needsHuman}`);
  await sleep(delay);
}

const correct = rows.filter((r) => r.predicted === r.label).length;
const perCategory = Object.fromEntries(
  CATEGORIES.map((c) => {
    const subset = rows.filter((r) => r.label === c);
    return [c, { total: subset.length, correct: subset.filter((r) => r.predicted === c).length }];
  }),
);
const summary = {
  version,
  model: process.env.LLM_MODEL ?? "openai/gpt-oss-20b",
  total: rows.length,
  accuracy: Number((correct / rows.length).toFixed(3)),
  humanReviewRate: Number((rows.filter((r) => r.result.needsHuman).length / rows.length).toFixed(3)),
  invalidOutputs: rows.filter((r) => r.result.reasons.some((x) => x.startsWith("invalid_output"))).length,
  retriesUsed: rows.filter((r) => r.result.attempts > 1).length,
  perCategory,
  misclassified: rows.filter((r) => r.predicted !== r.label).map((r) => ({ id: r.id, expected: r.label, got: r.predicted })),
};
mkdirSync("results", { recursive: true });
writeFileSync(`results/${version}.json`, JSON.stringify({ summary, rows }, null, 2));
console.log("\n" + JSON.stringify(summary, null, 2));
