import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { synthesize, voiceModel, voiceVersion } from "./providers";
import type { Id } from "./_generated/dataModel";

export const speak = internalAction({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }): Promise<void> => {
    const token = crypto.randomUUID();
    const cacheKey = `${voiceModel()}:${voiceVersion()}:wav:44100`;
    const claim = await ctx.runMutation(internal.messages.claimSpeech, { messageId, token, cacheKey });
    if (!claim) return;
    let created: Id<"_storage"> | undefined;
    try {
      let audioStorageId = claim.cachedStorageId;
      if (audioStorageId && !(await ctx.storage.get(audioStorageId))) audioStorageId = null;
      if (!audioStorageId) {
        created = await ctx.storage.store(await synthesize(claim.text, claim.voiceId));
        audioStorageId = created;
      }
      const committed = await ctx.runMutation(internal.messages.finishSpeech, {
        messageId, token, text: claim.text, voiceId: claim.voiceId, cacheKey, audioStorageId,
      });
      if (!committed && created) await ctx.storage.delete(created);
    } catch {
      if (created) await ctx.storage.delete(created);
      await ctx.runMutation(internal.messages.speechFailed, { messageId, token });
    }
  },
});
