// Operator-only checks: no credentials or provider error bodies are returned.
import { internalAction, internalMutation, env } from "./_generated/server";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { claudeTool, fastModel, record, shortString, voiceVersion } from "./providers";

export const createIntakeFixture = internalMutation({
  args: {},
  handler: async ctx => {
    const childId = await ctx.db.insert("children", { name: "B Intake Test", age: 9,
      interests: ["Original interest"], communicationStyle: "Original communication",
      sensoryNotes: "Original sensory notes", symbolSet: ["train"],
      profileSummary: "Synthetic intake fixture", voiceId: "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4" });
    const parentId = await ctx.db.insert("parents", { childId, displayName: "b-intake-test's parent" });
    return { childId, parentId };
  },
});

export const removeIntakeFixture = internalMutation({
  args: { parentId: v.id("parents") },
  handler: async (ctx, { parentId }) => {
    const parent = await ctx.db.get(parentId);
    if (!parent) return;
    const child = await ctx.db.get(parent.childId);
    if (child?.name !== "B Intake Test" || parent.displayName !== "b-intake-test's parent") throw new Error("Not an intake fixture");
    if (parent.intake) await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, { threadId: parent.intake.threadId });
    await ctx.db.delete(parentId);
    await ctx.db.delete(child._id);
  },
});

// Separate synthetic records keep operator checks out of the team's demo room.
export const createSmokeRoom = internalMutation({
  args: {},
  handler: async ctx => {
    const profile = { age: 9, interests: ["trains"], communicationStyle: "Symbols; short turns",
      sensoryNotes: "Quiet", symbolSet: ["train", "red", "hi", "no"], profileSummary: "Synthetic Person B integration test" };
    const childAId = await ctx.db.insert("children", { ...profile, name: "B Test Maya", voiceId: "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4" });
    const childBId = await ctx.db.insert("children", { ...profile, name: "B Test Leo", voiceId: "30894953-bcce-41fe-892c-15ce19c843ff" });
    const matchId = await ctx.db.insert("matches", { childAId, childBId, score: 1, reason: "Synthetic integration test", watchOuts: "Not a real match", status: "open", parentAApproved: true, parentBApproved: true });
    const roomId = await ctx.db.insert("rooms", { matchId, status: "active" });
    return { roomId, matchId, childAId, childBId };
  },
});

export const removeSmokeRoom = internalMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    if (!room) return;
    const match = await ctx.db.get(room.matchId);
    if (!match || match.reason !== "Synthetic integration test") throw new Error("Not a smoke test room");
    const a = await ctx.db.get(match.childAId);
    const b = await ctx.db.get(match.childBId);
    if (a?.name !== "B Test Maya" || b?.name !== "B Test Leo") throw new Error("Not synthetic test children");
    const messages = await ctx.db.query("messages").withIndex("by_room", q => q.eq("roomId", roomId)).take(100);
    const audioFiles = new Set(messages.flatMap(message => message.audioStorageId ? [message.audioStorageId] : []));
    for (const message of messages) await ctx.db.delete(message._id);
    for (const audioStorageId of audioFiles) await ctx.storage.delete(audioStorageId);
    await ctx.db.delete(roomId); await ctx.db.delete(match._id);
    await ctx.db.delete(a._id); await ctx.db.delete(b._id);
  },
});

export const createModerationProbe = internalMutation({
  args: { roomId: v.id("rooms"), childId: v.id("children") },
  handler: async (ctx, { roomId, childId }) => {
    const child = await ctx.db.get(childId);
    const room = await ctx.db.get(roomId);
    const match = room ? await ctx.db.get(room.matchId) : null;
    if (child?.name !== "B Test Maya" || match?.reason !== "Synthetic integration test" || match.childAId !== childId) throw new Error("Only available in an isolated synthetic test room");
    return await ctx.db.insert("messages", { roomId, senderChildId: childId, symbols: ["no"],
      draftText: "I will hurt you.", status: "draft" });
  },
});

export const checkProviders = internalAction({
  args: {},
  handler: async () => {
    let claude: { ok: boolean; text?: string; error?: string };
    try {
      const result = await claudeTool({ model: fastModel(), name: "draft_sentence",
        system: "Turn AAC symbols into one literal first-person sentence, at most 12 words. Do not invent facts.",
        data: { symbols: ["red", "train"] },
        schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
      });
      claude = { ok: true, text: shortString(result.text, 180) };
    } catch (error) {
      claude = { ok: false, error: error instanceof Error ? error.message : "Claude request failed" };
    }
    if (!env.CARTESIA_API_KEY) return { claude, cartesia: { ok: false, error: "Missing Cartesia key", voices: [] } };
    const response = await fetch("https://api.cartesia.ai/voices", {
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${env.CARTESIA_API_KEY}`, "Cartesia-Version": voiceVersion() },
    });
    if (!response.ok) return { claude, cartesia: { ok: false, error: `Cartesia HTTP ${response.status}`, voices: [] } };
    const body = await response.json();
    const data = Array.isArray(body) ? body : record(body).data;
    if (!Array.isArray(data)) throw new Error("Invalid voice list");
    const voices = data.map(record).filter(voice =>
      (voice.access === "public" || voice.is_public === true) && voice.language === "en"
    ).slice(0, 20).map(voice => ({ id: shortString(voice.id), name: shortString(voice.name),
      description: typeof voice.description === "string" ? voice.description.slice(0, 300) : "" }));
    return { claude, cartesia: { ok: true, voices } };
  },
});
