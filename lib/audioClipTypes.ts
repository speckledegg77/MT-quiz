export const AUDIO_CLIP_TYPE_VALUES = [
  "song_intro",
  "song_clip",
  "instrumental_section",
  "vocal_section",
  "dialogue_quote",
  "character_voice",
  "sound_effect",
  "other",
] as const

export type AudioClipType = (typeof AUDIO_CLIP_TYPE_VALUES)[number]

export function normaliseAudioClipType(raw: unknown): AudioClipType | null {
  const value = String(raw ?? "").trim().toLowerCase()
  return AUDIO_CLIP_TYPE_VALUES.includes(value as AudioClipType) ? (value as AudioClipType) : null
}
