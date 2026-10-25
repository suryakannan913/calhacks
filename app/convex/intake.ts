import { createThread, listMessages, saveMessage } from '@convex-dev/agent'
import { v } from 'convex/values'
import { query, mutation, internalMutation } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import type { QueryCtx, MutationCtx } from './_generated/server'
import { components } from './_generated/api'
import { rateLimiter } from './rateLimit'
import { checkIntakeText, profileSchema, profileValidator, turnSchema } from './intakeTypes'
import type { IntakeProfile } from './intakeTypes'

const LEASE_MS = 90_000
export type IntakeResult = { reply: string; profile: IntakeProfile | null }
export type Reservation = { cached: true; result: IntakeResult } | {
  cached: false; threadId: string; messageId: string; token: string; turnCount: number
}

// This follows the existing synthetic-demo parent-ID contract. It is not
// authentication; real-family use requires server-derived authenticated identity.
async function parentAndChild(ctx: QueryCtx | MutationCtx, parentId: Doc<'parents'>['_id']) {
  const parent = await ctx.db.get(parentId)
  if (!parent) throw new Error('Parent not found')
  const child = await ctx.db.get(parent.childId)
  if (!child) throw new Error('Child not found')
  return { parent, child }
}

async function readTurns(ctx: QueryCtx | MutationCtx, threadId: string) {
  const { page } = await listMessages(ctx, components.agent, {
    threadId, paginationOpts: { numItems: 20, cursor: null }, statuses: ['success'],
  })
  return page.reverse().flatMap<{ role: "parent" | "claude"; text: string }>(message => {
    const raw = message.message?.content
    const content = typeof raw === 'string' ? raw : Array.isArray(raw)
      ? raw.flatMap(part => part.type === 'text' ? [part.text] : []).join('') : ''
    if (!content) return []
    if (message.message?.role === 'user') return [{ role: 'parent' as const, text: content }]
    if (message.message?.role !== 'assistant') return []
    try {
      const result = turnSchema.safeParse(JSON.parse(content))
      return result.success ? [{ role: 'claude' as const, text: result.data.reply }] : []
    } catch { return [] }
  })
}

export const get = query({
  args: { parentId: v.id('parents') },
  handler: async (ctx, { parentId }) => {
    const { parent } = await parentAndChild(ctx, parentId)
    const state = parent.intake
    if (!state) return { status: 'chatting' as const, revision: 0, draft: null, error: null, pending: null, turns: [] }
    return { status: state.status, revision: state.revision, draft: state.draft ?? null,
      error: state.error ?? null,
      pending: state.pending ? { requestId: state.pending.requestId, text: state.pending.text, since: state.pending.since } : null,
      turns: await readTurns(ctx, state.threadId) }
  },
})

export const reserveTurn = internalMutation({
  args: { parentId: v.id('parents'), message: v.string(), requestId: v.string(), token: v.string() },
  handler: async (ctx, { parentId, message, requestId, token }): Promise<Reservation> => {
    checkIntakeText(message)
    if (!requestId || requestId.length > 100) throw new Error('Invalid request ID')
    const { parent } = await parentAndChild(ctx, parentId)
    let state = parent.intake
    if (state?.lastRequestId === requestId && state.lastReply) {
      return { cached: true, result: { reply: state.lastReply, profile: state.draft ?? null } }
    }
    if (state && state.status !== 'chatting') throw new Error('Review the profile before starting another intake.')
    if (state?.pending && Date.now() - state.pending.since < LEASE_MS) throw new Error('Claude is already answering. Please wait.')
    if (state?.pending && (state.pending.requestId !== requestId || state.pending.text !== message.trim())) {
      throw new Error('Retry the last message or start over first.')
    }
    if (state && state.turnCount >= 3) throw new Error('Please review the profile or start over.')
    const limit = await rateLimiter.limit(ctx, 'intakeTurn', { key: parentId })
    if (!limit.ok) throw new Error('Please wait a moment before trying again.')
    if (!state) state = { threadId: await createThread(ctx, components.agent, { title: 'Synthetic parent intake' }),
      turnCount: 0, revision: 0, status: 'chatting' }
    const messageId = state.pending?.messageId ?? (await saveMessage(ctx, components.agent, {
      threadId: state.threadId, message: { role: 'user', content: message.trim() },
    })).messageId
    await ctx.db.patch(parentId, { intake: { ...state, error: undefined,
      pending: { requestId, messageId, text: message.trim(), token, since: Date.now() } } })
    return { cached: false, threadId: state.threadId, messageId, token, turnCount: state.turnCount }
  },
})

