import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const candidates = internalQuery({
  args: {},
  handler: async ctx => ctx.db.query("children").take(20),
});

export const saveProposals = internalMutation({
  args: { matches: v.array(v.object({ childAId: v.id("children"), childBId: v.id("children"),
    score: v.number(), reason: v.string(), watchOuts: v.string() })) },
  handler: async (ctx, { matches }) => {
    let saved = 0;
    for (const proposal of matches) {
      if (proposal.childAId === proposal.childBId || !Number.isFinite(proposal.score) || proposal.score < 0 || proposal.score > 1) throw new Error("Invalid proposal");
      if (!(await ctx.db.get(proposal.childAId)) || !(await ctx.db.get(proposal.childBId))) continue;
      const existing = [
        ...await ctx.db.query("matches").withIndex("by_childA", q => q.eq("childAId", proposal.childAId)).take(100),
        ...await ctx.db.query("matches").withIndex("by_childB", q => q.eq("childBId", proposal.childAId)).take(100),
      ].find(m => m.childAId === proposal.childBId || m.childBId === proposal.childBId);
      if (existing) {
        if (existing.status !== "proposed" || existing.parentAApproved || existing.parentBApproved) continue;
        await ctx.db.patch(existing._id, { score: proposal.score, reason: proposal.reason, watchOuts: proposal.watchOuts });
      } else await ctx.db.insert("matches", { ...proposal, status: "proposed", parentAApproved: false, parentBApproved: false });
      saved++;
    }
    return saved;
  },
});

// Matches involving this parent's child, with the other child's profile.
export const listForParent = query({
  args: { parentId: v.id("parents") },
  handler: async (ctx, { parentId }) => {
    const parent = await ctx.db.get(parentId);
    if (!parent) return [];
    const asA = await ctx.db
      .query("matches")
      .withIndex("by_childA", (q) => q.eq("childAId", parent.childId))
      .collect();
    const asB = await ctx.db
      .query("matches")
      .withIndex("by_childB", (q) => q.eq("childBId", parent.childId))
      .collect();
    const all = [...asA, ...asB];
    return await Promise.all(
      all.map(async (m) => {
        const iAmA = m.childAId === parent.childId;
        const otherId = iAmA ? m.childBId : m.childAId;
        const other = await ctx.db.get(otherId);
        const room =
          m.status === "open"
            ? await ctx.db
                .query("rooms")
                .withIndex("by_match", (q) => q.eq("matchId", m._id))
                .first()
            : null;
        return {
          ...m,
          iAmSideA: iAmA,
          myApproval: iAmA ? m.parentAApproved : m.parentBApproved,
          otherApproval: iAmA ? m.parentBApproved : m.parentAApproved,
          other: other
            ? {
                name: other.name,
                age: other.age,
                interests: other.interests,
                profileSummary: other.profileSummary,
              }
            : null,
          roomId: room?._id ?? null,
        };
      }),
    );
  },
});

// Single transaction: a room can never open without BOTH approvals.
export const approve = mutation({
  args: { matchId: v.id("matches"), parentId: v.id("parents") },
  handler: async (ctx, { matchId, parentId }) => {
    const match = await ctx.db.get(matchId);
    const parent = await ctx.db.get(parentId);
    if (!match || !parent) throw new Error("Not found");
    if (match.status === "declined") throw new Error("Match was declined");
    if (match.status === "open") return; // already open (idempotent)

    let a = match.parentAApproved;
    let b = match.parentBApproved;
    if (parent.childId === match.childAId) a = true;
    else if (parent.childId === match.childBId) b = true;
    else throw new Error("Parent is not part of this match");

    if (a && b) {
      await ctx.db.patch(matchId, {
        parentAApproved: true,
        parentBApproved: true,
        status: "open",
      });
      const existing = await ctx.db
        .query("rooms")
        .withIndex("by_match", (q) => q.eq("matchId", matchId))
        .first();
      if (!existing) {
        await ctx.db.insert("rooms", { matchId, status: "active" });
      }
    } else {
      await ctx.db.patch(matchId, {
        parentAApproved: a,
        parentBApproved: b,
        status: a ? "approvedA" : "approvedB",
      });
    }
  },
});

export const decline = mutation({
  args: { matchId: v.id("matches"), parentId: v.id("parents") },
  handler: async (ctx, { matchId, parentId }) => {
    const match = await ctx.db.get(matchId);
    const parent = await ctx.db.get(parentId);
    if (!match || !parent) throw new Error("Not found");
    if (
      parent.childId !== match.childAId &&
      parent.childId !== match.childBId
    ) {
      throw new Error("Parent is not part of this match");
    }
    await ctx.db.patch(matchId, { status: "declined" });
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .first();
    if (room) await ctx.db.patch(room._id, { status: "closed" });
  },
});
