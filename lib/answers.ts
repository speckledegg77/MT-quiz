export function normaliseAnswer(input: string) {
  let s = String(input ?? "").trim().toLowerCase()

  // Remove punctuation and extra spaces
  s = s.replace(/['’]/g, "") // apostrophes
  s = s.replace(/[^a-z0-9\s]/g, " ") // other punctuation
  s = s.replace(/\s+/g, " ").trim()

  // Remove a leading "the" because people often type it or omit it
  s = s.replace(/^the\s+/, "")

  return s
}

export function isCorrectTypedAnswer(userInput: string, correct: string, accepted?: string[] | null) {
  const u = normaliseAnswer(userInput)
  const c = normaliseAnswer(correct)

  if (!u) return false
  if (u === c) return true

  // Accepted list, if provided
  if (accepted && accepted.length) {
    for (const a of accepted) {
      if (u === normaliseAnswer(a)) return true
    }
  }

  // Small tolerance: allow minor typos using edit distance <= 1 for short answers
  // (good for things like "wicked" vs "wiked")
  const maxDist = u.length <= 6 ? 1 : 0
  if (maxDist > 0 && editDistance(u, c) <= maxDist) return true

  return false
}

function editDistance(a: string, b: string) {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }
  return dp[a.length][b.length]
}
