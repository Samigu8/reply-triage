import express from "express";
import { z } from "zod";
import type { LlmClient } from "./llm";
import { triageReply } from "./triage";
import { BatchQueue } from "./batch";
import { TriageRequestSchema } from "./schema";

const BatchRequestSchema = z.object({
  replies: z.array(z.string().min(1).max(5000)).min(1).max(100),
});

export function createApp(client: LlmClient, delayMs = 0) {
  const app = express();
  app.use(express.json({ limit: "100kb" }));
  const queue = new BatchQueue(client, "v2", delayMs);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Classify one reply.
  app.post("/triage", async (req, res) => {
    const body = TriageRequestSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Body must be { reply: string } (1-5000 characters)" });
      return;
    }
    res.json(await triageReply(body.data.reply, client, "v2"));
  });

  // Classify many replies in the background; poll the job for results.
  app.post("/batch", (req, res) => {
    const body = BatchRequestSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Body must be { replies: string[] } (1-100 items)" });
      return;
    }
    const job = queue.submit(body.data.replies);
    res.status(202).json({ id: job.id, status: job.status, total: job.total });
  });

  app.get("/batch/:id", (req, res) => {
    const job = queue.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  });

  return app;
}
