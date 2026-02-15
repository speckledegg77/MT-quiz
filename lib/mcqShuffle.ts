type ShuffleResult = {
  options: string[]
  answerIndex: number
}

function hashToUint32(input: string) {
  // FNV-1a 32-bit
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle<T>(arr: T[], seedStr: string) {
  const seed = hashToUint32(seedStr)
  const rand = mulberry32(seed)
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

export function shuffleMcqForRoom(options: string[], answerIndex: number, roomId: string, questionId: string): ShuffleResult {
  const safeOptions = Array.isArray(options) ? options.map(String) : []
  const ai = Number(answerIndex)

  if (safeOptions.length < 2 || !Number.isFinite(ai) || ai < 0 || ai >= safeOptions.length) {
    return { options: safeOptions, answerIndex: ai }
  }

  const indices = safeOptions.map((_, i) => i)
  const seedStr = `${roomId}:${questionId}`
  const shuffled = seededShuffle(indices, seedStr)

  const newOptions = shuffled.map(i => safeOptions[i])
  const newAnswerIndex = shuffled.indexOf(ai)

  return { options: newOptions, answerIndex: newAnswerIndex }
}
