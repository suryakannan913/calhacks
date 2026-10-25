import { CATEGORIES, CORE_BAR, WORDS, type Word } from './vocabulary'

export type { Word }

export const wordById = new Map(WORDS.map((w) => [w.id, w]))
// Messages store the label ("my turn"); that is also what Claude receives.
export const wordByLabel = new Map(WORDS.map((w) => [w.label.toLowerCase(), w]))
export const coreBarWords = CORE_BAR.map((id) => wordById.get(id)!)
export const wordsInCategory = (categoryId: string) => WORDS.filter((w) => w.category === categoryId)
export const categoryById = new Map(CATEGORIES.map((c) => [c.id, c]))

/** The child's personalised quick-access words (children.symbolSet), in their order, known words only. */
export function favoritesFor(symbolSet: string[]): Word[] {
  const seen = new Set<string>()
  const out: Word[] = []
  for (const label of symbolSet) {
    const w = wordByLabel.get(label.trim().toLowerCase())
    if (w && !seen.has(w.id)) {
      seen.add(w.id)
      out.push(w)
    }
  }
  return out
}
