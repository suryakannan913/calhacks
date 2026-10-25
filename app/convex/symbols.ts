import { internalQuery } from "./_generated/server";
import { VOCABULARY } from "./vocabulary";

// A symbol travels as its label ("my turn"): that is what is stored on messages, what
// children.symbolSet holds, and what Claude reads. The id (the slug, "my-turn") is accepted on
// the way in and normalised, so the database only ever holds one spelling per word.
const keyOf = new Map<string, string>();
for (const { id, label } of VOCABULARY) {
  keyOf.set(label.toLowerCase(), label);
  keyOf.set(id, label);
}

/** The canonical label for a vocabulary symbol (label or id, any case), or null if unknown. */
export function canonicalSymbol(input: string): string | null {
  return keyOf.get(input.trim().toLowerCase()) ?? null;
}

/**
 * Resolve what a child may send. Any TapTalk vocabulary word is allowed; children.symbolSet is the
 * personalised quick-access list and may also hold custom words that are not in the vocabulary.
 * Returns the canonical labels, or null if any symbol is not allowed.
 */
export function resolveSymbols(symbols: string[], symbolSet: string[]): string[] | null {
  const out: string[] = [];
  for (const s of symbols) {
    const canonical = canonicalSymbol(s) ?? (symbolSet.includes(s) ? s : null);
    if (canonical === null) return null;
    out.push(canonical);
  }
  return out;
}

// Read-only consistency check for a live deployment:  npx convex run symbols:audit
// Lists symbols stored in messages or in a child's symbolSet that are not canonical vocabulary labels.
export const audit = internalQuery({
  args: {},
  handler: async (ctx) => {
    const messages = await ctx.db.query("messages").collect();
    const children = await ctx.db.query("children").collect();
    const notCanonical = (s: string) => canonicalSymbol(s) !== s;
    return {
      vocabularySize: VOCABULARY.length,
      messagesChecked: messages.length,
      messagesWithOtherSymbols: messages
        .filter((m) => m.symbols.some(notCanonical))
        .map((m) => ({ messageId: m._id, symbols: m.symbols.filter(notCanonical) })),
      childrenWithOtherSymbols: children
        .filter((c) => c.symbolSet.some(notCanonical))
        .map((c) => ({ name: c.name, symbols: c.symbolSet.filter(notCanonical) })),
    };
  },
});
