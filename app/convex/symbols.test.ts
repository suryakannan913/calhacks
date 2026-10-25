/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { VOCABULARY } from "./vocabulary";
import { canonicalSymbol, resolveSymbols } from "./symbols";
import { WORDS } from "../src/kid/vocabulary";
import { favoritesFor } from "../src/kid/words";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const images = Object.keys(import.meta.glob("../public/symbols/*.png"));

// The original personalised quick-access list from the seed. Everything else is "outside" it.
const ORIGINAL_12 = ["train", "red", "blue", "yes", "no", "more", "my turn", "hi", "bye", "happy", "play", "look"];

function tool(name: string, input: unknown) {
  return new Response(JSON.stringify({ stop_reason: "tool_use", content: [{ type: "tool_use", name, input }] }), { headers: { "content-type": "application/json" } });
}

async function room(symbolSet: string[] = ORIGINAL_12, roomStatus: "active" | "paused" = "active") {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async ctx => {
    const child = { name: "Maya", age: 9, interests: ["trains"], communicationStyle: "Symbols", sensoryNotes: "Quiet", symbolSet, profileSummary: "Synthetic", voiceId: "stock-maya" };
    const maya = await ctx.db.insert("children", child);
    const leo = await ctx.db.insert("children", { ...child, name: "Leo", voiceId: "stock-leo" });
    const outsider = await ctx.db.insert("children", { ...child, name: "Sam" });
    const matchId = await ctx.db.insert("matches", { childAId: maya, childBId: leo, score: .9, reason: "Short turns", watchOuts: "Quiet", status: "open", parentAApproved: true, parentBApproved: true });
    const roomId = await ctx.db.insert("rooms", { matchId, status: roomStatus });
    return { maya, leo, outsider, roomId };
  });
  return { t, ...ids };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("one vocabulary across UI, backend and database", () => {
  it("backend and UI lists are identical (same ids, labels and order)", () => {
    expect(VOCABULARY.map(w => [w.id, w.label])).toEqual(WORDS.map(w => [w.id, w.label]));
  });
  it("has 250+ words with unique ids and unique labels", () => {
    expect(VOCABULARY.length).toBeGreaterThanOrEqual(250);
    expect(new Set(VOCABULARY.map(w => w.id)).size).toBe(VOCABULARY.length);
    expect(new Set(VOCABULARY.map(w => w.label.toLowerCase())).size).toBe(VOCABULARY.length);
  });
  it("every id is its label slugified, and every word has a pictogram file", () => {
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    for (const w of VOCABULARY) expect(w.id).toBe(slug(w.label));
    for (const w of WORDS) expect(images, w.id).toContain(`..${w.image.replace("/symbols", "/public/symbols")}`);
  });
  it("the original 12 quick-access words are all in the vocabulary", () => {
    for (const label of ORIGINAL_12) expect(canonicalSymbol(label), label).toBe(label);
  });
  it("canonicalSymbol accepts label, id and any case, and rejects unknown words", () => {
    expect(canonicalSymbol("my turn")).toBe("my turn");
    expect(canonicalSymbol("my-turn")).toBe("my turn");
    expect(canonicalSymbol("  WATER ")).toBe("water");
    expect(canonicalSymbol("i")).toBe("I");
    expect(canonicalSymbol("banana phone")).toBeNull();
    expect(canonicalSymbol("")).toBeNull();
  });
  it("resolveSymbols allows custom symbolSet words and refuses anything else", () => {
    expect(resolveSymbols(["water", "special sign"], ["special sign"])).toEqual(["water", "special sign"]);
    expect(resolveSymbols(["water", "special sign"], [])).toBeNull();
  });
  it("My words (quick access) is the child's symbolSet in order, known words only", () => {
    expect(favoritesFor(ORIGINAL_12).map(w => w.label)).toEqual(ORIGINAL_12);
    expect(favoritesFor(["yes", "custom", "YES", "my turn"]).map(w => w.label)).toEqual(["yes", "my turn"]);
  });
});

