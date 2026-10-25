/// <reference types="vite/client" />
import { describe, expect, it, vi, afterEach } from 'vitest'
import { convexTest } from 'convex-test'
import agentTest from '@convex-dev/agent/test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { saveMessage } from '@convex-dev/agent'
import schema from './schema'
import { api, internal, components } from './_generated/api'
import type { ActionCtx } from './_generated/server'
import type { IntakeProfile } from './intakeTypes'

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('./intakeAgent', () => ({ intakeAgent: () => ({ generateText: generate }) }))
const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts'])
const profile: IntakeProfile = {
  interests: ['trains'], communicationStyle: 'Uses symbols', sensoryNotes: 'Prefers quiet',
  interactionStyle: 'Short turns', profileSummary: 'Enjoys trains and uses symbols.',
}
async function fixture() {
  const t = convexTest(schema, modules)
  agentTest.register(t)
  rateLimiterTest.register(t)
  const ids = await t.run(async ctx => {
    const base = { name: 'Synthetic Maya', age: 9, interests: ['old interest'], communicationStyle: 'Original style',
      sensoryNotes: 'Original sensory notes', symbolSet: ['train'], profileSummary: 'Original summary', voiceId: 'stock-voice' }
    const childId = await ctx.db.insert('children', base)
    const otherId = await ctx.db.insert('children', { ...base, name: 'Synthetic Leo' })
    const parentId = await ctx.db.insert('parents', { childId, displayName: 'Synthetic parent' })
    return { childId, otherId, parentId }
  })
  return { t, ...ids }
}
function respond(reply = 'Please review this profile.', proposed: IntakeProfile | null = profile) {
  generate.mockImplementation(async (ctx: ActionCtx, thread: { threadId: string }, args: { promptMessageId: string }) => {
    const object = { reply, profile: proposed }
    await saveMessage(ctx, components.agent, { threadId: thread.threadId, promptMessageId: args.promptMessageId,
      message: { role: 'assistant', content: [{ type: 'text', text: JSON.stringify(object) }] } })
    return { output: object }
  })
}
afterEach(() => { generate.mockReset() })

