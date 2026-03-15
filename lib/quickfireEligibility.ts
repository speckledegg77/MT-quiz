export const QUICKFIRE_AUDIO_MAX_DURATION_MS = 5000

export type QuickfireEligibilityLike = {
  answerType?: string | null
  mediaType?: string | null
  mediaDurationMs?: number | null
}

export function normaliseMediaDurationMs(raw: unknown): number | null {
  const parsed = Math.floor(Number(raw))
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

export function getQuickfireIneligibilityReasons(item: QuickfireEligibilityLike) {
  const reasons: string[] = []
  const answerType = String(item.answerType ?? "").trim().toLowerCase()
  const mediaType = String(item.mediaType ?? "").trim().toLowerCase()
  const mediaDurationMs = normaliseMediaDurationMs(item.mediaDurationMs)

  if (answerType !== "mcq") {
    reasons.push("not_mcq")
  }

  if (mediaType === "audio") {
    if (mediaDurationMs === null) {
      reasons.push("audio_missing_duration")
    } else if (mediaDurationMs > QUICKFIRE_AUDIO_MAX_DURATION_MS) {
      reasons.push("audio_too_long")
    }
  }

  return reasons
}

export function isQuickfireEligibleItem(item: QuickfireEligibilityLike) {
  return getQuickfireIneligibilityReasons(item).length === 0
}
