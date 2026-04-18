import { AUDIO_CLIP_TYPE_VALUES, type AudioClipType, normaliseAudioClipType } from "@/lib/audioClipTypes"
import {
  QUICKFIRE_AUDIO_MAX_DURATION_MS,
  normaliseMediaDurationMs,
} from "@/lib/quickfireEligibility"

export const MEDIA_TYPE_VALUES = ["text", "audio", "image"] as const
export const PROMPT_TARGET_VALUES = [
  "show_title",
  "song_title",
  "performer_name",
  "character_name",
  "creative_name",
  "fact_value",
] as const
export const CLUE_SOURCE_VALUES = [
  "direct_fact",
  "song_title",
  "song_clip",
  "overture_clip",
  "entracte_clip",
  "lyric_excerpt",
  "poster_art",
  "production_photo",
  "cast_headshot",
  "prop_image",
] as const
export const AUDIO_CLIP_TYPE_VALUES_FOR_METADATA = AUDIO_CLIP_TYPE_VALUES

export const METADATA_REVIEW_STATE_VALUES = [
  "unreviewed",
  "suggested",
  "confirmed",
  "needs_attention",
] as const

export type MediaType = (typeof MEDIA_TYPE_VALUES)[number]
export type PromptTarget = (typeof PROMPT_TARGET_VALUES)[number]
export type ClueSource = (typeof CLUE_SOURCE_VALUES)[number]
export type MetadataReviewState = (typeof METADATA_REVIEW_STATE_VALUES)[number]
export type QuestionAudioClipType = AudioClipType

export type ShowRow = {
  show_key: string
  display_name: string
  alt_names: unknown
  is_active?: boolean | null
}

export type PackRowForMetadata = {
  id: string
  display_name: string
  round_type: string
}

export type QuestionRowForMetadata = {
  id: string
  text: string
  round_type: string
  answer_type: string
  answer_text: string | null
  explanation: string | null
  audio_path: string | null
  image_path: string | null
  accepted_answers: unknown
  media_type?: string | null
  prompt_target?: string | null
  clue_source?: string | null
  primary_show_key?: string | null
  metadata_review_state?: string | null
  media_duration_ms?: number | null
  audio_clip_type?: string | null
  is_active?: boolean | null
}

export type SuggestedMetadata = {
  mediaType: MediaType | null
  promptTarget: PromptTarget | null
  clueSource: ClueSource | null
  primaryShowKey: string | null
}

export type SuggestedMetadataReasons = {
  mediaType: string | null
  promptTarget: string | null
  clueSource: string | null
  primaryShowKey: string | null
}

export type MetadataWarning = {
  code: string
  message: string
}

export type MetadataAnalysis = {
  suggested: SuggestedMetadata
  reasons: SuggestedMetadataReasons
  warnings: MetadataWarning[]
}

function cleanText(value: string | null | undefined) {
  return String(value ?? "").trim()
}

function cleanLower(value: string | null | undefined) {
  return cleanText(value).toLowerCase()
}

