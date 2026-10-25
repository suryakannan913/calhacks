import { v } from "convex/values";
import { z } from "zod";

export const profileValidator = v.object({
  interests: v.array(v.string()), communicationStyle: v.string(),
  sensoryNotes: v.string(), interactionStyle: v.string(), profileSummary: v.string(),
});
const text = z.string().trim().min(1).max(800);
export const profileSchema = z.object({
  interests: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
  communicationStyle: text, sensoryNotes: text, interactionStyle: text, profileSummary: text,
});
export type IntakeProfile = z.infer<typeof profileSchema>;
export const turnSchema = z.object({ reply: z.string().trim().min(1).max(1200), profile: profileSchema.nullable() });

// Contact details are unnecessary even in the synthetic demo. Reject before
// saving a prompt to the Agent component or sending it to the provider.
export function checkIntakeText(text: string) {
  if (!text.trim() || text.length > 2000) throw new Error("Use a message between 1 and 2,000 characters.");
  if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b|https?:\/\/|\+?\d[\d ()-]{7,}\d|\b\d{1,5}\s+[\w .'-]+\s(?:street|road|avenue|drive|lane|blvd)\b/i.test(text)) {
    throw new Error("Please remove contact details, links, or street addresses. Use synthetic details only.");
  }
}

export const intakeStateValidator = v.object({
  threadId: v.string(), turnCount: v.number(), revision: v.number(),
  status: v.union(v.literal("chatting"), v.literal("review"), v.literal("approved")),
  draft: v.optional(profileValidator), lastReply: v.optional(v.string()),
  lastRequestId: v.optional(v.string()), error: v.optional(v.string()),
  pending: v.optional(v.object({ requestId: v.string(), messageId: v.string(), text: v.string(), token: v.string(), since: v.number() })),
});