export const completeTurn = internalMutation({
  args: { parentId: v.id('parents'), token: v.string(), reply: v.string(), profile: v.union(profileValidator, v.null()) },
  handler: async (ctx, { parentId, token, reply, profile }) => {
    const { parent } = await parentAndChild(ctx, parentId)
    const state = parent.intake
    if (!state?.pending || state.pending.token !== token) return false
    const result = turnSchema.parse({ reply, profile })
    checkIntakeText(result.reply)
    if (result.profile) checkIntakeText(JSON.stringify(result.profile))
    if (state.turnCount >= 2 && !result.profile) throw new Error('Expected a reviewable profile after three answers')
    await ctx.db.patch(parentId, { intake: { ...state, pending: undefined, error: undefined,
      turnCount: state.turnCount + 1, revision: state.revision + 1, lastRequestId: state.pending.requestId,
      lastReply: result.reply, draft: result.profile ?? undefined, status: result.profile ? 'review' : 'chatting' } })
    return true
  },
})

export const failTurn = internalMutation({
  args: { parentId: v.id('parents'), token: v.string() },
  handler: async (ctx, { parentId, token }) => {
    const parent = await ctx.db.get(parentId)
    const state = parent?.intake
    if (state?.pending?.token !== token) return
    await ctx.db.patch(parentId, { intake: { ...state, pending: { ...state.pending, since: 0 },
      error: 'Claude could not finish this reply. Retry the same message; your approved profile has not changed.' } })
  },
})

export const approve = mutation({
  args: { parentId: v.id('parents'), revision: v.number(), profile: profileValidator },
  handler: async (ctx, { parentId, revision, profile }) => {
    const { parent, child } = await parentAndChild(ctx, parentId)
    const state = parent.intake
    if (state?.status === 'approved' && state.revision === revision) return
    if (!state || state.status !== 'review' || state.pending || state.revision !== revision) throw new Error('This profile draft changed. Reload and review it again.')
    const approved = profileSchema.parse(profile)
    checkIntakeText(JSON.stringify(approved))
    const turns = await readTurns(ctx, state.threadId)
    await ctx.db.patch(child._id, { interests: approved.interests,
      communicationStyle: `${approved.communicationStyle}\nInteraction: ${approved.interactionStyle}`,
      sensoryNotes: approved.sensoryNotes, profileSummary: approved.profileSummary })
    await ctx.db.patch(parentId, { intakeTranscript: JSON.stringify(turns),
      intake: { ...state, status: 'approved', draft: approved } })
  },
})

export const restart = mutation({
  args: { parentId: v.id('parents') },
  handler: async (ctx, { parentId }) => {
    const { parent } = await parentAndChild(ctx, parentId)
    if (parent.intake?.pending && Date.now() - parent.intake.pending.since < LEASE_MS) throw new Error('Wait for the current reply before starting over.')
    if (!parent.intake) return
    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, { threadId: parent.intake.threadId })
    // Keep the revision monotonic across restarts, so an old browser cannot
    // approve an earlier draft after a new thread reaches its first review.
    const threadId = await createThread(ctx, components.agent, { title: 'Synthetic parent intake' })
    await ctx.db.patch(parentId, { intake: { threadId, turnCount: 0,
      revision: parent.intake.revision + 1, status: 'chatting' } })
  },
})
