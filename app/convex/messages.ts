import { rateLimiter } from "./rateLimit";
import { resolveSymbols } from "./symbols";

import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// ---------- Public API (kid view + parent view) ----------

// Live transcript. Includes audioUrl so the client can just play it.
export const listByRoom = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .order("asc")
      .collect();
    return await Promise.all(
      msgs.map(async (m) => ({
        ...m,
        audioUrl: m.audioStorageId
          ? await ctx.storage.getUrl(m.audioStorageId)
          : null,
      })),
    );
  },
});

export const sendSymbols = mutation({
  args: {
    roomId: v.id("rooms"),
    childId: v.id("children"),
    symbols: v.array(v.string()),
  },
  handler: async (ctx, { roomId, childId, symbols }) => {
    const room = await ctx.db.get(roomId);
    if (!room) throw new Error("Room not found");
    if (room.status !== "active") throw new Error("Room is not active");
    const match = await ctx.db.get(room.matchId);
    if (!match || (match.childAId !== childId && match.childBId !== childId)) {
      throw new Error("Child is not in this room");
    }
    if (symbols.length === 0 || symbols.length > 6) {
      throw new Error("Send between 1 and 6 symbols");
    }
    const child = await ctx.db.get(childId);
    // Any TapTalk vocabulary word is allowed; symbolSet is the child's quick-access list (and may
    // hold custom words). Stored in canonical form so every spelling of a word is one value.
    const resolved = child ? resolveSymbols(symbols, child.symbolSet) : null;
    if (!child || !resolved) {
      throw new Error("Choose symbols from the TapTalk vocabulary");
    }
      const rl = await rateLimiter.limit(ctx, "sendSymbols", { key: roomId });
    if (!rl.ok) throw new Error("Slow down a little");

    // One unfinished draft per child at a time. Drafts older than 30s are
    // treated as stuck and auto-rejected so a child is never locked out.
    const recent = await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .order("desc")
      .take(10);
    const now = Date.now();
    const pending = recent.filter(
      (m) =>
        m.senderChildId === childId &&
        (m.status === "drafting" || m.status === "draft"),
    );
    if (pending.some((m) => now - m._creationTime < 30_000)) {
      throw new Error("Finish or reject your current message first");
    }
    for (const m of pending) {
      await ctx.db.patch(m._id, { status: "rejected" });
    }

    const messageId = await ctx.db.insert("messages", {
      roomId,
      senderChildId: childId,
      symbols: resolved,
      status: "drafting",
    });
    await ctx.scheduler.runAfter(0, internal.ai.expandSymbols, { messageId });
    return messageId;
  },
});

// Child taps the tick. Hard gate: nothing is moderated or spoken before this.
export const confirm = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const m = await ctx.db.get(messageId);
    if (!m) throw new Error("Message not found");
    if (m.status !== "draft") return; // idempotent against double taps
    const rl = await rateLimiter.limit(ctx, "confirm", { key: m.roomId });
    if (!rl.ok) throw new Error("Slow down a little");
    const room = await ctx.db.get(m.roomId);
    if (!room || room.status !== "active") throw new Error("Room is not active");
    await ctx.db.patch(messageId, {
      status: "confirmed",
      finalText: m.draftText,
    });
    // moderate -> (on pass) speak. Person B's moderate schedules voice.speak.
    await ctx.scheduler.runAfter(0, internal.ai.moderate, { messageId });
  },
});

// Child taps the cross.
export const reject = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const m = await ctx.db.get(messageId);
    if (!m) throw new Error("Message not found");
    if (m.status !== "draft" && m.status !== "drafting") return;
    await ctx.db.patch(messageId, { status: "rejected" });
  },
});

// ---------- Internal helpers (Person B's actions call these) ----------

export const get = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => ctx.db.get(messageId),
});

// Recent context for Claude: last N messages in the room, oldest first.
export const recentForRoom = internalQuery({
  args: { roomId: v.id("rooms"), limit: v.optional(v.number()) },
  handler: async (ctx, { roomId, limit }) => {
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .order("desc")
      .take(limit ?? 5);
    return msgs.reverse();
  },
});

export const setDraft = internalMutation({
  args: { messageId: v.id("messages"), draftText: v.string() },
  handler: async (ctx, { messageId, draftText }) => {
    const m = await ctx.db.get(messageId);
    if (!m || m.status !== "drafting") return; // child may have rejected already
    const room = await ctx.db.get(m.roomId);
    if (room?.status !== "active") {
      await ctx.db.patch(messageId, { status: "rejected" });
      return;
    }
    await ctx.db.patch(messageId, { draftText, status: "draft" });
  },
});

