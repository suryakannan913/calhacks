import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Only replaces the two synthetic seed placeholders; preserves custom choices.
export const configureDemoVoices = internalMutation({
  args: {},
  handler: async (ctx) => {
    const selected = [];
    for (const [name, voiceId] of [
      ["Maya", "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4"], // Skylar (stock)
      ["Leo", "30894953-bcce-41fe-892c-15ce19c843ff"], // Parker (stock)
    ]) {
      const child = await ctx.db.query("children").withIndex("by_name", q => q.eq("name", name)).unique();
      if (!child) continue;
      if (child.voiceId.startsWith("VOICE_ID_")) await ctx.db.patch(child._id, { voiceId });
      selected.push({ name, childId: child._id, voiceId: child.voiceId.startsWith("VOICE_ID_") ? voiceId : child.voiceId });
    }
    return selected;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query("children").collect(),
});

// For ?child=maya URLs (lowercase name matched case-insensitively).
export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const all = await ctx.db.query("children").collect();
    return all.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? null;
  },
});

// For ?parent=... URLs.
export const parentByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const all = await ctx.db.query("parents").collect();
    return (
      all.find((p) => p.displayName.toLowerCase() === name.toLowerCase()) ??
      null
    );
  },
});
