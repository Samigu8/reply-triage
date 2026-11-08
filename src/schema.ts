import { z } from "zod";

export const CATEGORIES = [
  "interested",
  "not_interested",
  "question",
  "out_of_office",
  "unsubscribe",
] as const;

export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

/** What we ask the model to return. */
export const ModelOutputSchema = z.object({
  category: CategorySchema,
  confidence: z.number().min(0).max(1),
  extracted: z.object({
    rate: z.string().nullable(),
    email: z.string().nullable(),
    availability: z.string().nullable(),
  }),
  draft: z.string().nullable(),
});
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

/** What the API returns after our own checks run. */
export interface TriageResult {
  category: Category | null;
  confidence: number | null;
  extracted: ModelOutput["extracted"] | null;
  draft: string | null;
  needsHuman: boolean;
  reasons: string[];
  attempts: number;
}

export const TriageRequestSchema = z.object({
  reply: z.string().min(1).max(5000),
});
