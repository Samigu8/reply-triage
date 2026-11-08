export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Anything that can turn messages into text. Tests use a fake; production uses HttpLlmClient. */
export interface LlmClient {
  complete(messages: ChatMessage[]): Promise<string>;
}

export interface HttpLlmOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxRateLimitRetries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Talks to any OpenAI-compatible /chat/completions endpoint (Groq, Gemini's compat layer, etc.). */
export class HttpLlmClient implements LlmClient {
  constructor(private readonly opts: HttpLlmOptions) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    const maxRetries = this.opts.maxRateLimitRetries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${this.opts.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify({
          model: this.opts.model,
          messages,
          temperature: 0,
        }),
      });

      if (res.status === 429 && attempt < maxRetries) {
        // Free tiers rate-limit often. Wait and try again.
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5 * (attempt + 1)) * 1000);
        continue;
      }
      if (!res.ok) {
        throw new Error(`LLM request failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("LLM response had no message content");
      return content;
    }
  }
}

export function clientFromEnv(env: NodeJS.ProcessEnv = process.env): LlmClient {
  const apiKey = env.GROQ_API_KEY ?? env.LLM_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY. Copy .env.example to .env and add your key.");
  return new HttpLlmClient({
    apiKey,
    baseUrl: env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1",
    model: env.LLM_MODEL ?? "openai/gpt-oss-20b",
  });
}