describe('live intake', () => {
  it('keeps generated drafts separate from the approved child profile', async () => {
    const { t, parentId, childId } = await fixture()
    respond()
    await t.action(api.ai.intakeTurn, { parentId, message: 'Likes trains, uses symbols, likes quiet and short turns.', requestId: 'one' })
    const session = await t.query(api.intake.get, { parentId })
    expect(session.status).toBe('review')
    expect(session.draft).toEqual(profile)
    expect(session.turns.map(turn => turn.role)).toEqual(['parent', 'claude'])
    expect((await t.run(ctx => ctx.db.get(childId)))?.interests).toEqual(['old interest'])
  })
  it('approves parent edits atomically and preserves identity, voice and symbols', async () => {
    const { t, parentId, childId, otherId } = await fixture()
    respond()
    await t.action(api.ai.intakeTurn, { parentId, message: 'Likes trains.', requestId: 'one' })
    await t.mutation(api.intake.approve, { parentId, revision: 1, profile: { ...profile, interests: ['puzzles'] } })
    const child = await t.run(ctx => ctx.db.get(childId))
    expect(child).toMatchObject({ interests: ['puzzles'], name: 'Synthetic Maya', age: 9, voiceId: 'stock-voice', symbolSet: ['train'] })
    expect(child?.communicationStyle).toContain('Short turns')
    expect((await t.run(ctx => ctx.db.get(otherId)))?.interests).toEqual(['old interest'])
    expect((await t.query(api.intake.get, { parentId })).status).toBe('approved')
    expect((await t.run(ctx => ctx.db.get(parentId)))?.intakeTranscript).toContain('Likes trains.')
  })
  it('requires a reviewable draft and the current revision before approval', async () => {
    const { t, parentId } = await fixture()
    await expect(t.mutation(api.intake.approve, { parentId, revision: 0, profile })).rejects.toThrow('draft changed')
    respond()
    await t.action(api.ai.intakeTurn, { parentId, message: 'Likes trains.', requestId: 'one' })
    await expect(t.mutation(api.intake.approve, { parentId, revision: 0, profile })).rejects.toThrow('draft changed')
  })
  it('deduplicates completed action requests without another provider call', async () => {
    const { t, parentId } = await fixture()
    respond()
    const args = { parentId, message: 'Likes trains.', requestId: 'one' }
    const first = await t.action(api.ai.intakeTurn, args)
    expect(await t.action(api.ai.intakeTurn, args)).toEqual(first)
    expect(generate).toHaveBeenCalledTimes(1)
    expect((await t.query(api.intake.get, { parentId })).turns).toHaveLength(2)
  })
  it('retries provider errors without duplicating the user prompt', async () => {
    const { t, parentId, childId } = await fixture()
    const args = { parentId, message: 'Likes trains.', requestId: 'one' }
    generate.mockRejectedValue(new Error('provider unavailable'))
    await expect(t.action(api.ai.intakeTurn, args)).rejects.toThrow('Please retry')
    expect((await t.query(api.intake.get, { parentId })).error).toContain('Retry')
    respond()
    await t.action(api.ai.intakeTurn, args)
    expect((await t.query(api.intake.get, { parentId })).turns).toHaveLength(2)
    expect((await t.run(ctx => ctx.db.get(childId)))?.interests).toEqual(['old interest'])
  })
  it('rejects contact details before persisting or sending them to Claude', async () => {
    const { t, parentId } = await fixture()
    await expect(t.action(api.ai.intakeTurn, { parentId, message: 'Email me at parent@example.com', requestId: 'one' })).rejects.toThrow('remove contact')
    expect(generate).not.toHaveBeenCalled()
    expect((await t.run(ctx => ctx.db.get(parentId)))?.intake).toBeUndefined()
  })
  it('handles malformed model output without exposing a review draft', async () => {
    const { t, parentId } = await fixture()
    generate.mockResolvedValue({ output: { reply: 'Done', profile: { interests: [] } } })
    await expect(t.action(api.ai.intakeTurn, { parentId, message: 'Likes trains.', requestId: 'one' })).rejects.toThrow('Please retry')
    const session = await t.query(api.intake.get, { parentId })
    expect(session.draft).toBeNull()
    expect(session.status).toBe('chatting')
  })
  it('blocks overlapping requests while the current turn holds its lease', async () => {
    const { t, parentId } = await fixture()
    await t.mutation(internal.intake.reserveTurn, { parentId, message: 'Likes trains.', requestId: 'one', token: 'a' })
    await expect(t.mutation(internal.intake.reserveTurn, { parentId, message: 'Likes music.', requestId: 'two', token: 'b' })).rejects.toThrow('already answering')
  })
  it('keeps a multi-turn thread across query reloads and requires a draft after turn three', async () => {
    const { t, parentId } = await fixture()
    respond('How do they communicate?', null)
    await t.action(api.ai.intakeTurn, { parentId, message: 'Likes trains.', requestId: 'one' })
    respond('Any sensory or play preferences?', null)
    await t.action(api.ai.intakeTurn, { parentId, message: 'Uses symbols.', requestId: 'two' })
    expect((await t.query(api.intake.get, { parentId })).turns).toHaveLength(4)
    respond()
    await t.action(api.ai.intakeTurn, { parentId, message: 'Quiet and short turns.', requestId: 'three' })
    const session = await t.query(api.intake.get, { parentId })
    expect(session.turns).toHaveLength(6)
    expect(session.status).toBe('review')
  })
  it('never lets a stale generation overwrite a newer request token', async () => {
    const { t, parentId } = await fixture()
    await t.mutation(internal.intake.reserveTurn, { parentId, message: 'Likes trains.', requestId: 'one', token: 'a' })
    await t.mutation(internal.intake.failTurn, { parentId, token: 'a' })
    await t.mutation(internal.intake.reserveTurn, { parentId, message: 'Likes trains.', requestId: 'one', token: 'b' })
    expect(await t.mutation(internal.intake.completeTurn, { parentId, token: 'a', reply: 'Old result', profile })).toBe(false)
    expect((await t.query(api.intake.get, { parentId })).draft).toBeNull()
  })
  it('does not approve contact details edited into a profile', async () => {
    const { t, parentId, childId } = await fixture()
    respond()
    await t.action(api.ai.intakeTurn, { parentId, message: 'Likes trains.', requestId: 'one' })
    await expect(t.mutation(api.intake.approve, { parentId, revision: 1,
      profile: { ...profile, profileSummary: 'Contact parent@example.com' } })).rejects.toThrow('remove contact')
    expect((await t.run(ctx => ctx.db.get(childId)))?.profileSummary).toBe('Original summary')
  })
  it('starting over discards the draft but leaves the approved profile unchanged', async () => {
    const { t, parentId, childId } = await fixture()
    respond()
    await t.action(api.ai.intakeTurn, { parentId, message: 'Likes trains.', requestId: 'one' })
    await t.mutation(api.intake.restart, { parentId })
    expect((await t.query(api.intake.get, { parentId })).draft).toBeNull()
    expect((await t.run(ctx => ctx.db.get(childId)))?.profileSummary).toBe('Original summary')
    await t.action(api.ai.intakeTurn, { parentId, message: 'Likes puzzles now.', requestId: 'two' })
    await expect(t.mutation(api.intake.approve, { parentId, revision: 1, profile })).rejects.toThrow('draft changed')
  })
})