export const setFlagged = internalMutation({
  args: { messageId: v.id("messages"), moderationNote: v.string() },
  handler: async (ctx, { messageId, moderationNote }) => {
    const m = await ctx.db.get(messageId);
    if (!m || m.status !== "confirmed" || m.moderationNote?.startsWith("speaking:")) return;
    await ctx.db.patch(messageId, { status: "flagged", moderationNote });
  },
});

export const setSpoken = internalMutation({
  args: {
    messageId: v.id("messages"),
    audioStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { messageId, audioStorageId }) => {
    void ctx; void messageId; void audioStorageId;
    throw new Error("Use messages.finishSpeech after moderation");
  },
});

// Internal pipeline helpers; no new message statuses or tables.
export const generationContext = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    if (!message) return null;
    const room = await ctx.db.get(message.roomId);
    const child = await ctx.db.get(message.senderChildId);
    if (!room || room.status !== "active" || !child) return null;
    const history = await ctx.db.query("messages").withIndex("by_room", q => q.eq("roomId", message.roomId)).order("desc").take(30);
    const recent = history.filter(m => m._creationTime < message._creationTime &&
      (m.status === "confirmed" || m.status === "spoken") && m.finalText).slice(0, 5).reverse()
      .map(m => ({ text: m.finalText, senderChildId: m.senderChildId }));
    return { message, child, recent };
  },
});

export const generationFailed = internalMutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const m = await ctx.db.get(messageId);
    if (m?.status === "drafting") await ctx.db.patch(messageId, {
      status: "rejected", moderationNote: "Draft unavailable. Please try the symbols again.",
    });
  },
});

export const approveSpeech = internalMutation({
  args: { messageId: v.id("messages"), text: v.string() },
  handler: async (ctx, { messageId, text }) => {
    const m = await ctx.db.get(messageId);
    if (!m || m.status !== "confirmed" || m.finalText !== text ||
      m.moderationNote === "approved" || m.moderationNote?.startsWith("speaking:")) return;
    const room = await ctx.db.get(m.roomId);
    if (room?.status !== "active") return;
    await ctx.db.patch(messageId, { moderationNote: "approved" });
    await ctx.scheduler.runAfter(0, internal.voice.speak, { messageId });
  },
});

export const claimSpeech = internalMutation({
  args: { messageId: v.id("messages"), token: v.string(), cacheKey: v.string() },
  handler: async (ctx, { messageId, token, cacheKey }) => {
    const m = await ctx.db.get(messageId);
    if (!m || m.status !== "confirmed" || !m.finalText || m.moderationNote !== "approved") return null;
    const room = await ctx.db.get(m.roomId);
    const child = await ctx.db.get(m.senderChildId);
    if (room?.status !== "active" || !child) return null;
    await ctx.db.patch(messageId, { moderationNote: `speaking:${token}` });
    const previous = await ctx.db.query("messages").withIndex("by_room", q => q.eq("roomId", m.roomId)).order("desc").take(100);
    const cached = previous.find(p => p.status === "spoken" && p.finalText === m.finalText &&
      p.moderationNote === JSON.stringify({ voiceId: child.voiceId, cacheKey }) && p.audioStorageId);
    return { text: m.finalText, voiceId: child.voiceId, cachedStorageId: cached?.audioStorageId ?? null };
  },
});

export const finishSpeech = internalMutation({
  args: { messageId: v.id("messages"), token: v.string(), text: v.string(),
    voiceId: v.string(), cacheKey: v.string(), audioStorageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const m = await ctx.db.get(args.messageId);
    if (!m || m.status !== "confirmed" || m.finalText !== args.text || m.moderationNote !== `speaking:${args.token}`) return false;
    const room = await ctx.db.get(m.roomId);
    const child = await ctx.db.get(m.senderChildId);
    if (room?.status !== "active" || child?.voiceId !== args.voiceId) {
      await ctx.db.patch(m._id, { moderationNote: "Speech cancelled while room or voice changed. Retry moderation after resuming." });
      return false;
    }
    await ctx.db.patch(m._id, { status: "spoken", audioStorageId: args.audioStorageId,
      moderationNote: JSON.stringify({ voiceId: args.voiceId, cacheKey: args.cacheKey }) });
    return true;
  },
});

export const speechFailed = internalMutation({
  args: { messageId: v.id("messages"), token: v.string() },
  handler: async (ctx, { messageId, token }) => {
    const m = await ctx.db.get(messageId);
    if (m?.status === "confirmed" && m.moderationNote === `speaking:${token}`) {
      await ctx.db.patch(messageId, { moderationNote: "Audio unavailable. Retry moderation to try again." });
    }
  },
});