function cleanForMatch(value: string | null | undefined) {
  return cleanLower(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function toAltNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
}

export function mapLegacyRoundTypeToMediaType(roundType: string | null | undefined): MediaType | null {
  const value = cleanLower(roundType)
  if (value === "audio") return "audio"
  if (value === "picture") return "image"
  if (value === "general") return "text"
  return null
}

function suggestMediaType(question: QuestionRowForMetadata): { value: MediaType | null; reason: string | null } {
  const legacy = mapLegacyRoundTypeToMediaType(question.round_type)

  if (legacy === "audio" || cleanText(question.audio_path)) {
    return {
      value: "audio",
      reason: cleanText(question.audio_path)
        ? "Suggested because this question has an audio file."
        : "Suggested because the current question_round_type is audio.",
    }
  }

  if (legacy === "image" || cleanText(question.image_path)) {
    return {
      value: "image",
      reason: cleanText(question.image_path)
        ? "Suggested because this question has an image file."
        : "Suggested because the current question_round_type is picture.",
    }
  }

  if (legacy === "text") {
    return {
      value: "text",
      reason: "Suggested because the current question_round_type is general.",
    }
  }

  return { value: null, reason: null }
}

function hasLyricExcerptCue(text: string) {
  return /\b(lyric excerpt|lyric extract|from these lyrics|from the lyrics|these lyrics|includes these lyrics|matches these lyrics)\b/.test(
    text
  )
}

function asksForSongTitle(text: string, refersToLyrics: boolean) {
  if (
    /\b(song title|which song|what song|identify the song|identify this song|identify the track|which track|what track)\b/.test(
      text
    )
  ) {
    return true
  }

  if (/\bwhich musical theatre song title\b/.test(text)) return true
  if (/\btitle matches this (intro|clip)\b/.test(text)) return true
  if (/\bwhich (show tune|number) includes these lyrics\b/.test(text)) return true
  if (/\bname\b[\w\s]{0,40}\b(song|track|number|show tune)\b/.test(text)) return true
  if (/\btype the song\b/.test(text)) return true

  return refersToLyrics && /\b(song|track|number|show tune)\b/.test(text)
}

function asksForShowTitle(text: string, refersToLyrics: boolean) {
  if (
    /\b(which disney film|which film|what film|which musical|which show|name the show|name the musical|identify the show|identify the musical|what show|what musical)\b/.test(
      text
    )
  ) {
    return true
  }

  if (/\btype the musical\b|\btype the show\b/.test(text)) return true
  if (/\b(features|includes) the song\b/.test(text)) return true
  if (/\bname\b[\w\s]{0,40}\b(musical|show|film)\b/.test(text)) return true

  return refersToLyrics && /\b(musical|show|film)\b/.test(text)
}

function asksForCreativeName(text: string) {
  return /\b(who wrote the book and lyrics|who wrote the music and lyrics|who wrote the score|lyrics by which lyricist|music by which composer)\b/.test(
    text
  )
}

function suggestPromptTarget(question: QuestionRowForMetadata): { value: PromptTarget | null; reason: string | null } {
  const text = cleanLower(question.text)
  const refersToLyrics = hasLyricExcerptCue(text)

  if (asksForSongTitle(text, refersToLyrics)) {
    return {
      value: "song_title",
      reason: refersToLyrics
        ? "Suggested because the question asks the player to identify the song from lyric text."
        : "Suggested because the question asks the player to identify the song.",
    }
  }

  if (asksForShowTitle(text, refersToLyrics)) {
    return {
      value: "show_title",
      reason: refersToLyrics
        ? "Suggested because the question asks the player to identify the show from the clue."
        : "Suggested because the question asks the player to identify the show.",
    }
  }

  if (/\b(actor|performer|cast member|star)\b/.test(text)) {
    return {
      value: "performer_name",
      reason: "Suggested because the question asks the player to identify the performer.",
    }
  }

  if (/\bcharacter\b/.test(text)) {
    return {
      value: "character_name",
      reason: "Suggested because the question asks the player to identify the character.",
    }
  }

  if (asksForCreativeName(text) || /\bcomposer|lyricist|writer|director|choreographer|book writer|book by\b/.test(text)) {
    return {
      value: "creative_name",
      reason: "Suggested because the question asks the player to identify a creative.",
    }
  }

  return {
    value: "fact_value",
    reason: "Suggested because the question appears to ask for a general factual answer.",
  }
}

function suggestClueSource(question: QuestionRowForMetadata): { value: ClueSource | null; reason: string | null } {
  const text = cleanLower(question.text)
  const hasAudio = !!cleanText(question.audio_path) || mapLegacyRoundTypeToMediaType(question.round_type) === "audio"
  const hasImage = !!cleanText(question.image_path) || mapLegacyRoundTypeToMediaType(question.round_type) === "image"

  if (hasAudio) {
    if (/\boverture\b/.test(text)) {
      return {
        value: "overture_clip",
        reason: "Suggested because the clue refers to an overture clip.",
      }
    }

    if (/\bentr[’' ]?acte\b|\bentracte\b/.test(text)) {
      return {
        value: "entracte_clip",
        reason: "Suggested because the clue refers to an entr'acte clip.",
      }
    }

    return {
      value: "song_clip",
      reason: "Suggested because the clue is an audio clip.",
    }
  }

  if (hasImage) {
    if (/\bposter\b|\bkey art\b/.test(text)) {
      return {
        value: "poster_art",
        reason: "Suggested because the image clue refers to poster artwork.",
      }
    }

    if (/\bactor\b|\bperformer\b|\bcast member\b|\bheadshot\b|\bstar\b/.test(text)) {
      return {
        value: "cast_headshot",
        reason: "Suggested because the image clue appears to be a performer photo.",
      }
    }

    if (/\bprop\b|\bobject\b|\bitem\b/.test(text)) {
      return {
        value: "prop_image",
        reason: "Suggested because the image clue appears to focus on a prop or object.",
      }
    }

    return {
      value: "production_photo",
      reason: "Suggested because the clue is an image and does not appear to be poster art.",
    }
  }

  if (hasLyricExcerptCue(text)) {
    return {
      value: "lyric_excerpt",
      reason: "Suggested because the clue presents lyric text.",
    }
  }

  if (asksForShowTitle(text, false) && /\bsong\b/.test(text)) {
    return {
      value: "song_title",
      reason: "Suggested because the clue is the title of a song written in the question text.",
    }
  }

  return {
    value: "direct_fact",
    reason: "Suggested because the clue appears in the question wording itself.",
  }
}

function containsCandidate(source: string, candidate: string) {
  if (!source || !candidate) return false
  return source.includes(candidate)
}

function buildShowCandidates(show: ShowRow) {
  return [show.display_name, ...toAltNames(show.alt_names)]
    .map((value) => cleanForMatch(value))
    .filter(Boolean)
}

function suggestPrimaryShowKeyFromText(question: QuestionRowForMetadata, shows: ShowRow[]) {
  const answer = cleanForMatch(question.answer_text)
  const explanation = cleanForMatch(question.explanation)
  const questionText = cleanForMatch(question.text)

  for (const show of shows) {
    const candidates = buildShowCandidates(show)

    for (const candidate of candidates) {
      if (containsCandidate(answer, candidate)) {
        return {
          value: show.show_key,
          reason: "Suggested because the answer text names this show.",
        }
      }
    }
  }

  for (const show of shows) {
    const candidates = buildShowCandidates(show)

    for (const candidate of candidates) {
      if (containsCandidate(explanation, candidate)) {
        return {
          value: show.show_key,
          reason: "Suggested because the explanation names this show.",
        }
      }
    }
  }

  for (const show of shows) {
    const candidates = buildShowCandidates(show)

    for (const candidate of candidates) {
      if (containsCandidate(questionText, candidate)) {
        return {
          value: show.show_key,
          reason: "Suggested because the question text names this show.",
        }
      }
    }
  }

  return { value: null, reason: null }
}

function suggestPrimaryShowKeyFromPacks(
  packs: PackRowForMetadata[],
  shows: ShowRow[]
): { value: string | null; reason: string | null } {
  if (!packs.length || !shows.length) return { value: null, reason: null }

  const matchedShowKeys = new Set<string>()

  for (const pack of packs) {
    const packName = cleanForMatch(pack.display_name)
    if (!packName) continue

    for (const show of shows) {
      const candidates = buildShowCandidates(show)
      for (const candidate of candidates) {
        if (packName === candidate) {
          matchedShowKeys.add(show.show_key)
        }
      }
    }
  }

  if (matchedShowKeys.size === 1) {
    return {
      value: [...matchedShowKeys][0],
      reason: "Suggested because the pack name matches this show.",
    }
  }

  return { value: null, reason: null }
}

function suggestPrimaryShowKey(
  question: QuestionRowForMetadata,
  shows: ShowRow[],
  packs: PackRowForMetadata[]
): { value: string | null; reason: string | null } {
  if (!shows.length) return { value: null, reason: null }

  const textSuggestion = suggestPrimaryShowKeyFromText(question, shows)
  if (textSuggestion.value) return textSuggestion

  const packSuggestion = suggestPrimaryShowKeyFromPacks(packs, shows)
  if (packSuggestion.value) return packSuggestion

  return { value: null, reason: null }
}

function addWarning(warnings: MetadataWarning[], code: string, message: string) {
  warnings.push({ code, message })
}

function isBadMediaPath(path: string | null | undefined) {
  const value = cleanText(path)
  if (!value) return false
  if (value.startsWith("/")) return true
  if (/^https?:\/\//i.test(value)) return true
  if (value.startsWith("audio/") || value.startsWith("images/")) return true
  return false
}

function looksLikeNestedAcceptedAnswers(value: unknown) {
  if (!Array.isArray(value) || value.length !== 1) return false
  const first = String(value[0] ?? "").trim()
  return first.startsWith("[") && first.endsWith("]")
}

function valueOrNull(value: string | null | undefined) {
  const cleaned = cleanText(value)
  return cleaned || null
}

export function analyseQuestionMetadata(
  question: QuestionRowForMetadata,
  shows: ShowRow[],
  packs: PackRowForMetadata[] = []
): MetadataAnalysis {
  const mediaTypeSuggestion = suggestMediaType(question)
  const promptTargetSuggestion = suggestPromptTarget(question)
  const clueSourceSuggestion = suggestClueSource(question)
  const primaryShowSuggestion = suggestPrimaryShowKey(question, shows, packs)
  const warnings: MetadataWarning[] = []

  const savedMediaType = valueOrNull(question.media_type)
  const effectiveMediaType = savedMediaType ?? mediaTypeSuggestion.value
  const mediaDurationMs = normaliseMediaDurationMs(question.media_duration_ms)
  const audioClipType = normaliseAudioClipType(question.audio_clip_type)

  if (effectiveMediaType === "audio" && !cleanText(question.audio_path)) {
    addWarning(warnings, "missing_audio_path", "This question looks like audio but has no audio_path.")
  }

  if (effectiveMediaType === "image" && !cleanText(question.image_path)) {
    addWarning(warnings, "missing_image_path", "This question looks like image-based but has no image_path.")
  }

  if (effectiveMediaType === "audio" && mediaDurationMs === null) {
    addWarning(warnings, "missing_audio_duration", "This audio question needs media_duration_ms before Quickfire can use it safely.")
  }

  if (effectiveMediaType === "audio" && audioClipType === null) {
    addWarning(warnings, "missing_audio_clip_type", "This audio question needs audio_clip_type so you can filter intros, clips, dialogue, and effects reliably.")
  }

  if (effectiveMediaType === "audio" && mediaDurationMs !== null && mediaDurationMs > QUICKFIRE_AUDIO_MAX_DURATION_MS) {
    addWarning(
      warnings,
      "quickfire_audio_too_long",
      `This audio clip is longer than ${QUICKFIRE_AUDIO_MAX_DURATION_MS / 1000} seconds and is not Quickfire-safe.`
    )
  }

  if (effectiveMediaType !== "audio" && mediaDurationMs !== null) {
    addWarning(warnings, "duration_on_non_audio", "media_duration_ms is set, but this question does not currently look audio-based.")
  }

  if (effectiveMediaType !== "audio" && audioClipType !== null) {
    addWarning(warnings, "audio_clip_type_on_non_audio", "audio_clip_type is set, but this question does not currently look audio-based.")
  }

  if (isBadMediaPath(question.audio_path)) {
    addWarning(
      warnings,
      "invalid_audio_path",
      "The audio_path is not bucket-relative. Do not store a leading slash, bucket name, or full URL."
    )
  }

  if (isBadMediaPath(question.image_path)) {
    addWarning(
      warnings,
      "invalid_image_path",
      "The image_path is not bucket-relative. Do not store a leading slash, bucket name, or full URL."
    )
  }

  if (looksLikeNestedAcceptedAnswers(question.accepted_answers)) {
    addWarning(
      warnings,
      "nested_accepted_answers",
      "accepted_answers appears to contain a nested stringified array and should be normalised."
    )
  }

  const savedPromptTarget = valueOrNull(question.prompt_target)
  if (savedPromptTarget && promptTargetSuggestion.value && savedPromptTarget !== promptTargetSuggestion.value) {
    addWarning(
      warnings,
      "prompt_target_mismatch",
      "The saved prompt_target does not match the current wording-based suggestion."
    )
  }

  const savedClueSource = valueOrNull(question.clue_source)
  if (savedClueSource && clueSourceSuggestion.value && savedClueSource !== clueSourceSuggestion.value) {
    addWarning(
      warnings,
      "clue_source_mismatch",
      "The saved clue_source does not match the current wording-based suggestion."
    )
  }

  return {
    suggested: {
      mediaType: mediaTypeSuggestion.value,
      promptTarget: promptTargetSuggestion.value,
      clueSource: clueSourceSuggestion.value,
      primaryShowKey: primaryShowSuggestion.value,
    },
    reasons: {
      mediaType: mediaTypeSuggestion.reason,
      promptTarget: promptTargetSuggestion.reason,
      clueSource: clueSourceSuggestion.reason,
      primaryShowKey: primaryShowSuggestion.reason,
    },
    warnings,
  }
}
