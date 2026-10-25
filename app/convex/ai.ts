import { internalAction, action, env } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { intakeAgent } from "./intakeAgent";
import { turnSchema } from "./intakeTypes";
import { Output } from "ai";
import { claudeTool, fastModel, matchModel, record, shortString, voiceModel, voiceVersion } from "./providers";

// Dashboard/CLI diagnostics: reports presence, never secret values.
export const readiness = internalAction({
  args: {},
  handler: async (ctx): Promise<{
    anthropicConfigured: boolean; cartesiaConfigured: boolean;
    fastModel: string; matchModel: string; voiceModel: string; voiceVersion: string;
    childrenMissingVoices: string[];
  }> => {
    const children = await ctx.runQuery(internal.matches.candidates, {});
    return { anthropicConfigured: Boolean(env.ANTHROPIC_API_KEY), cartesiaConfigured: Boolean(env.CARTESIA_API_KEY),
      fastModel: fastModel(), matchModel: matchModel(), voiceModel: voiceModel(), voiceVersion: voiceVersion(),
      childrenMissingVoices: children.filter(c => !c.voiceId || c.voiceId.startsWith("VOICE_ID_")).map(c => c.name) };
  },
});

export const expandSymbols = internalAction({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }): Promise<void> => {
    const context = await ctx.runQuery(internal.messages.generationContext, { messageId });
    if (!context || context.message.status !== "drafting") return;
    try {
      const result = await claudeTool({ model: fastModel(), name: "draft_sentence",
        system: "Translate AAC symbols for a child aged 8–12 into ONE literal, first-person, present-tense sentence, at most 12 words. Preserve negation, explicit requests, and turn-taking. When symbols contain only objects and attributes, use I see; never infer a request. Use I want ONLY if an explicit request symbol is present. Example: red + train -> I see a red train. Never invent feelings, names, motives, or facts. Use prior conversation only to resolve references, never add meaning. For ambiguity choose the least assumptive literal reading. Do not claim to know the child's intent. Symbols can also be pronouns, verbs, feelings, people, places and question words: keep the child's words in order and make one short, grammatical sentence or question from them, adding no new facts (for example where + is + mom -> Where is mom?; I + want + water -> I want water.).",
        data: { symbols: context.message.symbols, age: context.child.age,
          communicationStyle: context.child.communicationStyle, recent: context.recent },
        schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
      });
      const draftText = shortString(result.text, 180);
      if (draftText.split(/\s+/).length > 12 || /[\r\n]/.test(draftText)) throw new Error("Invalid draft length");
      await ctx.runMutation(internal.messages.setDraft, { messageId, draftText });
    } catch {
      await ctx.runMutation(internal.messages.generationFailed, { messageId });
    }
  },
});

export const moderate = internalAction({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }): Promise<void> => {
    const context = await ctx.runQuery(internal.messages.generationContext, { messageId });
    const m = context?.message;
    if (!m || m.status !== "confirmed" || !m.finalText) return;
    try {
      const result = await claudeTool({ model: fastModel(), name: "safety_result",
        system: "Check a child-confirmed message for a synthetic, parent-mediated AAC friendship demo for ages 8–12. Flag threats, bullying, sexual content, dangerous instructions, self-harm content, requests for private contact or identifying details. Allow ordinary refusal, negative feelings, sensory needs, and asking for help; do not suppress these. Return pass or flag and a brief parent-readable reason. This is a limited safeguard, not a guarantee.",
        data: { text: m.finalText },
        schema: { type: "object", properties: { decision: { type: "string", enum: ["pass", "flag"] }, reason: { type: "string" } }, required: ["decision", "reason"], additionalProperties: false },
      });
      const reason = shortString(result.reason);
      if (result.decision === "flag") {
        await ctx.runMutation(internal.messages.setFlagged, { messageId, moderationNote: reason });
      } else if (result.decision === "pass") {
        await ctx.runMutation(internal.messages.approveSpeech, { messageId, text: m.finalText });
      } else throw new Error("Invalid moderation decision");
    } catch {
      await ctx.runMutation(internal.messages.setFlagged, { messageId,
        moderationNote: "Safety check unavailable. This message was not sent to speech." });
    }
  },
});

export const proposeMatches = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const children = await ctx.runQuery(internal.matches.candidates, {});
    if (children.length < 2) return 0;
    const result = await claudeTool({ model: matchModel(), name: "rank_matches", maxTokens: 2500,
      system: "Rank compatible pairs from these synthetic child profiles. Weight communication compatibility and sensory fit above shared interests. Return up to 6 distinct pairs, scores 0–1, one parent-readable sentence of reason and one watch-out each. Never diagnose, infer protected traits, or invent profile facts. Use only supplied IDs. Parents must approve every proposed match.",
      data: children,
      schema: { type: "object", properties: { matches: { type: "array", maxItems: 6, items: {
        type: "object", properties: { childAId: { type: "string" }, childBId: { type: "string" }, score: { type: "number", minimum: 0, maximum: 1 }, reason: { type: "string" }, watchOuts: { type: "string" } },
        required: ["childAId", "childBId", "score", "reason", "watchOuts"], additionalProperties: false,
      } } }, required: ["matches"], additionalProperties: false },
    });
    if (!Array.isArray(result.matches) || result.matches.length > 6) throw new Error("Invalid matches");
    const seen = new Set<string>();
    const matches = result.matches.map(value => {
      const m = record(value);
      const a = children.find(c => c._id === m.childAId);
      const b = children.find(c => c._id === m.childBId);
      if (!a || !b || a._id === b._id || typeof m.score !== "number" || !Number.isFinite(m.score) || m.score < 0 || m.score > 1) throw new Error("Invalid match candidate");
      const key = [a._id, b._id].sort().join(":");
      if (seen.has(key)) throw new Error("Duplicate match pair");
      seen.add(key);
      return { childAId: a._id, childBId: b._id, score: m.score,
        reason: shortString(m.reason), watchOuts: shortString(m.watchOuts) };
    });
    return await ctx.runMutation(internal.matches.saveProposals, { matches });
  },
});

// Public wizard entrypoint; durable history lives in the Agent component.
export const intakeTurn = action({
  args: { parentId: v.id("parents"), message: v.string(), requestId: v.string() },
  handler: async (ctx, args): Promise<import("./intake").IntakeResult> => {
    const token = crypto.randomUUID();
    const reservation = await ctx.runMutation(internal.intake.reserveTurn, { ...args, token });
    if (reservation.cached) return reservation.result;
    try {
      const result = await intakeAgent(reservation.turnCount).generateText(ctx, { threadId: reservation.threadId }, {
        promptMessageId: reservation.messageId, output: Output.object({ schema: turnSchema }),
        maxOutputTokens: 2000, maxRetries: 0, abortSignal: AbortSignal.timeout(45_000),
        providerOptions: { anthropic: { structuredOutputMode: "outputFormat" } },
      });
      const output = turnSchema.parse(result.output);
      const committed = await ctx.runMutation(internal.intake.completeTurn, { parentId: args.parentId, token, ...output });
      if (!committed) throw new Error("Intake changed while generating");
      return output;
    } catch {
      await ctx.runMutation(internal.intake.failTurn, { parentId: args.parentId, token });
      throw new Error("Claude could not finish this reply. Please retry your message.");
    }
  },
});
