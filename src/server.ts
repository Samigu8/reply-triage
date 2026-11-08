import "dotenv/config";
import { createApp } from "./app";
import { clientFromEnv } from "./llm";

const port = Number(process.env.PORT ?? 3000);
const delayMs = Number(process.env.EVAL_DELAY_MS ?? 0);

createApp(clientFromEnv(), delayMs).listen(port, () => {
  console.log(`reply-triage listening on http://localhost:${port}`);
});
