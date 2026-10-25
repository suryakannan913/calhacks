// Run:  npx convex run seed:reset
// Wipes everything and restores the demo state. All data is synthetic.
import { internalMutation } from "./_generated/server";

const SYMBOLS = [
  "train", "red", "blue", "yes", "no", "more", "my turn", "hi",
  "bye", "happy", "play", "look",
];

export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of [
      "messages", "rooms", "matches", "parents", "children",
    ] as const) {
      for (const row of await ctx.db.query(table).collect()) {
        await ctx.db.delete(row._id);
      }
    }

    // Maya/Leo use verified stock voice IDs; other profiles still need voices.
    const mk = (
      name: string, age: number, interests: string[],
      communicationStyle: string, sensoryNotes: string,
      profileSummary: string, voiceId: string,
    ) =>
      ctx.db.insert("children", {
        name, age, interests, communicationStyle, sensoryNotes,
        symbolSet: SYMBOLS, profileSummary, voiceId,
      });

    const maya = await mk("Maya", 9, ["trains", "colors", "music"],
      "Uses a symbol tablet; prefers short turns",
      "Sensitive to loud noises",
      "Maya loves trains and bright colors. She communicates with symbols and does best taking short turns.",
      "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4"); // Skylar, stock
    const leo = await mk("Leo", 10, ["trains", "puzzles"],
      "Uses a symbol tablet; likes taking turns",
      "Prefers calm, quiet spaces",
      "Leo loves trains and puzzles. He uses symbols and enjoys predictable, turn-based play.",
      "30894953-bcce-41fe-892c-15ce19c843ff"); // Parker, stock
    const aiden = await mk("Aiden", 11, ["dinosaurs", "space"],
      "Uses a symbol tablet plus a few spoken words",
      "Dislikes bright flashing lights",
      "Aiden is fascinated by dinosaurs and space. He uses symbols and a few words.",
      "VOICE_ID_AIDEN");
    const priya = await mk("Priya", 8, ["animals", "music"],
      "Uses a symbol tablet; likes playing alongside someone",
      "Enjoys soft music, dislikes sudden sounds",
      "Priya loves animals and music. She likes gentle, parallel play.",
      "VOICE_ID_PRIYA");
    const sam = await mk("Sam", 12, ["dinosaurs", "lego"],
      "Uses a symbol tablet; likes short back-and-forth",
      "No major sensitivities",
      "Sam loves dinosaurs and Lego. He enjoys quick, simple exchanges.",
      "VOICE_ID_SAM");

    for (const [childId, displayName] of [
      [maya, "Maya's parent"], [leo, "Leo's parent"],
      [aiden, "Aiden's parent"], [priya, "Priya's parent"],
      [sam, "Sam's parent"],
    ] as const) {
      await ctx.db.insert("parents", { childId, displayName });
    }

    // Pre-opened match + room for the demo opening (Maya <-> Leo).
    const open = await ctx.db.insert("matches", {
      childAId: maya, childBId: leo, score: 0.92,
      reason: "Both love trains and both do best with short, predictable turns.",
      watchOuts: "Both prefer quiet spaces, so keep sessions calm.",
      status: "open", parentAApproved: true, parentBApproved: true,
    });
    await ctx.db.insert("rooms", { matchId: open, status: "active" });

    // Proposed matches for the match-approval demo (B's proposeMatches can overwrite reasons).
    await ctx.db.insert("matches", {
      childAId: aiden, childBId: sam, score: 0.88,
      reason: "Both are into dinosaurs and like short, simple exchanges.",
      watchOuts: "Aiden dislikes flashing lights, so avoid animated effects.",
      status: "proposed", parentAApproved: false, parentBApproved: false,
    });
    await ctx.db.insert("matches", {
      childAId: priya, childBId: maya, score: 0.74,
      reason: "Both enjoy music and gentle play; both are sensitive to sudden sounds.",
      watchOuts: "Priya likes parallel play, Maya prefers direct turns.",
      status: "proposed", parentAApproved: false, parentBApproved: false,
    });
  },
});
