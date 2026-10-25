// What the kid UI renders. KidView maps Convex message rows into this shape.
export type Person = { name: string; color: string }

export type FeedMessage = {
  id: string
  mine: boolean
  text: string
  /** Vocabulary labels, e.g. "my turn". */
  symbols: string[]
  /** Convex _creationTime (ms). */
  time: number
  /** pending = child confirmed, still being checked and voiced. flagged = stopped by the safety check. */
  state: 'sent' | 'pending' | 'flagged'
}
