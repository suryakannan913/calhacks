/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal, api } from "./_generated/api";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
function tool(name: string, input: unknown) {
  return new Response(JSON.stringify({ stop_reason: "tool_use", content: [{ type: "tool_use", name, input }] }), { headers: { "content-type": "application/json" } });
}
function wav() {
  const bytes = new Uint8Array(48);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WAVE"), 8);
  return new Response(bytes, { headers: { "content-type": "audio/wav" } });
}
async function fixture(status: "drafting" | "draft" | "confirmed" | "rejected" = "confirmed") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const child = { name: "Maya", age: 9, interests: ["trains"], communicationStyle: "Symbols, short turns", sensoryNotes: "Quiet", symbolSet: ["train", "red"], profileSummary: "Synthetic", voiceId: "stock-maya" };
    const maya = await ctx.db.insert("children", child);
    const leo = await ctx.db.insert("children", { ...child, name: "Leo", voiceId: "stock-leo" });
    const matchId = await ctx.db.insert("matches", { childAId: maya, childBId: leo, score: .9, reason: "Short turns", watchOuts: "Quiet", status: "open", parentAApproved: true, parentBApproved: true });
    const roomId = await ctx.db.insert("rooms", { matchId, status: "active" });
    const messageId = await ctx.db.insert("messages", { roomId, senderChildId: maya, symbols: ["train", "red"], status, draftText: "I see a red train.", ...(status === "confirmed" ? { finalText: "I see a red train." } : {}) });
    return { maya, leo, matchId, roomId, messageId };
  });
  return { t, ...ids };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
  vi.stubEnv("CARTESIA_API_KEY", "test-cartesia");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("confirmation and speech", () => {
  it.each(["drafting", "draft", "rejected"] as const)("does not moderate or speak a %s message", async status => {
    const { t, messageId } = await fixture(status);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await t.action(internal.ai.moderate, { messageId });
    await t.action(internal.voice.speak, { messageId });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not speak a confirmed message without moderation approval", async () => {
    const { t, messageId } = await fixture();
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await t.action(internal.voice.speak, { messageId });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("stores WAV and exposes a playable URL after moderation passes", async () => {
    const { t, messageId, roomId } = await fixture();
    const fetch = vi.fn().mockResolvedValueOnce(tool("safety_result", { decision: "pass", reason: "Safe greeting." })).mockResolvedValueOnce(wav());
    vi.stubGlobal("fetch", fetch);
    await t.action(internal.ai.moderate, { messageId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [m] = await t.query(api.messages.listByRoom, { roomId });
    expect(m.status).toBe("spoken"); expect(m.audioUrl).toBeTruthy();
    const payload = JSON.parse(fetch.mock.calls[1][1].body);
    expect(payload.transcript).toBe("I see a red train."); expect(payload.voice).toBe("stock-maya");
    await t.action(internal.voice.speak, { messageId });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("reuses audio only for the same text, voice and model configuration", async () => {
    const { t, messageId, roomId, maya, leo } = await fixture();
    const fetch = vi.fn().mockResolvedValueOnce(tool("safety_result", { decision: "pass", reason: "Safe." })).mockResolvedValueOnce(wav());
    vi.stubGlobal("fetch", fetch);
    await t.action(internal.ai.moderate, { messageId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const first = await t.query(internal.messages.get, { messageId });
    const secondId = await t.run(ctx => ctx.db.insert("messages", { roomId, senderChildId: maya, symbols: ["train", "red"], status: "confirmed", finalText: "I see a red train." }));
    fetch.mockResolvedValueOnce(tool("safety_result", { decision: "pass", reason: "Safe." }));
    await t.action(internal.ai.moderate, { messageId: secondId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.query(internal.messages.get, { messageId: secondId }))?.audioStorageId).toBe(first?.audioStorageId);
    expect(fetch).toHaveBeenCalledTimes(3);
    const thirdId = await t.run(ctx => ctx.db.insert("messages", { roomId, senderChildId: leo, symbols: ["train", "red"], status: "confirmed", finalText: "I see a red train." }));
    fetch.mockResolvedValueOnce(tool("safety_result", { decision: "pass", reason: "Safe." })).mockResolvedValueOnce(wav());
    await t.action(internal.ai.moderate, { messageId: thirdId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(JSON.parse(fetch.mock.calls[4][1].body).voice).toBe("stock-leo");
  });
  it("does not call providers while the room is paused", async () => {
    const { t, messageId, roomId } = await fixture();
    await t.mutation(api.rooms.pause, { roomId });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await t.action(internal.ai.moderate, { messageId });
    await t.action(internal.voice.speak, { messageId });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("flags unsafe text without calling Cartesia", async () => {
    const { t, messageId } = await fixture();
    const fetch = vi.fn().mockResolvedValue(tool("safety_result", { decision: "flag", reason: "Threat." }));
    vi.stubGlobal("fetch", fetch);
    await t.action(internal.ai.moderate, { messageId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.query(internal.messages.get, { messageId }))?.status).toBe("flagged");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("fails closed when moderation returns malformed output", async () => {
    const { t, messageId } = await fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tool("safety_result", { decision: "maybe" })));
    await t.action(internal.ai.moderate, { messageId });
    expect((await t.query(internal.messages.get, { messageId }))?.status).toBe("flagged");
  });
  it("discards audio when a parent pauses during TTS", async () => {
    const { t, messageId, roomId } = await fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tool("safety_result", { decision: "pass", reason: "Safe." })));
    await t.action(internal.ai.moderate, { messageId });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      await t.mutation(api.rooms.pause, { roomId }); return wav();
    }));
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const m = await t.query(internal.messages.get, { messageId });
    expect(m?.status).toBe("confirmed"); expect(m?.audioStorageId).toBeUndefined();
  });
  it("does not mark failed TTS as spoken", async () => {
    const { t, messageId } = await fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(tool("safety_result", { decision: "pass", reason: "Safe." })).mockResolvedValueOnce(new Response("unavailable", { status: 503 })));
    await t.action(internal.ai.moderate, { messageId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const m = await t.query(internal.messages.get, { messageId });
    expect(m?.status).toBe("confirmed"); expect(m?.moderationNote).toContain("Audio unavailable");
  });
});

describe("drafts and matching", () => {
  it("stores a Claude draft without confirming or speaking it", async () => {
    const { t, messageId } = await fixture("drafting");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tool("draft_sentence", { text: "I see a red train." })));
    await t.action(internal.ai.expandSymbols, { messageId });
    const m = await t.query(internal.messages.get, { messageId });
    expect(m?.status).toBe("draft"); expect(m?.finalText).toBeUndefined();
  });
  it("does not resurrect a draft rejected while Claude was running", async () => {
    const { t, messageId } = await fixture("drafting");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      await t.mutation(api.messages.reject, { messageId });
      return tool("draft_sentence", { text: "I see a red train." });
    }));
    await t.action(internal.ai.expandSymbols, { messageId });
    expect((await t.query(internal.messages.get, { messageId }))?.status).toBe("rejected");
  });
  it("rejects overlong drafts instead of silently truncating intent", async () => {
    const { t, messageId } = await fixture("drafting");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tool("draft_sentence", { text: Array(13).fill("train").join(" ") })));
    await t.action(internal.ai.expandSymbols, { messageId });
    expect((await t.query(internal.messages.get, { messageId }))?.status).toBe("rejected");
  });
  it("preserves open matches and both parent approvals", async () => {
    const { t, maya, leo, matchId } = await fixture();
    const fetch = vi.fn().mockResolvedValue(tool("rank_matches", { matches: [{ childAId: leo, childBId: maya, score: .7, reason: "New reason", watchOuts: "New caution" }] }));
    vi.stubGlobal("fetch", fetch);
    expect(await t.action(internal.ai.proposeMatches, {})).toBe(0);
    const m = await t.run(ctx => ctx.db.get(matchId));
    expect(m?.reason).toBe("Short turns"); expect(m?.parentAApproved).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0][1].body).tool_choice).toEqual({ type: "auto" });
  });
});
