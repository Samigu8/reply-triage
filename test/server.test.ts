import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";

const canned = JSON.stringify({
  category: "unsubscribe",
  confidence: 0.99,
  extracted: { rate: null, email: null, availability: null },
  draft: null,
});
const client = { complete: async () => canned };

async function withServer(fn: (base: string) => Promise<void>) {
  const server = createApp(client).listen(0);
  try {
    await fn(`http://localhost:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("POST /triage returns a result", () =>
  withServer(async (base) => {
    const res = await post(`${base}/triage`, { reply: "STOP" });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { category: string };
    assert.equal(data.category, "unsubscribe");
  }));

test("POST /triage rejects a bad body", () =>
  withServer(async (base) => {
    const res = await post(`${base}/triage`, { nope: 1 });
    assert.equal(res.status, 400);
  }));

test("POST /batch processes in the background", () =>
  withServer(async (base) => {
    const res = await post(`${base}/batch`, { replies: ["STOP", "remove me"] });
    assert.equal(res.status, 202);
    const { id } = (await res.json()) as { id: string };
    let job: { status: string; results: unknown[] } = { status: "queued", results: [] };
    for (let i = 0; i < 50 && job.status !== "done"; i++) {
      await new Promise((r) => setTimeout(r, 20));
      job = (await (await fetch(`${base}/batch/${id}`)).json()) as typeof job;
    }
    assert.equal(job.status, "done");
    assert.equal(job.results.length, 2);
  }));
