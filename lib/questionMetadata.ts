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
  "song_clip",
  "overture_clip",
  "entracte_clip",
  "lyric_excerpt",
  "poster_art",
  "production_photo",
  "cast_headshot",
  "prop_image",
] as const
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

export type ShowRow = {
  show_key: string
  display_name: string
  alt_names: unknown
  is_active?: boolean | null
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

function suggestPromptTarget(question: QuestionRowForMetadata): { value: PromptTarget | null; reason: string | null } {
  const text = cleanLower(question.text)

  if (/\b(song title|name the song|identify the song|what song|which song)\b/.test(text)) {
    return {
      value: "song_title",
      reason: "Suggested because the question asks the player to identify the song.",
    }
  }

  if (
    /\b(which musical|which show|name the show|name the musical|identify the show|identify the musical|what show|what musical)\b/.test(
      text
    )
  ) {
    return {
      value: "show_title",
      reason: "Suggested because the question asks the player to name the show.",
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

  if (/\bcomposer|lyricist|writer|director|choreographer|book writer|book by\b/.test(text)) {
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

  if (/\blyric\b/.test(text)) {
    return {
      value: "lyric_excerpt",
      reason: "Suggested because the clue is based on lyrics.",
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

  if (hasAudio) {
    return {
      value: "song_clip",
      reason: "Suggested because the clue is an audio clip.",
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

function suggestPrimaryShowKey(question: QuestionRowForMetadata, shows: ShowRow[]): { value: string | null; reason: string | null } {
  if (!shows.length) return { value: null, reason: null }

  const answer = cleanForMatch(question.answer_text)
  const explanation = cleanForMatch(question.explanation)
  const questionText = cleanForMatch(question.text)

  for (const show of shows) {
    const candidates = [show.display_name, ...toAltNames(show.alt_names)]
      .map((value) => cleanForMatch(value))
      .filter(Boolean)

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
    const candidates = [show.display_name, ...toAltNames(show.alt_names)]
      .map((value) => cleanForMatch(value))
      .filter(Boolean)

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
    const candidates = [show.display_name, ...toAltNames(show.alt_names)]
      .map((value) => cleanForMatch(value))
      .filter(Boolean)

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

export function analyseQuestionMetadata(question: QuestionRowForMetadata, shows: ShowRow[]): MetadataAnalysis {
  const mediaTypeSuggestion = suggestMediaType(question)
  const promptTargetSuggestion = suggestPromptTarget(question)
  const clueSourceSuggestion = suggestClueSource(question)
  const primaryShowSuggestion = suggestPrimaryShowKey(question, shows)
  const warnings: MetadataWarning[] = []

  const savedMediaType = valueOrNull(question.media_type)
  const effectiveMediaType = savedMediaType ?? mediaTypeSuggestion.value

  if (effectiveMediaType === "audio" && !cleanText(question.audio_path)) {
    addWarning(warnings, "missing_audio_path", "This question looks like audio but has no audio_path.")
  }

  if (effectiveMediaType === "image" && !cleanText(question.image_path)) {
    addWarning(warnings, "missing_image_path", "This question looks like image-based but has no image_path.")
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