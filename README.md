# Reply Triage

A small TypeScript API that reads replies to creator-outreach emails, classifies them with an LLM, drafts a safe reply when appropriate, and flags anything it doesn't trust for a human. It also includes an evaluation script that measures accuracy on a labeled dataset and compares two prompts.

All data is fake. No real emails or personal information are used.

## What it does

1. `POST /triage` takes `{ "reply": "..." }` and returns a category, confidence, extracted details (rate, email, availability), an optional draft reply, and a `needsHuman` flag with reasons.
2. The model's output is validated with Zod. If it is invalid, the model is asked once more. If it is still invalid, the reply goes to a human.
3. Extra checks run on the output: low confidence, drafts that mention prices, drafts containing emails or phone numbers not in the original message, overlong drafts, and drafts for categories that should not get one.
4. `POST /batch` queues many replies and processes them one at a time in the background (`GET /batch/:id` to poll), to respect free-tier rate limits.

Categories: `interested`, `not_interested`, `question`, `out_of_office`, `unsubscribe`.

## Run it

```bash
npm install
cp .env.example .env     # then put your own key in .env
npm start
```

Check the model ID in your provider's console and set `LLM_MODEL` in `.env`. Any OpenAI-compatible provider works by changing `LLM_BASE_URL`, `LLM_MODEL` and the key. Default is Groq's free tier.

```bash
curl -X POST localhost:3000/triage -H "Content-Type: application/json" \
  -d '{"reply":"Sounds great! My rate is $500 per video."}'
```

## Tests and evaluation

```bash
npm test               # unit and API tests with a fake model (no network, no key)
npm run typecheck
npm run eval -- v1     # runs the 40 labeled replies against prompt v1
npm run eval -- v2     # same for prompt v2
```

Results are written to `results/` (ignored by git); copy the numbers below.

## Results

| Prompt | Model | Accuracy | Human-review rate | Invalid outputs | Retries used |
|--------|-------|----------|-------------------|-----------------|--------------|
| v1 (short) | `openai/gpt-oss-20b` | 0.975 | 0.675 | 0 | 2 |
| v2 (definitions + rules) | `openai/gpt-oss-20b` | 0.975 | 0.175 | 0 | 0 |

What went wrong (from `misclassified` in the results files):

- v1 misclassified reply 39 (`unsubscribe` predicted as `not_interested`).
- v2 misclassified reply 18 (`question` predicted as `interested`).
- v1's 67.5% human-review rate was driven mainly by `unexpected_draft` (18 replies), where drafts were produced for categories that should not receive one; another 8 replies had `needs_answer_from_human`.

## Limitations

- The dataset is 40 hand-written fake replies, so accuracy numbers are rough and not representative of real email.
- The batch queue is in memory and is lost on restart.
- Free-tier models and limits change without notice.
- Drafts are never sent automatically.
