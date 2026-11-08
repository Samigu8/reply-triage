import type { ChatMessage } from "./llm";

export type PromptVersion = "v1" | "v2";

const V1_SYSTEM = `You sort replies to outreach emails sent to content creators.
Return ONLY a JSON object with these keys:
category (interested | not_interested | question | out_of_office | unsubscribe),
confidence (number from 0 to 1),
extracted ({ rate, email, availability }, each a string or null),
draft (a short polite reply, or null).`;

const V2_SYSTEM = `You sort replies to outreach emails that a creator-marketing company sent to content creators.

Categories:
- interested: the creator wants to work together or asks to continue (even if they mention a price).
- not_interested: a clear no, now or for the foreseeable future, but they did NOT ask to be removed from the list.
- question: they ask something we must answer before they can decide (rates, deliverables, timing, who we are).
- out_of_office: an automatic or personal away message with no decision in it.
- unsubscribe: they ask to stop receiving email, be removed, or say they will report it as spam.

Rules:
1. If a message asks to stop emails, the category is unsubscribe, even if it is also a no.
2. If a message is both interested and asks a question, choose interested.
3. extracted.rate: copy the creator's stated price exactly as written, else null.
   extracted.email: an email address written in the message, else null.
   extracted.availability: dates or timing they gave, else null. Never invent values.
4. draft: write a reply ONLY for interested and question. For the other categories use null.
   Drafts are at most 3 sentences, friendly, and must NOT agree to a price, promise payment, or include
   any email address or phone number. Say a teammate will follow up on pricing and details.
5. confidence reflects how sure you are (0 to 1). Use below 0.7 when the message is ambiguous.

Return ONLY a JSON object, with no extra text and no markdown:
{"category": "...", "confidence": 0.0, "extracted": {"rate": null, "email": null, "availability": null}, "draft": null}`;

export function buildMessages(reply: string, version: PromptVersion): ChatMessage[] {
  return [
    { role: "system", content: version === "v1" ? V1_SYSTEM : V2_SYSTEM },
    { role: "user", content: `Reply to classify:\n"""\n${reply}\n"""` },
  ];
}
