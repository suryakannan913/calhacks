import { TOPICS, type Topic } from './vocabulary.ts'
import { wordById, type Word } from './words.ts'

export type Suggestion = { topic: Topic; words: Word[] }
type Line = { text: string; symbols: string[] }

const tokens = (m: Line) =>
  `${m.text} ${m.symbols.join(' ')}`
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
    .flatMap((t) => (t.endsWith('s') ? [t, t.slice(0, -1)] : [t]))

/**
 * Deterministic topic matching, no AI call. Walks back from the newest message and returns
 * the shortcut row for the first message that hits a topic's keywords. Ties go to the topic
 * listed first. The core bar and category grid are never touched by this.
 */
export function suggestFor(messages: Line[], lookback = 4): Suggestion | null {
  for (const m of messages.slice(-lookback).reverse()) {
    const toks = new Set(tokens(m))
    let best: { topic: Topic; score: number } | null = null
    for (const topic of TOPICS) {
      const score = topic.keywords.filter((k) => toks.has(k)).length
      if (score > 0 && (!best || score > best.score)) best = { topic, score }
    }
    if (best) {
      const words = best.topic.suggest.map((id) => wordById.get(id)).filter((w): w is Word => !!w)
      return { topic: best.topic, words }
    }
  }
  return null
}
