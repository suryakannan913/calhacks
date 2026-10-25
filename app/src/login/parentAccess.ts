const SESSION_KEY = 'taptalk.parentSession'

export function parentIsUnlocked(slug: string) {
  try { return sessionStorage.getItem(SESSION_KEY) === slug.toLowerCase() }
  catch { return false }
}
export function lockParent() {
  try { sessionStorage.removeItem(SESSION_KEY) } catch { /* Already locked. */ }
  window.location.assign('/')
}

// Demo-only shared password: not authentication for Convex functions.
export function unlockParent(slug: string, password: string) {
  if (password !== 'Parent') return false
  sessionStorage.setItem(SESSION_KEY, slug.toLowerCase())
  return true
}
