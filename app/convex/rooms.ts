import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => ctx.db.get(roomId),
});

// Kid view: find the open room for a child (so C only needs ?child=maya).
export const forChild = query({
  args: { childId: v.id("children") },
  handler: async (ctx, { childId }) => {
    const asA = await ctx.db
      .query("matches")
      .withIndex("by_childA", (q) => q.eq("childAId", childId))
      .collect();
    const asB = await ctx.db
      .query("matches")
      .withIndex("by_childB", (q) => q.eq("childBId", childId))
      .collect();
    for (const m of [...asA, ...asB]) {
      if (m.status !== "open") continue;
      const room = await ctx.db
        .query("rooms")
        .withIndex("by_match", (q) => q.eq("matchId", m._id))
        .first();
      if (room && room.status !== "closed") return room;
    }
    return null;
  },
});

export const pause = mutation({
  args: { roomId: v.id("rooms"), parentId: v.optional(v.id("parents")) },
  handler: async (ctx, { roomId, parentId }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status === "closed") return;
    await ctx.db.patch(roomId, { status: "paused", pausedBy: parentId });
  },
});

export const resume = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, { roomId }) => {
    const room = await ctx.db.get(roomId);
    if (!room || room.status !== "paused") return;
    await ctx.db.patch(roomId, { status: "active", pausedBy: undefined });
  },
});
