export function normaliseTextAnswer(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function tokeniseTextAnswer(value: string) {
  const normalised = normaliseTextAnswer(value)
  return normalised ? normalised.split(" ").filter(Boolean) : []
}

export function initialsForAnswer(answerTokens: string[]) {
  const stop = new Set(["the", "a", "an", "and", "of", "to", "in", "for", "on", "at", "with", "from", "by"])
  const kept = answerTokens.filter((token) => token && !stop.has(token))
  return kept.map((token) => token[0]).join("")
}

export function levenshtein(a: string, b: string) {
  const s = a
  const t = b
  const n = s.length
  const m = t.length
  if (n === 0) return m
  if (m === 0) return n

  const dp: number[] = new Array((n + 1) * (m + 1))
  for (let i = 0; i <= n; i++) dp[i * (m + 1)] = i
  for (let j = 0; j <= m; j++) dp[j] = j

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1
      const del = dp[(i - 1) * (m + 1) + j] + 1
      const ins = dp[i * (m + 1) + (j - 1)] + 1
      const sub = dp[(i - 1) * (m + 1) + (j - 1)] + cost
      dp[i * (m + 1) + j] = Math.min(del, ins, sub)
    }
  }

  return dp[n * (m + 1) + m]
}

export function tokenPrefixMatch(inputTokens: string[], answerTokens: string[]) {
  if (inputTokens.length < 2) return false
  if (answerTokens.length < 2) return false

  let answerIndex = 0
  for (const inputToken of inputTokens) {
    if (inputToken.length < 2) continue

    let found = false
    while (answerIndex < answerTokens.length) {
      const answerToken = answerTokens[answerIndex]
      answerIndex += 1
      if (answerToken.startsWith(inputToken)) {
        found = true
        break
      }
    }

    if (!found) return false
  }

  const ratio = inputTokens.length / answerTokens.length
  return ratio >= 0.6 || inputTokens.length >= 3
}

export function stripLeadingTokens(tokens: string[]) {
  let output = [...tokens]
  const dropSingles = new Set(["the", "a", "an"])
  const dropPairs = [
    ["there", "s"],
    ["there", "is"],
    ["it", "s"],
    ["it", "is"],
  ]

  let changed = true
  while (changed) {
    changed = false

    if (output.length >= 2) {
      for (const pair of dropPairs) {
        if (output[0] === pair[0] && output[1] === pair[1]) {
          output = output.slice(2)
          changed = true
          break
        }
      }
      if (changed) continue
    }

    if (output.length >= 1 && dropSingles.has(output[0])) {
      output = output.slice(1)
      changed = true
    }
  }

  return output
}

export function tokenSequenceFuzzyMatch(inputTokens: string[], answerTokens: string[]) {
  if (inputTokens.length < 2 || answerTokens.length < 2) return false
  if (inputTokens.length > answerTokens.length) return false

  const maxOffset = answerTokens.length - inputTokens.length

  for (let offset = 0; offset <= maxOffset; offset += 1) {
    let fuzzyTokens = 0
    let totalEdits = 0
    let matched = true

    for (let i = 0; i < inputTokens.length; i += 1) {
      const inputToken = inputTokens[i]
      const answerToken = answerTokens[offset + i]
      if (inputToken === answerToken) continue
      if (inputToken.length >= 3 && answerToken.startsWith(inputToken)) continue
      if (answerToken.length >= 3 && inputToken.startsWith(answerToken)) continue

      const distance = levenshtein(inputToken, answerToken)
      const maxLength = Math.max(inputToken.length, answerToken.length)
      let maxEdits = 1
      if (maxLength >= 8) maxEdits = 2
      if (maxLength >= 12) maxEdits = 3

      if (distance > maxEdits) {
        matched = false
        break
      }

      fuzzyTokens += 1
      totalEdits += distance
      if (fuzzyTokens > 1 || totalEdits > 2) {
        matched = false
        break
      }
    }

    if (matched) return true
  }

  return false
}

export function candidateNormalisedVariants(candidate: string) {
  const baseTokens = tokeniseTextAnswer(candidate)
  const variants = new Set<string>()
  if (baseTokens.length) variants.add(baseTokens.join(" "))

  const strippedTokens = stripLeadingTokens(baseTokens)
  if (strippedTokens.length >= 2) variants.add(strippedTokens.join(" "))

  return Array.from(variants)
}

export function isTextCorrect(input: string, answer: string, accepted?: string[]) {
  const inputNormalised = normaliseTextAnswer(input)
  if (!inputNormalised) return false

  const candidates = [answer, ...(accepted ?? [])].map((value) => String(value ?? "")).filter(Boolean)
  if (candidates.length === 0) return false

  const candidateNormalised = candidates.flatMap(candidateNormalisedVariants).filter(Boolean)
  if (candidateNormalised.includes(inputNormalised)) return true

  const compactInput = inputNormalised.replace(/\s+/g, "")
  if (/^[a-z0-9]{2,6}$/.test(compactInput)) {
    const answerTokens = tokeniseTextAnswer(answer)
    const initials = initialsForAnswer(answerTokens)
    if (initials && compactInput === initials) return true
  }

  const inputTokens = tokeniseTextAnswer(inputNormalised)
  const strippedInputTokens = stripLeadingTokens(inputTokens)

  for (const candidate of candidates) {
    const answerTokens = tokeniseTextAnswer(candidate)
    const strippedAnswerTokens = stripLeadingTokens(answerTokens)

    if (tokenPrefixMatch(inputTokens, answerTokens)) return true
    if (strippedInputTokens.length >= 2 && tokenPrefixMatch(strippedInputTokens, strippedAnswerTokens)) return true
    if (strippedInputTokens.length >= 2 && tokenSequenceFuzzyMatch(strippedInputTokens, strippedAnswerTokens)) return true
    if (tokenSequenceFuzzyMatch(inputTokens, answerTokens)) return true
  }

  for (const candidate of candidateNormalised) {
    const maxLength = Math.max(inputNormalised.length, candidate.length)
    if (maxLength <= 4) continue

    const distance = levenshtein(inputNormalised, candidate)

    let maxEdits = 1
    if (maxLength >= 8) maxEdits = 2
    if (maxLength >= 13) maxEdits = 3
    if (maxLength >= 19) maxEdits = 4

    const similarity = 1 - distance / maxLength
    if (distance <= maxEdits && similarity >= 0.82) return true
  }

  return false
}
