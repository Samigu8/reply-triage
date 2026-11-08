import type { LlmClient } from "./llm";
import type { PromptVersion } from "./prompts";
import type { TriageResult } from "./schema";
import { triageReply } from "./triage";

export interface BatchJob {
  id: string;
  status: "queued" | "running" | "done";
  total: number;
  completed: number;
  results: { index: number; result: TriageResult }[];
}

/**
 * A tiny in-memory background queue. It processes one reply at a time so a free tier's
 * rate limit is not exceeded. (A real system would use a persistent queue.)
 */
export class BatchQueue {
  private jobs = new Map<string, BatchJob>();
  private counter = 0;

  constructor(
    private readonly client: LlmClient,
    private readonly version: PromptVersion = "v2",
    private readonly delayMs = 0,
  ) {}

  submit(replies: string[]): BatchJob {
    const job: BatchJob = {
      id: `job-${++this.counter}`,
      status: "queued",
      total: replies.length,
      completed: 0,
      results: [],
    };
    this.jobs.set(job.id, job);
    void this.run(job, replies);
    return job;
  }

  get(id: string): BatchJob | undefined {
    return this.jobs.get(id);
  }

  private async run(job: BatchJob, replies: string[]): Promise<void> {
    job.status = "running";
    for (const [index, reply] of replies.entries()) {
      const result = await triageReply(reply, this.client, this.version);
      job.results.push({ index, result });
      job.completed++;
      if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    }
    job.status = "done";
  }
}