describe("sending symbols outside the original 12", () => {
  it("accepts any vocabulary word and stores it", async () => {
    const { t, maya, roomId } = await room();
    const symbols = ["I", "want", "water"];
    expect(symbols.some(s => ORIGINAL_12.includes(s))).toBe(false);
    const id = await t.mutation(api.messages.sendSymbols, { roomId, childId: maya, symbols });
    const [m] = await t.query(api.messages.listByRoom, { roomId });
    expect(m._id).toBe(id);
    expect(m.symbols).toEqual(symbols);
    expect(m.status).toBe("drafting");
  });
  it("mixes quick-access words with new ones", async () => {
    const { t, maya, roomId } = await room();
    await t.mutation(api.messages.sendSymbols, { roomId, childId: maya, symbols: ["where", "is", "mom"] });
    const [m] = await t.query(api.messages.listByRoom, { roomId });
    expect(m.symbols).toEqual(["where", "is", "mom"]);
  });
  it("works for every word in the vocabulary", async () => {
    const { t, maya, roomId } = await room();
    for (const { label } of VOCABULARY) {
      await t.mutation(api.messages.sendSymbols, { roomId, childId: maya, symbols: [label] });
      await t.run(async ctx => { // clear the unfinished draft and the rate limit gate
        for (const m of await ctx.db.query("messages").collect()) await ctx.db.patch(m._id, { status: "rejected" });
      });
      vi.advanceTimersByTime(60_000);
    }
    const all = await t.query(api.messages.listByRoom, { roomId });
    expect(all.map(m => m.symbols[0])).toEqual(VOCABULARY.map(w => w.label));
  });
  it("stores one canonical spelling whether the client sends a label or an id", async () => {
    const { t, maya, roomId } = await room();
    await t.mutation(api.messages.sendSymbols, { roomId, childId: maya, symbols: ["MY-TURN", "Ice Cream"] });
    const [m] = await t.query(api.messages.listByRoom, { roomId });
    expect(m.symbols).toEqual(["my turn", "ice cream"]);
  });
  it("still accepts a custom word that only lives in the child's symbolSet", async () => {
    const { t, maya, roomId } = await room([...ORIGINAL_12, "grandma's signal"]);
    await t.mutation(api.messages.sendSymbols, { roomId, childId: maya, symbols: ["grandma's signal", "water"] });
    const [m] = await t.query(api.messages.listByRoom, { roomId });
    expect(m.symbols).toEqual(["grandma's signal", "water"]);
  });
  it("rejects a word that is in neither the vocabulary nor the child's symbolSet", async () => {
    const { t, maya, roomId } = await room();
    await expect(t.mutation(api.messages.sendSymbols, { roomId, childId: maya, symbols: ["water", "banana phone"] }))
      .rejects.toThrow("Choose symbols from the TapTalk vocabulary");
    expect(await t.query(api.messages.listByRoom, { roomId })).toHaveLength(0);
  });
  it("keeps the existing limits: 1 to 6 symbols, active room, child must be in the room", async () => {
    const { t, maya, outsider, roomId } = await room();
    const send = (childId: typeof maya, symbols: string[], r = roomId) => t.mutation(api.messages.sendSymbols, { roomId: r, childId, symbols });
    await expect(send(maya, [])).rejects.toThrow("between 1 and 6");
    await expect(send(maya, ["I", "want", "more", "water", "juice", "please", "now"])).rejects.toThrow("between 1 and 6");
    await expect(send(outsider, ["water"])).rejects.toThrow("not in this room");
    await send(maya, ["I", "want", "more", "water", "juice", "please"]); // exactly 6 is fine
    const paused = await room(ORIGINAL_12, "paused");
    await expect(paused.t.mutation(api.messages.sendSymbols, { roomId: paused.roomId, childId: paused.maya, symbols: ["water"] }))
      .rejects.toThrow("not active");
  });
  it("hands the new words to Claude unchanged, with the sentence guidance", async () => {
    const { t, maya, roomId } = await room();
    const fetch = vi.fn().mockResolvedValue(tool("draft_sentence", { text: "I want water." }));
    vi.stubGlobal("fetch", fetch);
    await t.mutation(api.messages.sendSymbols, { roomId, childId: maya, symbols: ["I", "want", "water"] });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(JSON.parse(body.messages[0].content).symbols).toEqual(["I", "want", "water"]);
    expect(body.system).toContain("question words");
    const [m] = await t.query(api.messages.listByRoom, { roomId });
    expect(m.status).toBe("draft");
    expect(m.draftText).toBe("I want water.");
  });
});

describe("what the parent view reads", () => {
  it("listByRoom returns the expanded symbols and the Claude text for the transcript", async () => {
    const { t, maya, roomId } = await room();
    await t.run(async ctx => { await ctx.db.insert("messages", { roomId, senderChildId: maya, symbols: ["where", "is", "mom"], status: "confirmed", draftText: "Where is mom?", finalText: "Where is mom?" }); });
    const [m] = await t.query(api.messages.listByRoom, { roomId });
    expect(m.symbols).toEqual(["where", "is", "mom"]);
    expect(m.finalText).toBe("Where is mom?");
    expect(m.symbols.every(s => canonicalSymbol(s) === s)).toBe(true);
  });
});

describe("symbols:audit (read-only database check)", () => {
  it("reports only non-canonical symbols and never writes", async () => {
    const { t, maya, roomId } = await room([...ORIGINAL_12, "custom word"]);
    await t.run(async ctx => {
      await ctx.db.insert("messages", { roomId, senderChildId: maya, symbols: ["water", "Zebra Crossing"], status: "spoken" });
      await ctx.db.insert("messages", { roomId, senderChildId: maya, symbols: ["my turn"], status: "spoken" });
    });
    const before = await t.run(async ctx => JSON.stringify(await ctx.db.query("messages").collect()));
    const report = await t.query(internal.symbols.audit, {});
    expect(report.vocabularySize).toBe(VOCABULARY.length);
    expect(report.messagesChecked).toBe(2);
    expect(report.messagesWithOtherSymbols.map(m => m.symbols)).toEqual([["Zebra Crossing"]]);
    expect(report.childrenWithOtherSymbols.map(c => c.symbols)).toEqual([["custom word"], ["custom word"], ["custom word"]]);
    expect(await t.run(async ctx => JSON.stringify(await ctx.db.query("messages").collect()))).toBe(before);
  });
});
