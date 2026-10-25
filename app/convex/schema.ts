import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { intakeStateValidator } from "./intakeTypes";

export default defineSchema({
  children: defineTable({
    name: v.string(), // synthetic names only
    age: v.number(),
    interests: v.array(v.string()),
    communicationStyle: v.string(),
    sensoryNotes: v.string(),
    symbolSet: v.array(v.string()),
    profileSummary: v.string(),
    voiceId: v.string(), // Cartesia voice id (Person B supplies real ids)
  }).index("by_name", ["name"]),

  parents: defineTable({
    childId: v.id("children"),
    displayName: v.string(),
    intakeTranscript: v.optional(v.string()),
    intake: v.optional(intakeStateValidator),
  })
    .index("by_displayName", ["displayName"])
    .index("by_child", ["childId"]),

  matches: defineTable({
    childAId: v.id("children"),
    childBId: v.id("children"),
    score: v.number(),
    reason: v.string(),
    watchOuts: v.string(),
    status: v.union(
      v.literal("proposed"),
      v.literal("approvedA"),
      v.literal("approvedB"),
      v.literal("open"),
      v.literal("declined"),
    ),
    parentAApproved: v.boolean(),
    parentBApproved: v.boolean(),
  })
    .index("by_childA", ["childAId"])
    .index("by_childB", ["childBId"]),

  rooms: defineTable({
    matchId: v.id("matches"),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("closed"),
    ),
    pausedBy: v.optional(v.id("parents")),
  }).index("by_match", ["matchId"]),

  messages: defineTable({
    roomId: v.id("rooms"),
    senderChildId: v.id("children"),
    symbols: v.array(v.string()),
    draftText: v.optional(v.string()),
    finalText: v.optional(v.string()),
    status: v.union(
      v.literal("drafting"),
      v.literal("draft"),
      v.literal("confirmed"),
      v.literal("spoken"),
      v.literal("flagged"),
      v.literal("rejected"),
    ),
    audioStorageId: v.optional(v.id("_storage")),
    moderationNote: v.optional(v.string()),
  }).index("by_room", ["roomId"]),
});
