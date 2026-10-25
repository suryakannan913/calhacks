// Each child keeps one color everywhere, so "who is talking" is always visible.
const PALETTE = ['#f5a524', '#4f7cff', '#34c98b', '#f472b6', '#a78bfa', '#fb923c']
const FIXED: Record<string, string> = { maya: PALETTE[0], leo: PALETTE[1] }

export function colorFor(name: string) {
  const key = name.toLowerCase()
  if (FIXED[key]) return FIXED[key]
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]
}
