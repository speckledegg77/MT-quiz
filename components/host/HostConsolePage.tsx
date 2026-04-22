"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import QRTile from "@/components/ui/QRTile"

import { supabase } from "@/lib/supabaseClient"
import { randomTeamName } from "@/lib/teamNameSuggestions"
import { normaliseDefaultPackIds, normaliseSelectionRules, type RoundTemplateRow } from "@/lib/roundTemplates"
import { getDefaultAnswerSecondsForBehaviour, getDefaultRoundReviewSecondsForBehaviour } from "@/lib/roomRoundPlan"
import { getRoomStagePillLabel, getRunModeSummaryLabel } from "@/lib/gameMode"
import { countDistinctRoundTemplateFamilies, getRoundTemplateFamilyKey } from "@/lib/roundTemplateFamilies"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import HostJoinedTeamsPanel from "@/components/HostJoinedTeamsPanel"
import SelectControl from "@/components/host/SelectControl"
import SimpleSetup from "@/components/host/simple/SimpleSetup"
import AdvancedSetup from "@/components/host/advanced/AdvancedSetup"
import ResumeHostingCard from "@/components/host/sidebar/ResumeHostingCard"
import HostLiveControls from "@/components/host/live/HostLiveControls"
import PageShell from "@/components/PageShell"

type PackRow = {
  id: string
  display_name: string
  round_type: string
  sort_order: number | null
  is_active: boolean | null
}

type HeadsUpPackRow = {
  id: string
  name: string
  description: string
  is_active: boolean | null
}

type ShowRow = {
  show_key: string
  display_name: string
  is_active: boolean | null
}

type SelectionStrategy = "all_packs" | "per_pack"
type RoundFilter =
  | "mixed"
  | "no_audio"
  | "no_image"
  | "audio_only"
  | "picture_only"
  | "audio_and_image"

type AudioMode = "display" | "phones" | "both"
type GameMode = "teams" | "solo"
type BuildMode = "manual_rounds" | "quick_random" | "legacy_pack_mode" | "infinite"
type SetupMode = "simple" | "advanced"
type SimpleGameType = "recommended" | "infinite" | "spotlight"
type SimplePresetId = "classic" | "balanced" | "quickfire_mix"
type RoundBehaviourType = "standard" | "quickfire" | "spotlight"
type RoundSourceMode = "selected_packs" | "specific_packs" | "all_questions"
type RoomState = any

type RoundTemplatesResponse = {
  ok?: boolean
  templates?: RoundTemplateRow[]
}

type FeasibilityExplanation = {
  tone: "ok" | "warning" | "error"
  summary: string
  detail: string | null
  fallback: string | null
}

type FeasibilityRoundResult = {
  id: string
  name: string
  requestedCount: number
  eligibleCount: number
  assignedCount: number
  shortfall: number
  feasible: boolean
  setupError: string | null
  behaviourType: RoundBehaviourType
  sourceMode: RoundSourceMode
  notes: string[]
  explanation: FeasibilityExplanation
}

type FeasibilitySetResult = {
  rounds: FeasibilityRoundResult[]
  summary: {
    requestedTotal: number
    unionEligibleQuestionCount: number
    assignedTotal: number
    shortfallTotal: number
    allFeasible: boolean
    explanation: FeasibilityExplanation
  }
}

type FeasibilityResponse = {
  ok?: boolean
  candidateCount?: number
  scopePackCount?: number
  manual?: FeasibilitySetResult | null
  templates?: FeasibilitySetResult | null
  error?: string
}

type ManualRoundDraft = {
  id: string
  name: string
  questionCountStr: string
  behaviourType: RoundBehaviourType
  jokerEligible: boolean
  countsTowardsScore: boolean
  sourceMode: RoundSourceMode
  packIds: string[]
  mediaTypes: Array<"text" | "audio" | "image">
  answerTypes: Array<"mcq" | "text">
  promptTargets: string[]
  clueSources: string[]
  primaryShowKeys: string[]
  audioClipTypes: string[]
  headsUpDifficulty: "" | "easy" | "medium" | "hard"
  headsUpTvDisplayMode: "show_clue" | "timer_only"
  headsUpTurnSeconds: 60 | 90
  useTimingOverride: boolean
  answerSecondsStr: string
  roundReviewSecondsStr: string
}

const LAST_HOST_CODE_KEY = "mtq_last_host_code"

const PROMPT_TARGET_OPTIONS = [
  { value: "", label: "Any prompt target" },
  { value: "show_title", label: "show_title" },
  { value: "song_title", label: "song_title" },
  { value: "performer_name", label: "performer_name" },
  { value: "character_name", label: "character_name" },
  { value: "creative_name", label: "creative_name" },
  { value: "fact_value", label: "fact_value" },
]

const ROUND_BEHAVIOUR_OPTIONS: Array<{ value: RoundBehaviourType; label: string }> = [
  { value: "standard", label: "Standard" },
  { value: "quickfire", label: "Quickfire" },
  { value: "spotlight", label: "Spotlight" },
]

const AUDIO_CLIP_TYPE_OPTIONS = [
  { value: "", label: "Any audio clip type" },
  { value: "song_intro", label: "song_intro" },
  { value: "song_clip", label: "song_clip" },
  { value: "instrumental_section", label: "instrumental_section" },
  { value: "vocal_section", label: "vocal_section" },
  { value: "dialogue_quote", label: "dialogue_quote" },
  { value: "character_voice", label: "character_voice" },
  { value: "sound_effect", label: "sound_effect" },
  { value: "other", label: "other" },
]


const HEADS_UP_TV_DISPLAY_OPTIONS = [
  { value: "timer_only", label: "Timer only on TV" },
  { value: "show_clue", label: "Show clue on TV" },
]

const HEADS_UP_TURN_OPTIONS = [
  { value: 60, label: "60 seconds" },
  { value: 90, label: "90 seconds" },
]

const HEADS_UP_DIFFICULTY_OPTIONS = [
  { value: "", label: "Any difficulty" },
  { value: "easy", label: "easy" },
  { value: "medium", label: "medium" },
  { value: "hard", label: "hard" },
]

const CLUE_SOURCE_OPTIONS = [
  { value: "", label: "Any clue source" },
  { value: "direct_fact", label: "direct_fact" },
  { value: "song_title", label: "song_title" },
  { value: "song_clip", label: "song_clip" },
  { value: "overture_clip", label: "overture_clip" },
  { value: "entracte_clip", label: "entracte_clip" },
  { value: "lyric_excerpt", label: "lyric_excerpt" },
  { value: "poster_art", label: "poster_art" },
  { value: "production_photo", label: "production_photo" },
  { value: "cast_headshot", label: "cast_headshot" },
  { value: "prop_image", label: "prop_image" },
]

const SIMPLE_PRESET_OPTIONS: Array<{
  value: SimplePresetId
  label: string
  description: string
}> = [
  {
    value: "classic",
    label: "Classic quiz",
    description: "Keeps the game in the standard question flow when possible.",
  },
  {
    value: "balanced",
    label: "Balanced mix",
    description: "Mostly standard rounds, with a little Quickfire when ready templates support it.",
  },
  {
    value: "quickfire_mix",
    label: "Fast mix",
    description: "Brings in more Quickfire rounds while keeping at least one standard round when possible.",
  },
]

function audioModeLabel(mode: AudioMode) {
  if (mode === "phones") return "phone"
  if (mode === "both") return "TV and phone"
  return "TV"
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function parseIntOr(value: string, fallback: number) {
  const v = value.trim()
  if (v === "") return fallback
  const n = Number(v)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

function cleanRoomCode(input: string) {
  return String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12)
}

function defaultRoundName(i: number) {
  return `Round ${i + 1}`
}

function makeRoundId() {
  return `round_${Math.random().toString(36).slice(2, 10)}`
}

function cleanManualStringArray(values: string[] | undefined | null) {
  return [...new Set((values ?? []).map((value) => String(value ?? "").trim()).filter(Boolean))]
}

function cleanManualMediaTypes(values: Array<"text" | "audio" | "image"> | string[] | undefined | null) {
  return cleanManualStringArray(values).filter(
    (value): value is "text" | "audio" | "image" => value === "text" || value === "audio" || value === "image"
  )
}

function cleanManualAnswerTypes(values: Array<"mcq" | "text"> | string[] | undefined | null) {
  return cleanManualStringArray(values).filter(
    (value): value is "mcq" | "text" => value === "mcq" || value === "text"
  )
}

function describeTokenSelection(values: string[], singularLabel: string) {
  if (!values.length) return ""
  if (values.length <= 2) return values.map(formatMetadataToken).join(" + ")
  return `${values.length} ${singularLabel}${values.length === 1 ? "" : "s"}`
}

function describeShowSelection(showKeys: string[], showNameByKey: Map<string, string>) {
  if (!showKeys.length) return ""
  if (showKeys.length === 1) return showNameByKey.get(showKeys[0]) ?? showKeys[0]
  return `${showKeys.length} shows`
}

function normaliseManualRoundDraft(draft: ManualRoundDraft): ManualRoundDraft {
  const behaviourType: RoundBehaviourType =
    draft.behaviourType === "quickfire" ? "quickfire" : draft.behaviourType === "spotlight" ? "spotlight" : "standard"
  const mediaTypes: ManualRoundDraft["mediaTypes"] = behaviourType === "spotlight" ? [] : cleanManualMediaTypes(draft.mediaTypes)
  const answerTypes: ManualRoundDraft["answerTypes"] = behaviourType === "spotlight"
    ? []
    : behaviourType === "quickfire"
      ? ["mcq"]
      : cleanManualAnswerTypes(draft.answerTypes)
  const promptTargets = behaviourType === "spotlight" ? [] : cleanManualStringArray(draft.promptTargets)
  const clueSources = behaviourType === "spotlight" ? [] : cleanManualStringArray(draft.clueSources)
  const primaryShowKeys = cleanManualStringArray(draft.primaryShowKeys)
  const audioClipTypes = behaviourType === "spotlight" || !mediaTypes.includes("audio") ? [] : cleanManualStringArray(draft.audioClipTypes)

  return {
    ...draft,
    behaviourType,
    jokerEligible: behaviourType === "quickfire" || behaviourType === "spotlight" ? false : draft.jokerEligible,
    countsTowardsScore: behaviourType === "spotlight" ? false : draft.countsTowardsScore,
    sourceMode:
      behaviourType === "spotlight"
        ? "specific_packs"
        : draft.sourceMode === "all_questions"
          ? "all_questions"
          : "specific_packs",
    mediaTypes,
    answerTypes,
    promptTargets,
    clueSources,
    primaryShowKeys,
    audioClipTypes,
    headsUpTvDisplayMode: behaviourType === "spotlight" ? draft.headsUpTvDisplayMode : "timer_only",
    headsUpTurnSeconds: behaviourType === "spotlight" ? draft.headsUpTurnSeconds : 60,
  }
}

function makeManualRound(index: number): ManualRoundDraft {
  return normaliseManualRoundDraft({
    id: makeRoundId(),
    name: defaultRoundName(index),
    questionCountStr: "5",
    behaviourType: "standard",
    jokerEligible: true,
    countsTowardsScore: true,
    sourceMode: "specific_packs",
    packIds: [],
    mediaTypes: [],
    answerTypes: [],
    promptTargets: [],
    clueSources: [],
    primaryShowKeys: [],
    audioClipTypes: [],
    headsUpDifficulty: "",
    headsUpTvDisplayMode: "timer_only",
    headsUpTurnSeconds: 60,
    useTimingOverride: false,
    answerSecondsStr: "",
    roundReviewSecondsStr: "",
  })
}


function formatMetadataToken(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function describeManualRoundPackSummary(round: ManualRoundDraft, packNameById: Map<string, string>) {
  if (round.behaviourType === "spotlight") return "1 Spotlight pack"
  if (round.sourceMode === "all_questions") return "All active packs"
  if (round.packIds.length === 0) return "No packs chosen"
  if (round.packIds.length === 1) return packNameById.get(round.packIds[0]) ?? "1 pack selected"
  if (round.packIds.length === 2) {
    return round.packIds.map((packId) => packNameById.get(packId) ?? "Unknown pack").join(" and ")
  }
  return `${round.packIds.length} packs selected`
}

function buildManualRoundFilterSummary(round: ManualRoundDraft, showNameByKey: Map<string, string>) {
  if (round.behaviourType === "spotlight") {
    const parts: string[] = []
    if (round.headsUpDifficulty) parts.push(`Difficulty: ${formatMetadataToken(round.headsUpDifficulty)}`)
    if (round.primaryShowKeys.length) parts.push(`Show: ${describeShowSelection(round.primaryShowKeys, showNameByKey)}`)
    return parts
  }

  const parts: string[] = []
  const mediaSummary = describeTokenSelection(round.mediaTypes, "media type")
  const answerSummary = round.answerTypes.length ? round.answerTypes.map((value) => value.toUpperCase()).join(" + ") : ""
  const promptSummary = describeTokenSelection(round.promptTargets, "prompt target")
  const clueSummary = describeTokenSelection(round.clueSources, "clue source")
  const showSummary = describeShowSelection(round.primaryShowKeys, showNameByKey)
  const audioClipSummary = describeTokenSelection(round.audioClipTypes, "audio clip type")

  if (mediaSummary) parts.push(`Media: ${mediaSummary}`)
  if (answerSummary) parts.push(`Answer: ${answerSummary}`)
  if (promptSummary) parts.push(`Prompt: ${promptSummary}`)
  if (clueSummary) parts.push(`Clue: ${clueSummary}`)
  if (showSummary) parts.push(`Show: ${showSummary}`)
  if (audioClipSummary) parts.push(`Audio clip: ${audioClipSummary}`)
  return parts
}
function buildSelectionRulesFromDraft(round: ManualRoundDraft) {
  return {
    mediaTypes: round.mediaTypes,
    answerTypes: round.answerTypes,
    promptTargets: round.promptTargets,
    clueSources: round.clueSources,
    primaryShowKeys: round.primaryShowKeys,
    audioClipTypes: round.audioClipTypes,
    headsUpDifficulties: round.behaviourType === "spotlight" && round.headsUpDifficulty ? [round.headsUpDifficulty] : [],
  }
}

function serialiseManualRoundDraft(round: ManualRoundDraft, index: number) {
  return {
    id: round.id,
    name: round.name.trim() || defaultRoundName(index),
    questionCount: round.behaviourType === "spotlight" ? 0 : clampInt(parseIntOr(round.questionCountStr, 0), 1, 200),
    behaviourType: round.behaviourType,
    jokerEligible: round.behaviourType === "quickfire" || round.behaviourType === "spotlight" ? false : round.jokerEligible,
    countsTowardsScore: round.behaviourType === "spotlight" ? false : round.countsTowardsScore,
    sourceMode: round.sourceMode,
    packIds: round.packIds,
    selectionRules: buildSelectionRulesFromDraft(round),
    answerSeconds: round.behaviourType === "spotlight" ? round.headsUpTurnSeconds : getManualRoundAnswerSeconds(round),
    roundReviewSeconds: round.behaviourType === "spotlight" ? getManualRoundReviewSeconds(round) : getManualRoundReviewSeconds(round),
    headsUpTvDisplayMode: round.behaviourType === "spotlight" ? round.headsUpTvDisplayMode : undefined,
  }
}

function normaliseTemplateTiming(raw: unknown, fallback: number) {
  const value = Math.floor(Number(raw ?? fallback))
  if (!Number.isFinite(value) || value < 0) return fallback
  return clampInt(value, 0, 120)
}

function serialiseTemplateAsRound(template: RoundTemplateRow, index: number) {
  const selectionRules = normaliseSelectionRules(template.selection_rules)
  const defaultPackIds = normaliseDefaultPackIds(template.default_pack_ids)
  const behaviourType: RoundBehaviourType = String(template.behaviour_type ?? "standard") === "quickfire" ? "quickfire" : String(template.behaviour_type ?? "standard") === "spotlight" ? "spotlight" : "standard"
  const sourceMode: RoundSourceMode =
    String(template.source_mode ?? "selected_packs") === "specific_packs"
      ? "specific_packs"
      : String(template.source_mode ?? "selected_packs") === "all_questions"
        ? "all_questions"
        : "selected_packs"

  return {
    id: String(template.id ?? `template_${index + 1}`),
    name: String(template.name ?? "").trim() || defaultRoundName(index),
    questionCount: Math.max(1, Number(template.default_question_count ?? 5) || 5),
    behaviourType,
    jokerEligible: behaviourType === "quickfire" || behaviourType === "spotlight" ? false : Boolean(template.joker_eligible ?? true),
    countsTowardsScore: behaviourType === "spotlight" ? false : Boolean(template.counts_towards_score ?? true),
    sourceMode,
    packIds: sourceMode === "specific_packs" ? defaultPackIds : [],
    selectionRules: {
      mediaTypes: selectionRules.mediaTypes ?? [],
      answerTypes: selectionRules.answerTypes ?? [],
      promptTargets: selectionRules.promptTargets ?? [],
      clueSources: selectionRules.clueSources ?? [],
      primaryShowKeys: selectionRules.primaryShowKeys ?? [],
      audioClipTypes: selectionRules.audioClipTypes ?? [],
    },
    answerSeconds: normaliseTemplateTiming(
      template.default_answer_seconds,
      getDefaultAnswerSecondsForBehaviour(behaviourType)
    ),
    roundReviewSeconds: normaliseTemplateTiming(
      template.default_round_review_seconds,
      getDefaultRoundReviewSecondsForBehaviour(behaviourType)
    ),
  }
}

function getSimplePresetQuickfireTarget(preset: SimplePresetId, roundCount: number) {
  if (preset === "classic") return 0
  if (preset === "balanced") {
    if (roundCount >= 5) return 2
    if (roundCount >= 3) return 1
    return 0
  }
  if (roundCount <= 1) return 0
  return Math.min(roundCount - 1, Math.max(1, Math.floor(roundCount / 2)))
}

function shuffleTemplates<T>(items: T[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const current = copy[i]
    copy[i] = copy[j]
    copy[j] = current
  }
  return copy
}

function takeNextTemplateByFamily(pool: RoundTemplateRow[], usedFamilies: Set<string>) {
  for (let index = 0; index < pool.length; index += 1) {
    const template = pool[index]
    const familyKey = getRoundTemplateFamilyKey(template)
    if (usedFamilies.has(familyKey)) continue
    usedFamilies.add(familyKey)
    pool.splice(index, 1)
    return template
  }
  return null
}

function chooseSimplePlanTemplates(params: {
  preset: SimplePresetId
  standardTemplates: RoundTemplateRow[]
  quickfireTemplates: RoundTemplateRow[]
  roundCount: number
}) {
  const standardTemplates = shuffleTemplates(params.standardTemplates)
  const quickfireTemplates = shuffleTemplates(params.quickfireTemplates)
  const ordered: RoundTemplateRow[] = []
  const usedFamilies = new Set<string>()

  const pushStandard = () => {
    const next = takeNextTemplateByFamily(standardTemplates, usedFamilies)
    if (next) ordered.push(next)
  }

  const pushQuickfire = () => {
    const next = takeNextTemplateByFamily(quickfireTemplates, usedFamilies)
    if (next) ordered.push(next)
  }

  if (params.preset === "quickfire_mix") {
    if (ordered.length < params.roundCount) pushStandard()
    while (ordered.length < params.roundCount) {
      const before = ordered.length
      if (ordered.length < params.roundCount) pushQuickfire()
      if (ordered.length < params.roundCount) pushStandard()
      if (ordered.length === before) break
    }
    return ordered
  }

  if (params.preset === "balanced") {
    while (ordered.length < params.roundCount) {
      const before = ordered.length
      if (ordered.length < params.roundCount) pushStandard()
      if (ordered.length < params.roundCount) pushStandard()
      if (ordered.length < params.roundCount) pushQuickfire()
      if (ordered.length === before) break
    }
    return ordered
  }

  while (ordered.length < params.roundCount) {
    const before = ordered.length
    pushStandard()
    if (ordered.length < params.roundCount) pushQuickfire()
    if (ordered.length === before) break
  }

  return ordered
}

function buildSimpleTemplatePlan(params: {
  templates: RoundTemplateRow[]
  feasibilityById: Map<string, FeasibilityRoundResult>
  roundCount: number
  preset: SimplePresetId
}) {
  const roundCount = clampInt(params.roundCount, 1, 20)
  const feasibleTemplates = params.templates.filter((template) => params.feasibilityById.get(template.id)?.feasible)
  const standardTemplates = feasibleTemplates.filter((template) => template.behaviour_type !== "quickfire")
  const quickfireTemplates = feasibleTemplates.filter((template) => template.behaviour_type === "quickfire")

  const availableTemplateCount = countDistinctRoundTemplateFamilies(feasibleTemplates)
  const availableStandardCount = countDistinctRoundTemplateFamilies(standardTemplates)
  const availableQuickfireCount = countDistinctRoundTemplateFamilies(quickfireTemplates)

  if (availableTemplateCount === 0) {
    return {
      rounds: [],
      notes: [],
      error: "No ready round templates match the current pack choice.",
      availableTemplateCount,
      availableStandardCount,
      availableQuickfireCount,
      standardCount: 0,
      quickfireCount: 0,
      jokerEligibleCount: 0,
    }
  }

  if (availableTemplateCount < roundCount) {
    return {
      rounds: [],
      notes: [],
      error: `Only ${availableTemplateCount} ready template famil${availableTemplateCount === 1 ? "y is" : "ies are"} available for ${roundCount} rounds.`,
      availableTemplateCount,
      availableStandardCount,
      availableQuickfireCount,
      standardCount: 0,
      quickfireCount: 0,
      jokerEligibleCount: 0,
    }
  }

  const desiredQuickfireCount = getSimplePresetQuickfireTarget(params.preset, roundCount)
  const desiredStandardCount = roundCount - desiredQuickfireCount
  const notes: string[] = []

  if (desiredQuickfireCount > 0 && availableQuickfireCount === 0) {
    notes.push("No ready Quickfire template families were found for this pack choice, so this game falls back to standard rounds.")
  } else if (availableQuickfireCount < desiredQuickfireCount) {
    notes.push(`Only ${availableQuickfireCount} ready Quickfire template famil${availableQuickfireCount === 1 ? "y was" : "ies were"} available, so the game uses fewer Quickfire rounds than the preset prefers.`)
  }

  if (availableStandardCount < desiredStandardCount) {
    notes.push(`Only ${availableStandardCount} ready standard template famil${availableStandardCount === 1 ? "y was" : "ies were"} available, so extra Quickfire rounds were used to fill the plan.`)
  }

  const orderedTemplates = chooseSimplePlanTemplates({
    preset: params.preset,
    standardTemplates,
    quickfireTemplates,
    roundCount,
  }).slice(0, roundCount)

  if (orderedTemplates.length < roundCount) {
    return {
      rounds: [],
      notes,
      error: "The current ready templates cannot fill that game plan without repeating the same round family.",
      availableTemplateCount,
      availableStandardCount,
      availableQuickfireCount,
      standardCount: 0,
      quickfireCount: 0,
      jokerEligibleCount: 0,
    }
  }

  const rounds = orderedTemplates.map((template, index) => serialiseTemplateAsRound(template, index))
  const quickfireCount = rounds.filter((round) => round.behaviourType === "quickfire").length
  const standardCount = rounds.filter((round) => round.behaviourType !== "quickfire").length
  const jokerEligibleCount = rounds.filter((round) => round.jokerEligible).length

  return {
    rounds,
    notes,
    error: null,
    availableTemplateCount,
    availableStandardCount,
    availableQuickfireCount,
    standardCount,
    quickfireCount,
    jokerEligibleCount,
  }
}

function feasibilityTone(result: FeasibilityRoundResult) {
  return result.explanation?.tone ?? (result.setupError || result.shortfall > 0 ? "error" : "ok")
}

function roundBehaviourLabel(behaviourType: RoundBehaviourType) {
  return behaviourType === "quickfire" ? "Quickfire" : behaviourType === "spotlight" ? "Spotlight" : "Standard"
}

function roundBehaviourBadgeClass(behaviourType: RoundBehaviourType) {
  return behaviourType === "quickfire"
    ? "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-600/10 dark:text-violet-200"
    : behaviourType === "spotlight"
      ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-600/10 dark:text-amber-200"
      : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-600/10 dark:text-emerald-200"
}

function roundBehaviourSummary(behaviourType: RoundBehaviourType) {
  if (behaviourType === "quickfire") {
    return "Fast answers, no Joker, no reveal after each question, and the fastest correct player gets a bonus point. Quickfire audio is allowed when the clip is 7 seconds or shorter, but the clip should still start on recognisable material."
  }
  if (behaviourType === "spotlight") {
    return "Timed turn-based clueing. The guesser scores one point for each correct card, and the host can review mistakes before the turn is locked."
  }

  return "Classic question flow with the normal reveal after each question. Joker can be enabled if you want it."
}

function roundBehaviourTimingText(behaviourType: RoundBehaviourType) {
  return behaviourType === "spotlight"
    ? "60s or 90s turn, plus round review"
    : `${getDefaultAnswerSecondsForBehaviour(behaviourType)}s answer window, ${getDefaultRoundReviewSecondsForBehaviour(behaviourType)}s round review`
}

function getManualRoundAnswerSeconds(round: ManualRoundDraft) {
  if (round.behaviourType === "spotlight") return round.headsUpTurnSeconds
  if (!round.useTimingOverride) return getDefaultAnswerSecondsForBehaviour(round.behaviourType)
  return clampInt(parseIntOr(round.answerSecondsStr, getDefaultAnswerSecondsForBehaviour(round.behaviourType)), 0, 120)
}

function getManualRoundReviewSeconds(round: ManualRoundDraft) {
  if (!round.useTimingOverride) return getDefaultRoundReviewSecondsForBehaviour(round.behaviourType)
  return clampInt(parseIntOr(round.roundReviewSecondsStr, getDefaultRoundReviewSecondsForBehaviour(round.behaviourType)), 0, 120)
}

function getManualRoundTimingSummary(round: ManualRoundDraft) {
  const answerSeconds = getManualRoundAnswerSeconds(round)
  const roundReviewSeconds = getManualRoundReviewSeconds(round)
  return round.behaviourType === "spotlight"
    ? `${answerSeconds}s turn, ${roundReviewSeconds}s round review`
    : `${answerSeconds}s answer window, ${roundReviewSeconds}s round review`
}

export default function HostConsolePage({ initialRoomCode = null }: { initialRoomCode?: string | null }) {
  const [packs, setPacks] = useState<PackRow[]>([])
  const [headsUpPacks, setHeadsUpPacks] = useState<HeadsUpPackRow[]>([])
  const [shows, setShows] = useState<ShowRow[]>([])
  const [templates, setTemplates] = useState<RoundTemplateRow[]>([])
  const [packsLoading, setPacksLoading] = useState(true)
  const [packsError, setPacksError] = useState<string | null>(null)

  const [setupMode, setSetupMode] = useState<SetupMode>("simple")
  const [advancedUnlocked, setAdvancedUnlocked] = useState(false)
  const [simpleGameType, setSimpleGameType] = useState<SimpleGameType>("recommended")
  const [simpleHeadsUpPackId, setSimpleHeadsUpPackId] = useState("")
  const [simplePreset, setSimplePreset] = useState<SimplePresetId>("balanced")
  const [buildMode, setBuildMode] = useState<BuildMode>("manual_rounds")
  const [selectPacks, setSelectPacks] = useState(false)
  const [selectedPacks, setSelectedPacks] = useState<Record<string, boolean>>({})
  const [packPickerRoundId, setPackPickerRoundId] = useState<string | null>(null)
  const [packPickerSearch, setPackPickerSearch] = useState("")
  const [selectionStrategy, setSelectionStrategy] = useState<SelectionStrategy>("all_packs")
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("mixed")
  const [audioMode, setAudioMode] = useState<AudioMode>("display")

  const [totalQuestionsStr, setTotalQuestionsStr] = useState("20")
  const [answerSecondsStr, setAnswerSecondsStr] = useState("20")
  const [roundReviewSecondsStr, setRoundReviewSecondsStr] = useState("30")
  const [untimedAnswers, setUntimedAnswers] = useState(false)

  const [roundCountStr, setRoundCountStr] = useState("4")
  const [roundNames, setRoundNames] = useState<string[]>(["Round 1", "Round 2", "Round 3", "Round 4"])

  const [manualRounds, setManualRounds] = useState<ManualRoundDraft[]>([
    makeManualRound(0),
    makeManualRound(1),
    makeManualRound(2),
    makeManualRound(3),
  ])
  const [templateToAddId, setTemplateToAddId] = useState("")
  const [quickRandomUseTemplates, setQuickRandomUseTemplates] = useState(true)
  const [quickRandomTemplateIds, setQuickRandomTemplateIds] = useState<string[]>([])

  const [roundTemplateSelections, setRoundTemplateSelections] = useState<Record<string, string>>({})

  const [gameMode, setGameMode] = useState<GameMode>("solo")
  const [teamNames, setTeamNames] = useState<string[]>(() => {
    const first = randomTeamName()
    const second = randomTeamName([first])
    return [first, second]
  })

  const [perPackCounts, setPerPackCounts] = useState<Record<string, string>>({})

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [feasibilityBusy, setFeasibilityBusy] = useState(false)
  const [feasibilityError, setFeasibilityError] = useState<string | null>(null)
  const [manualFeasibility, setManualFeasibility] = useState<FeasibilitySetResult | null>(null)
  const [templateFeasibility, setTemplateFeasibility] = useState<FeasibilitySetResult | null>(null)
  const [simpleFeasibilityBusy, setSimpleFeasibilityBusy] = useState(false)
  const [simpleFeasibilityError, setSimpleFeasibilityError] = useState<string | null>(null)
  const [simpleTemplateFeasibility, setSimpleTemplateFeasibility] = useState<FeasibilitySetResult | null>(null)
  const [simpleCandidateCount, setSimpleCandidateCount] = useState(0)
  const [simpleInfiniteQuestionLimitStr, setSimpleInfiniteQuestionLimitStr] = useState("")
  const [advancedInfiniteQuestionLimitStr, setAdvancedInfiniteQuestionLimitStr] = useState("")
  const [showSimpleGameSummary, setShowSimpleGameSummary] = useState(false)
  const [showSimpleRecommendedRounds, setShowSimpleRecommendedRounds] = useState(false)

  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [roomPhase, setRoomPhase] = useState("lobby")
  const [roomStage, setRoomStage] = useState("lobby")

  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [startOk, setStartOk] = useState<string | null>(null)

  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetOk, setResetOk] = useState<string | null>(null)

  const [forcingClose, setForcingClose] = useState(false)
  const [forceCloseError, setForceCloseError] = useState<string | null>(null)
  const [endingGame, setEndingGame] = useState(false)

  const [rehostCode, setRehostCode] = useState("")
  const [rehostBusy, setRehostBusy] = useState(false)
  const [rehostError, setRehostError] = useState<string | null>(null)

  const advancingRef = useRef(false)
  const initialLoadAttemptedRef = useRef(false)

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const joinUrl = roomCode ? `${origin}/join?code=${roomCode}` : ""
  const joinPageUrl = roomCode ? `/join?code=${roomCode}` : ""
  const displayUrl = roomCode ? `/display/${roomCode}` : ""
  const initialRequestedCode = useMemo(() => cleanRoomCode(initialRoomCode ?? ""), [initialRoomCode])

  useEffect(() => {
    if (!headsUpPacks.length) return
    setSimpleHeadsUpPackId((current) => {
      if (current && headsUpPacks.some((pack) => pack.id === current)) return current
      return headsUpPacks[0]?.id ?? ""
    })
  }, [headsUpPacks])

  useEffect(() => {
    const raw = clampInt(parseIntOr(roundCountStr, 4), 1, 20)
    setRoundNames((prev) => {
      let next = [...prev]
      if (next.length < raw) {
        for (let i = next.length; i < raw; i++) next.push(defaultRoundName(i))
      }
      if (next.length > raw) next = next.slice(0, raw)
      next = next.map((n, i) => (String(n ?? "").trim() ? n : defaultRoundName(i)))
      return next
    })
  }, [roundCountStr])

  useEffect(() => {
    if (initialRequestedCode) {
      setRehostCode(initialRequestedCode)
      return
    }

    try {
      const last = localStorage.getItem(LAST_HOST_CODE_KEY)
      if (last) setRehostCode(cleanRoomCode(last))
    } catch {
      // ignore
    }
  }, [initialRequestedCode])

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setPacksLoading(true)
      setPacksError(null)

      const [packsRes, headsUpPacksRes, showsRes, templatesRes] = await Promise.all([
        supabase
          .from("packs")
          .select("id, display_name, round_type, sort_order, is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        fetch("/api/spotlight/packs", { cache: "no-store" }).then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as { packs?: HeadsUpPackRow[] }
          return res.ok ? (json.packs ?? []) : []
        }).catch(() => [] as HeadsUpPackRow[]),
        supabase.from("shows").select("show_key, display_name, is_active").eq("is_active", true).order("display_name"),
        fetch("/api/round-templates", { cache: "no-store" }).then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as RoundTemplatesResponse
          return res.ok ? (json.templates ?? []) : []
        }).catch(() => [] as RoundTemplateRow[]),
      ])

      if (cancelled) return

      if (packsRes.error) {
        setPacksError(packsRes.error.message)
        setPacks([])
        setPacksLoading(false)
        return
      }

      if (showsRes.error) {
        setPacksError(showsRes.error.message)
        setShows([])
        setPacks((packsRes.data ?? []) as PackRow[])
        setHeadsUpPacks(headsUpPacksRes)
        setTemplates(templatesRes)
        setPacksLoading(false)
        return
      }

      setPacks((packsRes.data ?? []) as PackRow[])
      setHeadsUpPacks(headsUpPacksRes)
      setShows((showsRes.data ?? []) as ShowRow[])
      setTemplates(templatesRes)
      setPacksLoading(false)
    }

    loadData()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!packs.length) return

    setSelectedPacks((prev) => {
      const next = { ...prev }
      for (const p of packs) {
        if (next[p.id] === undefined) next[p.id] = false
      }
      return next
    })

    setPerPackCounts((prev) => {
      const next = { ...prev }
      for (const p of packs) {
        if (next[p.id] === undefined) next[p.id] = ""
      }
      return next
    })
  }, [packs])


  useEffect(() => {
    if (!templates.length) {
      setTemplateToAddId("")
      return
    }

    setTemplateToAddId((current) => {
      if (current && templates.some((template) => template.id === current)) return current
      return templates[0]?.id ?? ""
    })
  }, [templates])

  useEffect(() => {
    if (!templates.length) {
      setQuickRandomTemplateIds([])
      return
    }

    setQuickRandomTemplateIds((current) => {
      const valid = current.filter((id) => templates.some((template) => template.id === id))
      return valid.length ? valid : templates.map((template) => template.id)
    })
  }, [templates])

  useEffect(() => {
    if (!manualRounds.length || !templates.length) return
    setRoundTemplateSelections((current) => {
      const next = { ...current }
      for (const round of manualRounds) {
        if (!next[round.id] || !templates.some((template) => template.id === next[round.id])) {
          next[round.id] = templates[0]?.id ?? ""
        }
      }
      for (const roundId of Object.keys(next)) {
        if (!manualRounds.some((round) => round.id === roundId)) delete next[roundId]
      }
      return next
    })
  }, [manualRounds, templates])

  useEffect(() => {
    if (!roomCode) return

    let cancelled = false

    async function tick() {
      try {
        const res = await fetch(`/api/room/state?code=${roomCode}`, { cache: "no-store" })
        const data: RoomState = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok) {
          setRoomState(data)
          setRoomPhase(String(data?.phase ?? "lobby"))
          setRoomStage(String(data?.stage ?? "lobby"))
        }
      } catch {
        // ignore
      }
    }

    tick()
    const id = setInterval(tick, 1000)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [roomCode])

  useEffect(() => {
    if (!roomCode) return
    if (roomPhase !== "running") return
    if (roomStage !== "needs_advance") return
    if (advancingRef.current) return

    let cancelled = false
    advancingRef.current = true

    async function autoAdvance() {
      try {
        await fetch("/api/room/advance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: roomCode }),
        })
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          window.setTimeout(() => {
            advancingRef.current = false
          }, 300)
        } else {
          advancingRef.current = false
        }
      }
    }

    autoAdvance()

    return () => {
      cancelled = true
    }
  }, [roomCode, roomPhase, roomStage])

  function rememberHostCode(code: string) {
    try {
      localStorage.setItem(LAST_HOST_CODE_KEY, code)
    } catch {
      // ignore
    }
  }

  function openInNewWindow(url: string) {
    if (!url) return
    const w = window.open(url, "_blank", "noopener,noreferrer")
    if (w) w.opener = null
  }

  async function copyJoinLink() {
    if (!joinUrl) return
    try {
      await navigator.clipboard.writeText(joinUrl)
    } catch {
      // ignore
    }
  }

  function setAllSelected(value: boolean) {
    const next: Record<string, boolean> = {}
    for (const p of packs) next[p.id] = value
    setSelectedPacks(next)
  }

  function togglePack(id: string) {
    setSelectedPacks((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function selectedPackIds() {
    return packs.filter((p) => selectedPacks[p.id]).map((p) => p.id)
  }

  function buildLegacyRoundsPayload(packIds: string[]) {
    return packIds
      .map((packId) => {
        const raw = perPackCounts[packId] ?? ""
        const count = clampInt(parseIntOr(raw, 0), 0, 9999)
        return { packId, count }
      })
      .filter((round) => round.count > 0)
  }

  function addManualRound() {
    setManualRounds((prev) => [...prev, makeManualRound(prev.length)])
  }

  function removeManualRound(id: string) {
    setManualRounds((prev) => prev.filter((round) => round.id !== id))
  }

  function updateManualRound(id: string, changes: Partial<ManualRoundDraft>) {
    setManualRounds((prev) =>
      prev.map((round) => {
        if (round.id !== id) return round
        const next: Partial<ManualRoundDraft> = { ...changes }
        return normaliseManualRoundDraft({ ...round, ...next })
      })
    )
  }

  function toggleManualRoundPack(roundId: string, packId: string) {
    setManualRounds((prev) =>
      prev.map((round) => {
        if (round.id !== roundId) return round
        const nextPackIds = round.packIds.includes(packId)
          ? round.packIds.filter((id) => id !== packId)
          : [...round.packIds, packId]
        return { ...round, packIds: nextPackIds }
      })
    )
  }

  function setManualRoundPackIds(roundId: string, packIds: string[]) {
    const cleaned = [...new Set(packIds.map((value) => String(value ?? "").trim()).filter(Boolean))]
    setManualRounds((prev) => prev.map((round) => (round.id === roundId ? { ...round, packIds: cleaned } : round)))
  }

  function copyManualRoundPacksFromPrevious(roundId: string) {
    setManualRounds((prev) => {
      const index = prev.findIndex((round) => round.id === roundId)
      if (index <= 0) return prev
      const previous = prev[index - 1]
      if (!previous) return prev
      return prev.map((round, roundIndex) =>
        roundIndex === index ? { ...round, packIds: [...previous.packIds] } : round
      )
    })
  }

  function openManualRoundPackPicker(roundId: string) {
    setPackPickerSearch("")
    setPackPickerRoundId(roundId)
  }

  function applyTemplateToManualRound(roundId: string, templateId: string) {
    const template = templates.find((item) => item.id === templateId)
    if (!template) return
    const selectionRules = normaliseSelectionRules(template.selection_rules)
    const defaultPackIds = normaliseDefaultPackIds(template.default_pack_ids)
    const behaviourType: RoundBehaviourType =
      String(template.behaviour_type ?? "standard") === "quickfire"
        ? "quickfire"
        : String(template.behaviour_type ?? "standard") === "spotlight"
          ? "spotlight"
          : "standard"

    setManualRounds((prev) =>
      prev.map((round) => {
        if (round.id !== roundId) return round
        const nextSourceMode: RoundSourceMode =
          behaviourType === "spotlight"
            ? "specific_packs"
            : String(template.source_mode ?? "selected_packs") === "all_questions"
              ? "all_questions"
              : "specific_packs"

        return normaliseManualRoundDraft({
          ...round,
          name: String(template.name ?? "").trim() || round.name,
          questionCountStr: behaviourType === "spotlight" ? round.questionCountStr : String(Math.max(1, Number(template.default_question_count ?? 5) || 5)),
          behaviourType,
          jokerEligible: behaviourType === "quickfire" || behaviourType === "spotlight" ? false : Boolean(template.joker_eligible ?? true),
          countsTowardsScore: behaviourType === "spotlight" ? false : Boolean(template.counts_towards_score ?? true),
          sourceMode: nextSourceMode,
          packIds: nextSourceMode === "specific_packs" ? (defaultPackIds.length ? defaultPackIds : round.packIds) : [],
          mediaTypes: selectionRules.mediaTypes ?? [],
          answerTypes: selectionRules.answerTypes ?? [],
          promptTargets: selectionRules.promptTargets ?? [],
          clueSources: selectionRules.clueSources ?? [],
          primaryShowKeys: selectionRules.primaryShowKeys ?? [],
          audioClipTypes: selectionRules.audioClipTypes ?? [],
          headsUpDifficulty: "",
          headsUpTvDisplayMode: "timer_only",
          headsUpTurnSeconds: 60,
          useTimingOverride: false,
          answerSecondsStr: "",
          roundReviewSecondsStr: "",
        })
      })
    )
  }

  function addManualRoundFromTemplate(template: RoundTemplateRow) {
    const selectionRules = normaliseSelectionRules(template.selection_rules)
    const defaultPackIds = normaliseDefaultPackIds(template.default_pack_ids)

    const rawSourceMode = String(template.source_mode ?? "selected_packs") as RoundSourceMode
    const behaviourType: RoundBehaviourType = String(template.behaviour_type ?? "standard") === "quickfire" ? "quickfire" : String(template.behaviour_type ?? "standard") === "spotlight" ? "spotlight" : "standard"
    const sourceMode: RoundSourceMode =
      behaviourType === "spotlight"
        ? "specific_packs"
        : rawSourceMode === "all_questions"
          ? "all_questions"
          : defaultPackIds.length > 0
            ? "specific_packs"
            : "all_questions"

    setManualRounds((prev) => [
      ...prev,
      normaliseManualRoundDraft({
        id: makeRoundId(),
        name: String(template.name ?? "").trim() || defaultRoundName(prev.length),
        questionCountStr: String(Math.max(1, Number(template.default_question_count ?? 5))),
        behaviourType,
        jokerEligible: behaviourType === "quickfire" || behaviourType === "spotlight" ? false : Boolean(template.joker_eligible ?? true),
        countsTowardsScore: behaviourType === "spotlight" ? false : Boolean(template.counts_towards_score ?? true),
        sourceMode,
        packIds: sourceMode === "specific_packs" ? defaultPackIds : [],
        mediaTypes: selectionRules.mediaTypes ?? [],
        answerTypes: selectionRules.answerTypes ?? [],
        promptTargets: selectionRules.promptTargets ?? [],
        clueSources: selectionRules.clueSources ?? [],
        primaryShowKeys: selectionRules.primaryShowKeys ?? [],
        audioClipTypes: selectionRules.audioClipTypes ?? [],
        headsUpDifficulty: "",
        headsUpTvDisplayMode: "timer_only",
        headsUpTurnSeconds: 60,
        useTimingOverride: false,
        answerSecondsStr: "",
        roundReviewSecondsStr: "",
      }),
    ])
  }

  const selectedTemplateToAdd = useMemo(
    () => templates.find((template) => template.id === templateToAddId) ?? null,
    [templates, templateToAddId]
  )

  const selectedQuickRandomTemplates = useMemo(
    () => templates.filter((template) => quickRandomTemplateIds.includes(template.id)),
    [templates, quickRandomTemplateIds]
  )

  const selectedQuickRandomTemplateFamilyCount = useMemo(
    () => countDistinctRoundTemplateFamilies(selectedQuickRandomTemplates),
    [selectedQuickRandomTemplates]
  )

  const simpleSelectedPackIds = useMemo(() => {
    if (!selectPacks) return packs.map((pack) => pack.id)
    return selectedPackIds()
  }, [packs, selectPacks, selectedPacks])

  const manualRoundsPayload = useMemo(
    () => manualRounds.map((round, index) => serialiseManualRoundDraft(round, index)),
    [manualRounds]
  )

  const templateRoundsPayload = useMemo(
    () => selectedQuickRandomTemplates.map((template, index) => serialiseTemplateAsRound(template, index)),
    [selectedQuickRandomTemplates]
  )

  const allTemplateRoundsPayload = useMemo(
    () => templates.map((template, index) => serialiseTemplateAsRound(template, index)),
    [templates]
  )

  const quickRandomTemplatesQuestionTotal = useMemo(() => {
    return selectedQuickRandomTemplates.reduce(
      (sum, template) => sum + Math.max(1, Number(template.default_question_count ?? 0) || 0),
      0
    )
  }, [selectedQuickRandomTemplates])

  function toggleQuickRandomTemplate(templateId: string) {
    setQuickRandomTemplateIds((prev) =>
      prev.includes(templateId) ? prev.filter((id) => id !== templateId) : [...prev, templateId]
    )
  }

  function setAllQuickRandomTemplates(value: boolean) {
    setQuickRandomTemplateIds(value ? templates.map((template) => template.id) : [])
  }

  const manualRoundsTotal = useMemo(() => {
    return manualRounds.reduce((sum, round) => sum + clampInt(parseIntOr(round.questionCountStr, 0), 0, 200), 0)
  }, [manualRounds])

  const jokerEligibleCount = useMemo(() => manualRounds.filter((round) => round.jokerEligible).length, [manualRounds])

  const selectedPackIdsForManual = useMemo(() => [] as string[], [])

  const selectedPackIdsForQuickRandom = useMemo(() => {
    if (!selectPacks) return packs.map((pack) => pack.id)
    return selectedPackIds()
  }, [packs, selectPacks, selectedPacks])

  useEffect(() => {
    if (roomCode) return
    if (packsLoading) return

    let cancelled = false
    setSimpleFeasibilityBusy(true)
    setSimpleFeasibilityError(null)

    const timer = window.setTimeout(async () => {
      try {

        const response = await fetch("/api/room/feasibility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            simpleGameType === "spotlight"
              ? {
                  selectedPackIds: [],
                  manualRounds: simpleHeadsUpPackId
                    ? [
                        {
                          id: "simple_spotlight_round",
                          name: "Spotlight",
                          questionCount: 0,
                          behaviourType: "spotlight",
                          sourceMode: "specific_packs",
                          packIds: [simpleHeadsUpPackId],
                          selectionRules: {},
                        },
                      ]
                    : [],
                  templateRounds: [],
                }
              : {
                  selectedPackIds: simpleSelectedPackIds,
                  manualRounds: [],
                  templateIds: templates.map((template) => template.id),
                  templateRounds: allTemplateRoundsPayload,
                }
          ),
        })

        const json = (await response.json().catch(() => ({}))) as FeasibilityResponse
        if (cancelled) return

        if (!response.ok) {
          setSimpleFeasibilityError(json.error ?? "Could not check the current question pool.")
          setSimpleTemplateFeasibility(null)
          setSimpleCandidateCount(0)
          setSimpleFeasibilityBusy(false)
          return
        }

        setSimpleTemplateFeasibility(simpleGameType === "spotlight" ? json.manual ?? null : json.templates ?? null)
        setSimpleCandidateCount(
          simpleGameType === "spotlight"
            ? Math.max(0, Number(json.manual?.rounds?.[0]?.eligibleCount ?? 0) || 0)
            : Math.max(0, Number(json.candidateCount ?? 0) || 0)
        )
        setSimpleFeasibilityBusy(false)
      } catch (error: any) {
        if (cancelled) return
        setSimpleFeasibilityError(error?.message ?? "Could not check the current question pool.")
        setSimpleTemplateFeasibility(null)
        setSimpleCandidateCount(0)
        setSimpleFeasibilityBusy(false)
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [allTemplateRoundsPayload, headsUpPacks.length, packsLoading, roomCode, simpleGameType, simpleHeadsUpPackId, simpleSelectedPackIds, templates.length])

  useEffect(() => {
    if (setupMode !== "advanced") {
      setFeasibilityBusy(false)
      setFeasibilityError(null)
      setManualFeasibility(null)
      setTemplateFeasibility(null)
      return
    }

    if (roomCode) return
    if (packsLoading) return

    const shouldCheckManual = buildMode === "manual_rounds"
    const shouldCheckTemplates = buildMode === "quick_random" && quickRandomUseTemplates

    if (!shouldCheckManual && !shouldCheckTemplates) {
      setFeasibilityBusy(false)
      setFeasibilityError(null)
      setManualFeasibility(null)
      setTemplateFeasibility(null)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        setFeasibilityBusy(true)
        setFeasibilityError(null)

        const response = await fetch("/api/room/feasibility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedPackIds: shouldCheckManual ? selectedPackIdsForManual : selectedPackIdsForQuickRandom,
            manualRounds: shouldCheckManual ? manualRoundsPayload : [],
            templateIds: shouldCheckTemplates ? selectedQuickRandomTemplates.map((template) => template.id) : [],
            templateRounds: shouldCheckTemplates ? templateRoundsPayload : [],
          }),
        })

        const json = (await response.json().catch(() => ({}))) as FeasibilityResponse
        if (cancelled) return

        if (!response.ok) {
          setFeasibilityError(json.error ?? "Could not check round feasibility.")
          setManualFeasibility(null)
          setTemplateFeasibility(null)
          setFeasibilityBusy(false)
          return
        }

        setManualFeasibility(json.manual ?? null)
        setTemplateFeasibility(json.templates ?? null)
        setFeasibilityBusy(false)
      } catch (error: any) {
        if (cancelled) return
        setFeasibilityError(error?.message ?? "Could not check round feasibility.")
        setManualFeasibility(null)
        setTemplateFeasibility(null)
        setFeasibilityBusy(false)
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    buildMode,
    manualRoundsPayload,
    packsLoading,
    quickRandomUseTemplates,
    roomCode,
    selectedPackIdsForManual,
    selectedPackIdsForQuickRandom,
    setupMode,
    templateRoundsPayload,
  ])

  const manualFeasibilityById = useMemo(() => {
    return new Map((manualFeasibility?.rounds ?? []).map((round) => [round.id, round]))
  }, [manualFeasibility])

  const templateFeasibilityById = useMemo(() => {
    return new Map((templateFeasibility?.rounds ?? []).map((round) => [round.id, round]))
  }, [templateFeasibility])

  const simpleTemplateFeasibilityById = useMemo(() => {
    return new Map((simpleTemplateFeasibility?.rounds ?? []).map((round) => [round.id, round]))
  }, [simpleTemplateFeasibility])

  const simpleRoundCount = clampInt(parseIntOr(roundCountStr, 4), 1, 20)

  const simpleInfiniteQuestionLimit = useMemo(() => {
    const value = simpleInfiniteQuestionLimitStr.trim()
    if (value === "") return null
    const parsed = Math.floor(Number(value))
    if (!Number.isFinite(parsed)) return Number.NaN
    return clampInt(parsed, 0, 9999)
  }, [simpleInfiniteQuestionLimitStr])

  const simpleInfiniteResolvedQuestionCount = useMemo(() => {
    if (simpleInfiniteQuestionLimit == null) return simpleCandidateCount
    if (!Number.isFinite(simpleInfiniteQuestionLimit) || simpleInfiniteQuestionLimit <= 0) return 0
    return Math.min(simpleInfiniteQuestionLimit, simpleCandidateCount)
  }, [simpleCandidateCount, simpleInfiniteQuestionLimit])

  const advancedInfiniteQuestionLimit = useMemo(() => {
    const value = advancedInfiniteQuestionLimitStr.trim()
    if (value === "") return null
    const parsed = Math.floor(Number(value))
    if (!Number.isFinite(parsed)) return Number.NaN
    return clampInt(parsed, 0, 9999)
  }, [advancedInfiniteQuestionLimitStr])

  const advancedInfiniteResolvedQuestionCount = useMemo(() => {
    if (advancedInfiniteQuestionLimit == null) return simpleCandidateCount
    if (!Number.isFinite(advancedInfiniteQuestionLimit) || advancedInfiniteQuestionLimit <= 0) return 0
    return Math.min(advancedInfiniteQuestionLimit, simpleCandidateCount)
  }, [advancedInfiniteQuestionLimit, simpleCandidateCount])

  const simpleTemplatePlan = useMemo(() => {
    return buildSimpleTemplatePlan({
      templates,
      feasibilityById: simpleTemplateFeasibilityById,
      roundCount: simpleRoundCount,
      preset: simplePreset,
    })
  }, [simplePreset, simpleRoundCount, simpleTemplateFeasibilityById, templates])

  const simpleUnavailableTemplateExamples = useMemo(() => {
    const unavailable = (simpleTemplateFeasibility?.rounds ?? []).filter((round) => !round.feasible)
    if (!unavailable.length) return [] as FeasibilityRoundResult[]

    const preferredBehaviour =
      simplePreset === "classic"
        ? ["standard", "quickfire"]
        : simplePreset === "quickfire_mix"
          ? ["quickfire", "standard"]
          : ["quickfire", "standard"]

    return [...unavailable]
      .sort((a, b) => {
        const behaviourDiff = preferredBehaviour.indexOf(a.behaviourType) - preferredBehaviour.indexOf(b.behaviourType)
        if (behaviourDiff !== 0) return behaviourDiff
        if (a.explanation.tone !== b.explanation.tone) {
          return a.explanation.tone === "error" ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
      .slice(0, 3)
  }, [simplePreset, simpleTemplateFeasibility])

  const createBlockReason = useMemo(() => {
    if (buildMode === "infinite") {
      if (simpleFeasibilityBusy) return "Still checking how many questions are available for this pack choice."
      if (selectPacks && simpleSelectedPackIds.length === 0) return "Select at least one pack, or use all active packs."
      if (advancedInfiniteQuestionLimit !== null) {
        if (!Number.isFinite(advancedInfiniteQuestionLimit) || advancedInfiniteQuestionLimit < 1) {
          return "Total questions must be blank, or at least 1."
        }
      }
      if (simpleCandidateCount <= 0) return "No questions are available in the current pack choice."
      return null
    }

    if (buildMode === "manual_rounds" && manualFeasibility && !manualFeasibility.summary.allFeasible) {
      return manualFeasibility.summary.explanation.summary
    }

    if (buildMode === "quick_random" && quickRandomUseTemplates && templateFeasibility) {
      const invalidTemplates = templateFeasibility.rounds.filter((round) => !round.feasible)
      if (invalidTemplates.length > 0) {
        return invalidTemplates.length === 1
          ? `${invalidTemplates[0]?.name ?? "Template"}: ${invalidTemplates[0]?.explanation.summary ?? "Not ready yet."}`
          : templateFeasibility.summary.explanation.summary
      }
    }

    return null
  }, [advancedInfiniteQuestionLimit, buildMode, manualFeasibility, quickRandomUseTemplates, selectPacks, simpleCandidateCount, simpleFeasibilityBusy, simpleSelectedPackIds.length, templateFeasibility])

  const simpleCreateBlockReason = useMemo(() => {
    if (simpleFeasibilityError) return simpleFeasibilityError
    if (selectPacks && simpleSelectedPackIds.length === 0) {
      return "Select at least one pack, or use all active packs."
    }

    if (simpleGameType === "infinite") {
      if (simpleInfiniteQuestionLimit !== null) {
        if (!Number.isFinite(simpleInfiniteQuestionLimit) || simpleInfiniteQuestionLimit < 1) {
          return "Total questions must be blank, or at least 1."
        }
      }

      if (simpleCandidateCount <= 0) {
        return "No questions are available in the current pack choice."
      }

      return null
    }

    if (simpleGameType === "spotlight") {
      if (!simpleHeadsUpPackId) return "Choose a Spotlight pack first."
      if (simpleFeasibilityBusy) return "Still checking the selected Spotlight pack."
      if (simpleCandidateCount <= 0) return "No active Spotlight cards are available in the selected pack."
      return null
    }

    return simpleTemplatePlan.error
  }, [selectPacks, simpleCandidateCount, simpleFeasibilityError, simpleGameType, simpleInfiniteQuestionLimit, simpleSelectedPackIds.length, simpleTemplatePlan.error])

  const activeCreateBlockReason = setupMode === "simple" ? simpleCreateBlockReason : createBlockReason

  async function createRoom() {
    setCreating(true)
    setCreateError(null)
    setStartError(null)
    setStartOk(null)
    setResetError(null)
    setResetOk(null)
    setForceCloseError(null)

    try {
      if (activeCreateBlockReason) {
        setCreateError(activeCreateBlockReason)
        setCreating(false)
        return
      }

      const roundReviewSeconds = setupMode === "simple"
        ? getDefaultRoundReviewSecondsForBehaviour("standard")
        : clampInt(parseIntOr(roundReviewSecondsStr, 10), 0, 120)
      const countdownSeconds = roundReviewSeconds
      const answerSeconds = setupMode === "simple"
        ? getDefaultAnswerSecondsForBehaviour("standard")
        : untimedAnswers ? 0 : clampInt(parseIntOr(answerSecondsStr, 20), 5, 120)
      const cleanTeamNames = teamNames.map((t) => t.trim()).filter(Boolean)

      if (gameMode === "teams") {
        if (cleanTeamNames.length < 2) {
          setCreateError("Add at least two team names.")
          setCreating(false)
          return
        }

        const seen = new Set<string>()
        for (const teamName of cleanTeamNames) {
          const key = teamName.toLowerCase()
          if (seen.has(key)) {
            setCreateError("Team names must be unique.")
            setCreating(false)
            return
          }
          seen.add(key)
        }
      }

      let payload: any = {
        buildMode: setupMode === "simple" || buildMode === "infinite" ? "manual_rounds" : buildMode,
        gameMode,
        teamNames: gameMode === "teams" ? cleanTeamNames : [],
        countdownSeconds,
        answerSeconds,
        audioMode,
      }

      if (setupMode === "simple") {
        if (simpleFeasibilityBusy) {
          setCreateError(
            simpleGameType === "infinite"
              ? "Still checking how many questions are available for this pack choice."
              : simpleGameType === "spotlight"
                ? "Still checking the selected Spotlight pack."
                : "Still checking which round templates are ready for this pack choice."
          )
          setCreating(false)
          return
        }

        if (simpleGameType === "infinite") {
          if (simpleCandidateCount <= 0) {
            setCreateError("No questions are available in the current pack choice.")
            setCreating(false)
            return
          }

          const requestedCount = simpleInfiniteQuestionLimit == null ? simpleCandidateCount : simpleInfiniteQuestionLimit
          if (!Number.isFinite(requestedCount) || requestedCount < 1) {
            setCreateError("Total questions must be blank, or at least 1.")
            setCreating(false)
            return
          }

          payload = {
            ...payload,
            selectedPacks: simpleSelectedPackIds,
            manualRounds: [
              {
                id: "simple_infinite_round",
                name: "Infinite",
                questionCount: Math.min(requestedCount, simpleCandidateCount),
                behaviourType: "standard",
                jokerEligible: false,
                countsTowardsScore: true,
                sourceMode: "selected_packs",
                packIds: [],
                selectionRules: {},
                answerSeconds: getDefaultAnswerSecondsForBehaviour("standard"),
                roundReviewSeconds: getDefaultRoundReviewSecondsForBehaviour("standard"),
              },
            ],
          }
        } else if (simpleGameType === "spotlight") {
          if (!simpleHeadsUpPackId) {
            setCreateError("Choose a Spotlight pack first.")
            setCreating(false)
            return
          }

          if (simpleCandidateCount <= 0) {
            setCreateError("No active Spotlight cards are available in the selected pack.")
            setCreating(false)
            return
          }

          const selectedHeadsUpPack = headsUpPacks.find((pack) => pack.id === simpleHeadsUpPackId)
          payload = {
            ...payload,
            selectedPacks: [],
            manualRounds: [
              {
                id: "simple_spotlight_round",
                name: selectedHeadsUpPack?.name?.trim() || "Spotlight",
                questionCount: 0,
                behaviourType: "spotlight",
                jokerEligible: false,
                countsTowardsScore: false,
                sourceMode: "specific_packs",
                packIds: [simpleHeadsUpPackId],
                selectionRules: {},
                answerSeconds: 60,
                roundReviewSeconds: getDefaultRoundReviewSecondsForBehaviour("spotlight"),
                headsUpTvDisplayMode: "timer_only",
              },
            ],
          }
        } else {
          if (simpleTemplatePlan.rounds.length === 0) {
            setCreateError(simpleTemplatePlan.error ?? "Could not build a simple game plan.")
            setCreating(false)
            return
          }

          payload = {
            ...payload,
            selectedPacks: simpleSelectedPackIds,
            manualRounds: simpleTemplatePlan.rounds,
          }
        }
      } else if (buildMode === "infinite") {
        const requestedCount = advancedInfiniteQuestionLimit == null ? simpleCandidateCount : advancedInfiniteQuestionLimit

        if (selectPacks && simpleSelectedPackIds.length === 0) {
          setCreateError("Select at least one pack, or use all active packs.")
          setCreating(false)
          return
        }

        if (simpleCandidateCount <= 0) {
          setCreateError("No questions are available in the current pack choice.")
          setCreating(false)
          return
        }

        if (!Number.isFinite(requestedCount) || requestedCount < 1) {
          setCreateError("Total questions must be blank, or at least 1.")
          setCreating(false)
          return
        }

        payload = {
          ...payload,
          selectedPacks: simpleSelectedPackIds,
          manualRounds: [
            {
              id: "simple_infinite_round",
              name: "Infinite",
              questionCount: Math.min(requestedCount, simpleCandidateCount),
              behaviourType: "standard",
              jokerEligible: false,
              countsTowardsScore: true,
              sourceMode: "selected_packs",
              packIds: [],
              selectionRules: {},
              answerSeconds: getDefaultAnswerSecondsForBehaviour("standard"),
              roundReviewSeconds: getDefaultRoundReviewSecondsForBehaviour("standard"),
            },
          ],
        }
      } else if (buildMode === "manual_rounds") {
        if (manualRounds.length === 0) {
          setCreateError("Add at least one round.")
          setCreating(false)
          return
        }

        for (const round of manualRoundsPayload) {
          if (round.sourceMode === "specific_packs" && round.packIds.length === 0) {
            setCreateError(`Each chosen-packs round needs at least one pack.`)
            setCreating(false)
            return
          }
        }

        payload = {
          ...payload,
          selectedPacks: [],
          manualRounds: manualRoundsPayload,
        }
      } else {
        const totalQuestions = clampInt(parseIntOr(totalQuestionsStr, 20), 1, 200)
        let roundCount = clampInt(parseIntOr(roundCountStr, 4), 1, 20)
        if (roundCount > totalQuestions) {
          roundCount = totalQuestions
          setRoundCountStr(String(roundCount))
        }

        const roundNamesToSend = Array.from({ length: roundCount }).map((_, i) => {
          const name = String(roundNames[i] ?? "").trim()
          return name || defaultRoundName(i)
        })

        const usingAllPacks = !selectPacks
        const packIds = usingAllPacks ? packs.map((p) => p.id) : selectedPackIds()

        if (!usingAllPacks && packIds.length === 0) {
          setCreateError("Select at least one pack, or untick Select packs to use all packs.")
          setCreating(false)
          return
        }

        if (buildMode === "legacy_pack_mode") {
          const strategy: SelectionStrategy = usingAllPacks ? "all_packs" : selectionStrategy
          const rounds = strategy === "per_pack" ? buildLegacyRoundsPayload(packIds) : []

          if (!usingAllPacks && strategy === "per_pack" && rounds.length === 0) {
            setCreateError("Add a count for at least one selected pack.")
            setCreating(false)
            return
          }

          payload = {
            ...payload,
            selectionStrategy: strategy,
            roundFilter,
            totalQuestions,
            selectedPacks: packIds,
            rounds,
            roundCount,
            roundNames: roundNamesToSend,
          }
        } else {
          if (quickRandomUseTemplates) {
            if (quickRandomTemplateIds.length === 0) {
              setCreateError("Select at least one round template, or untick Use round templates.")
              setCreating(false)
              return
            }

            if (roundCount > selectedQuickRandomTemplateFamilyCount) {
              setCreateError("Number of rounds cannot be greater than the number of distinct template families selected.")
              setCreating(false)
              return
            }
          }

          payload = {
            ...payload,
            selectionStrategy: "all_packs",
            roundFilter,
            totalQuestions,
            selectedPacks: packIds,
            rounds: [],
            roundCount,
            roundNames: roundNamesToSend,
            quickRandomUseTemplates,
            quickRandomTemplateIds,
          }
        }
      }

      const res = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCreateError(json?.error ?? "Failed to create room")
        setCreating(false)
        return
      }

      const code = cleanRoomCode(String(json?.code ?? ""))
      if (!code) {
        setCreateError("Room created, but no code returned.")
        setCreating(false)
        return
      }

      setRoomCode(code)
      setRoomPhase("lobby")
      setRoomStage("lobby")
      rememberHostCode(code)
    } catch (error: any) {
      setCreateError(error?.message ?? "Failed to create room")
    } finally {
      setCreating(false)
    }
  }

  async function rehostRoom(overrideCode?: string) {
    setRehostBusy(true)
    setRehostError(null)
    setCreateError(null)

    const code = cleanRoomCode(overrideCode ?? rehostCode)
    if (!code) {
      setRehostError("Enter a room code.")
      setRehostBusy(false)
      return
    }

    try {
      const res = await fetch(`/api/room/state?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRehostError(String(data?.error ?? "Room not found."))
        setRehostBusy(false)
        return
      }
      setRoomCode(code)
      setRoomState(data)
      setRoomPhase(String(data?.phase ?? "lobby"))
      setRoomStage(String(data?.stage ?? "lobby"))
      rememberHostCode(code)
    } catch {
      setRehostError("Could not load that room.")
    } finally {
      setRehostBusy(false)
    }
  }

  useEffect(() => {
    if (!initialRequestedCode) return
    if (initialLoadAttemptedRef.current) return
    if (roomCode) return

    initialLoadAttemptedRef.current = true
    setRehostCode(initialRequestedCode)
    void rehostRoom(initialRequestedCode)
  }, [initialRequestedCode, roomCode])

  async function startGame() {
    if (!roomCode) return

    if (joinedPlayerCount <= 0) {
      setStartError("At least one player must join before you can start the game.")
      setStartOk(null)
      return
    }

    if (typeof window !== "undefined" && !window.confirm("Have all your players joined?")) {
      return
    }

    setStarting(true)
    setStartError(null)
    setStartOk(null)
    try {
      const res = await fetch("/api/room/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStartError(data?.error ?? "Could not start game.")
        return
      }
      setRoomPhase("running")
      setRoomStage("open")
      setStartOk("Game started.\nJoining is now closed.")
    } catch (error: any) {
      setStartError(error?.message ?? "Could not start game.")
    } finally {
      setStarting(false)
    }
  }

  async function resetRoom() {
    if (!roomCode) return
    setResetting(true)
    setResetError(null)
    setResetOk(null)
    setStartError(null)
    setStartOk(null)
    setForceCloseError(null)
    try {
      const res = await fetch("/api/room/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResetError(data?.error ?? "Reset failed.")
        return
      }
      setRoomPhase("lobby")
      setRoomStage("lobby")
      setResetOk("Room reset.\nTeams kept, scores set to 0, and joining is open again.")
    } catch (error: any) {
      setResetError(error?.message ?? "Reset failed.")
    } finally {
      setResetting(false)
    }
  }

  async function continueGame() {
    if (!roomCode) return
    setForcingClose(true)
    setForceCloseError(null)
    const route = roomStage === "open" ? "/api/room/force-close" : "/api/room/advance"
    try {
      const res = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setForceCloseError(data?.error ?? "Could not move on.")
      }
    } catch {
      setForceCloseError("Could not move on.")
    } finally {
      setForcingClose(false)
    }
  }

  async function sendHeadsUpAction(action: string, extra: Record<string, unknown> = {}) {
    if (!roomCode) return
    setForcingClose(true)
    setForceCloseError(null)
    try {
      const res = await fetch("/api/room/spotlight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode, action, ...extra }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setForceCloseError(String(data?.error ?? "Could not update Spotlight."))
      }
    } catch {
      setForceCloseError("Could not update Spotlight.")
    } finally {
      setForcingClose(false)
    }
  }

  async function endGameNow() {
    if (!roomCode) return
    setEndingGame(true)
    setForceCloseError(null)
    try {
      const res = await fetch("/api/room/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setForceCloseError(data?.error ?? "Could not end game.")
        return
      }
      if (data?.ended === false) {
        setForceCloseError(data?.reason === "not_running" ? "The game is not currently running." : "Could not end game.")
      }
    } catch {
      setForceCloseError("Could not end game.")
    } finally {
      setEndingGame(false)
    }
  }

  function clearRoom() {
    setRoomCode(null)
    setRoomState(null)
    setRoomPhase("lobby")
    setRoomStage("lobby")
    setStartError(null)
    setStartOk(null)
    setResetError(null)
    setResetOk(null)
    setForceCloseError(null)
  }

  const roomIsInfinite = Boolean(roomState?.mode?.isInfinite)
  const roomProgressLabel = String(roomState?.progress?.label ?? "").trim()
  const roomJokerEnabled = Boolean(roomState?.rounds?.jokerEnabled)
  const roomJokerEligibleCount = Math.max(0, Number(roomState?.rounds?.jokerEligibleCount ?? 0) || 0)
  const roomHeadsUp = roomState?.headsUp ?? null
  const roomIsHeadsUp = String(roomState?.rounds?.current?.behaviourType ?? "").trim().toLowerCase() === "spotlight"

  const stagePill = useMemo(() => {
    return getRoomStagePillLabel({
      phase: roomPhase,
      stage: roomStage,
      isInfiniteMode: roomIsInfinite,
      isLastQuestionOverall: Boolean(roomState?.flow?.isLastQuestionOverall),
    })
  }, [roomIsInfinite, roomPhase, roomStage, roomState?.flow?.isLastQuestionOverall])

  const hasRoom = Boolean(roomCode)
  const selectedPackCount = packs.filter((p) => selectedPacks[p.id]).length
  const packNameById = useMemo(() => new Map(packs.map((pack) => [pack.id, pack.display_name])), [packs])
  const showNameByKey = useMemo(() => new Map(shows.map((show) => [show.show_key, show.display_name])), [shows])
  const packPickerRound = useMemo(() => manualRounds.find((round) => round.id === packPickerRoundId) ?? null, [manualRounds, packPickerRoundId])
  const filteredPackPickerPacks = useMemo(() => {
    const query = packPickerSearch.trim().toLowerCase()
    if (!query) return packs
    return packs.filter((pack) => pack.display_name.toLowerCase().includes(query))
  }, [packPickerSearch, packs])
  const manualRoundsUsingAllQuestionsCount = useMemo(
    () => manualRounds.filter((round) => round.behaviourType !== "spotlight" && round.sourceMode === "all_questions").length,
    [manualRounds]
  )
  const manualRoundsWithChosenPacksCount = useMemo(
    () => manualRounds.filter((round) => round.behaviourType !== "spotlight" && round.sourceMode === "specific_packs").length,
    [manualRounds]
  )
  const joinedPlayerCount = Array.isArray(roomState?.players) ? roomState.players.length : 0

  const canStart = hasRoom && roomPhase === "lobby" && !starting && joinedPlayerCount > 0
  const canContinue =
    hasRoom &&
    roomPhase === "running" &&
    !roomIsHeadsUp &&
    ["open", "round_summary", "needs_advance"].includes(roomStage) &&
    !forcingClose
  const canEndGame = hasRoom && roomPhase === "running" && roomIsInfinite && !endingGame
  const canAdvanceHeadsUpSummary = hasRoom && roomPhase === "running" && roomIsHeadsUp && roomStage === "round_summary" && !forcingClose
  const headsUpRoundCompleteReason = String(roomHeadsUp?.roundCompleteReason ?? "").trim()

  const headsUpHostButtons = roomIsHeadsUp
    ? {
        canStartTurn: roomStage === "heads_up_ready" && !forcingClose,
        canEndTurn: roomStage === "heads_up_live" && !forcingClose,
        canUndo: roomStage === "heads_up_live" && Array.isArray(roomHeadsUp?.currentTurnActions) && roomHeadsUp.currentTurnActions.length > 0 && !forcingClose,
        canConfirmTurn: roomStage === "heads_up_review" && !forcingClose,
      }
    : null

  const headsUpReviewSignature = useMemo(
    () =>
      JSON.stringify(
        Array.isArray(roomHeadsUp?.currentTurnActions)
          ? roomHeadsUp.currentTurnActions.map((item: any) => `${String(item.questionId ?? "")}:${String(item.action ?? "")}`)
          : []
      ),
    [roomHeadsUp?.currentTurnActions]
  )

  const continueLabel =
    roomStage === "open"
      ? forcingClose
        ? "Moving on..."
        : "Reveal answer"
      : roomStage === "round_summary"
        ? forcingClose
          ? "Moving on..."
          : Boolean(roomState?.flow?.isLastQuestionOverall)
            ? roomIsInfinite ? "Finish game" : "Finish now"
            : "Skip round review"
        : forcingClose
          ? "Moving on..."
          : Boolean(roomState?.flow?.isLastQuestionOverall)
            ? roomIsInfinite ? "Finish game" : "Finish now"
            : "Next question"

  const startLabel =
    roomPhase === "lobby"
      ? starting
        ? "Starting..."
        : joinedPlayerCount <= 0
          ? "Waiting for players"
          : "Start game"
      : roomPhase === "running"
        ? "Game running"
        : "Game finished"

  const roomSummaryText =
    roomIsHeadsUp && roomPhase === "running"
      ? roomStage === "heads_up_ready"
        ? "The next guesser starts the turn from their phone when they are ready. Use Force start only as a fallback."
        : roomStage === "heads_up_live"
          ? "The turn is live. The active guesser controls Correct and Pass from their phone."
          : roomStage === "heads_up_review"
            ? "Review the turn log, correct any mistakes if needed, then confirm it. The round will continue automatically after a longer review pause unless you move on sooner."
            : headsUpRoundCompleteReason === "card_pool_exhausted"
              ? "This Spotlight round has run out of active cards before every player has taken a turn. Continue to the next round, then add more cards to this pack if you want longer Spotlight rounds."
              : "The Spotlight round is finished. Continue when you are ready."
      : roomPhase === "lobby"
      ? joinedPlayerCount <= 0
        ? "Players can still join. At least one player must join before you can start the game."
        : roomIsInfinite
          ? "Players can still join. When you are ready, start the infinite run from the host controls."
          : "Players can still join. When you are ready, start the game from the host controls."
      : roomPhase === "running"
        ? roomIsInfinite
          ? "Infinite mode runs as one continuous stream of questions. End the game whenever you want, or let it finish when the question pool runs out."
          : "Questions move on automatically between questions. End of round waits for the host or the round review timer."
        : roomIsInfinite
          ? "The infinite run is finished. Reset the room to play again with the same teams."
          : "The game is finished. Reset the room to play again with the same teams."


  const headsUpReviewAutoAdvanceAtMs = roomHeadsUp?.reviewAutoAdvanceAt ? Date.parse(String(roomHeadsUp.reviewAutoAdvanceAt)) : Number.NaN
  const headsUpReviewCountdownSeconds = Number.isFinite(headsUpReviewAutoAdvanceAtMs)
    ? Math.max(0, Math.ceil((headsUpReviewAutoAdvanceAtMs - Date.now()) / 1000))
    : 0

  useEffect(() => {
    if (!roomCode || !roomIsHeadsUp || roomStage !== "heads_up_review" || forcingClose) return

    const reviewAtMs = roomHeadsUp?.reviewAutoAdvanceAt ? Date.parse(String(roomHeadsUp.reviewAutoAdvanceAt)) : Number.NaN
    const delayMs = Number.isFinite(reviewAtMs) ? Math.max(0, reviewAtMs - Date.now()) : 10000

    const timeoutId = window.setTimeout(() => {
      fetch("/api/room/spotlight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode, action: "host_confirm_turn" }),
      }).catch(() => {})
    }, delayMs)

    return () => window.clearTimeout(timeoutId)
  }, [forcingClose, headsUpReviewSignature, roomCode, roomHeadsUp?.currentTurnIndex, roomHeadsUp?.reviewAutoAdvanceAt, roomIsHeadsUp, roomStage])

  const roomModeSummary = getRunModeSummaryLabel({
    isInfiniteMode: roomIsInfinite,
    behaviourType: roomState?.rounds?.current?.behaviourType,
  })
  const roomJokerSummary = roomIsHeadsUp
    ? "Turn-based clue round."
    : roomIsInfinite
      ? "Joker hidden in Infinite mode."
      : roomJokerEnabled
        ? `${roomJokerEligibleCount} Joker-eligible round${roomJokerEligibleCount === 1 ? "" : "s"}.`
        : "Joker hidden because fewer than two rounds are Joker-eligible."

  const quickfireCount = useMemo(
    () => manualRounds.filter((round) => round.behaviourType === "quickfire").length,
    [manualRounds]
  )

  const manualJokerNote = jokerEligibleCount >= 2
    ? `${jokerEligibleCount} rounds are Joker eligible.`
    : "Joker will be hidden because fewer than two rounds are Joker eligible."

  const simplePackScopeText = !selectPacks
    ? "all active packs"
    : selectedPackCount > 0
      ? `${selectedPackCount} selected pack${selectedPackCount === 1 ? "" : "s"}`
      : "no packs selected yet"

  const simpleReadyLabel = simpleGameType === "infinite"
    ? simpleCandidateCount > 0
      ? "Ready to create"
      : "Needs changes"
    : simpleGameType === "spotlight"
      ? simpleCandidateCount > 0 && simpleHeadsUpPackId
        ? "Ready to create"
        : "Needs changes"
      : simpleTemplatePlan.rounds.length > 0
        ? "Ready to create"
        : "Needs changes"

  const simpleJokerSummary = simpleGameType === "spotlight"
    ? "Joker hidden in Spotlight"
    : simpleTemplatePlan.jokerEligibleCount >= 2
      ? `Joker available in ${simpleTemplatePlan.jokerEligibleCount} round${simpleTemplatePlan.jokerEligibleCount === 1 ? "" : "s"}`
      : "Joker hidden for this game"

  const simpleTimingSummary = simpleGameType === "spotlight"
    ? "Spotlight quick play uses 60 second turns, timer-only TV, and the normal Spotlight end-of-turn review."
    : simpleTemplatePlan.quickfireCount > 0
      ? "Standard rounds use 20 second answers and 30 second reviews. Quickfire uses 10 second answers and 45 second round reviews."
      : "Standard rounds use 20 second answers and 30 second round reviews."

  const simpleGameSummaryText = simpleGameType === "spotlight"
    ? simpleCandidateCount > 0
      ? `This game will start a quick Spotlight round using ${headsUpPacks.find((pack) => pack.id === simpleHeadsUpPackId)?.name ?? "the selected pack"}, with ${simpleCandidateCount} active card${simpleCandidateCount === 1 ? "" : "s"}, 60 second turns, and timer-only TV.`
      : "Simple mode will start a quick Spotlight round as soon as the selected pack has active cards."
    : simpleTemplatePlan.rounds.length > 0
      ? `This game will create ${simpleRoundCount} round${simpleRoundCount === 1 ? "" : "s"}: ${simpleTemplatePlan.standardCount} Standard and ${simpleTemplatePlan.quickfireCount} Quickfire, using ${simplePackScopeText}, with ${audioModeLabel(audioMode)} audio and sensible default timings.`
      : "Simple mode will build a game from ready templates as soon as the current pack choice supports it."

  const simpleInfiniteSummaryText = simpleCandidateCount > 0
    ? simpleInfiniteQuestionLimit == null
      ? `This game will keep moving through every available question from ${simplePackScopeText}. Joker is hidden, there are no round breaks, and audio plays on ${audioModeLabel(audioMode)}.`
      : simpleInfiniteQuestionLimit > simpleCandidateCount
        ? `This game asked for ${simpleInfiniteQuestionLimit} questions, but only ${simpleCandidateCount} are available in ${simplePackScopeText}, so it will use them all in one continuous run with Joker hidden and ${audioModeLabel(audioMode)} audio.`
        : `This game will run as one continuous question stream for ${simpleInfiniteResolvedQuestionCount} question${simpleInfiniteResolvedQuestionCount === 1 ? "" : "s"} from ${simplePackScopeText}. Joker is hidden, there are no round breaks, and audio plays on ${audioModeLabel(audioMode)}.`
    : "Infinite mode will use every available question from the chosen packs once the current pack choice contains at least one question."

  const simpleSetupProps = {
    simpleGameType,
    setSimpleGameType,
    simpleFeasibilityBusy,
    simpleInfiniteQuestionLimit,
    simpleCandidateCount,
    simpleInfiniteResolvedQuestionCount,
    simpleRoundCount,
    roundCountStr,
    setRoundCountStr,
    SIMPLE_PRESET_OPTIONS,
    simplePreset,
    setSimplePreset,
    simpleHeadsUpPackId,
    setSimpleHeadsUpPackId,
    headsUpPacks,
    simpleInfiniteQuestionLimitStr,
    setSimpleInfiniteQuestionLimitStr,
    audioMode,
    setAudioMode,
    selectPacks,
    setSelectPacks,
    selectedPackCount,
    packs,
    selectedPacks,
    togglePack,
    setAllSelected,
    showSimpleGameSummary,
    setShowSimpleGameSummary,
    simpleFeasibilityError,
    simpleInfiniteSummaryText,
    simpleGameSummaryText,
    simpleTimingSummary,
    simpleTemplatePlan,
    simpleUnavailableTemplateExamples,
    audioModeLabel,
    showSimpleRecommendedRounds,
    setShowSimpleRecommendedRounds,
    simpleReadyLabel,
    simpleJokerSummary,
    roundBehaviourBadgeClass,
    roundBehaviourLabel,
  }

  const advancedSetupProps = {
    buildMode,
    setBuildMode,
    advancedInfiniteQuestionLimitStr,
    setAdvancedInfiniteQuestionLimitStr,
    simpleFeasibilityBusy,
    simpleCandidateCount,
    advancedInfiniteQuestionLimit,
    advancedInfiniteResolvedQuestionCount,
    audioMode,
    setAudioMode,
    audioModeLabel,
    selectPacks,
    setSelectPacks,
    manualRounds,
    templateToAddId,
    setTemplateToAddId,
    templates,
    selectedTemplateToAdd,
    addManualRoundFromTemplate,
    addManualRound,
    manualRoundsTotal,
    manualJokerNote,
    quickfireCount,
    manualFeasibility,
    feasibilityBusy,
    feasibilityError,
    roundBehaviourBadgeClass,
    roundBehaviourLabel,
    roundBehaviourTimingText,
    roundBehaviourSummary,
    removeManualRound,
    defaultRoundName,
    updateManualRound,
    ROUND_BEHAVIOUR_OPTIONS,
    getManualRoundTimingSummary,
    HEADS_UP_DIFFICULTY_OPTIONS,
    HEADS_UP_TURN_OPTIONS,
    HEADS_UP_TV_DISPLAY_OPTIONS,
    headsUpPacks,
    shows,
    PROMPT_TARGET_OPTIONS,
    CLUE_SOURCE_OPTIONS,
    AUDIO_CLIP_TYPE_OPTIONS,
    manualFeasibilityById,
    feasibilityTone,
    describeManualRoundPackSummary,
    packNameById,
    openManualRoundPackPicker,
    copyManualRoundPacksFromPrevious,
    roundTemplateSelections,
    setRoundTemplateSelections,
    applyTemplateToManualRound,
    roomStage,
    roomState,
    roomIsInfinite,
    roundCountStr,
    setRoundCountStr,
    roundNames,
    setRoundNames,
    quickRandomUseTemplates,
    setQuickRandomUseTemplates,
    quickRandomTemplateIds,
    selectedQuickRandomTemplates,
    quickRandomTemplatesQuestionTotal,
    setAllQuickRandomTemplates,
    templateFeasibility,
    templateFeasibilityById,
    toggleQuickRandomTemplate,
    totalQuestionsStr,
    setTotalQuestionsStr,
    answerSecondsStr,
    setAnswerSecondsStr,
    untimedAnswers,
    setUntimedAnswers,
    roundReviewSecondsStr,
    setRoundReviewSecondsStr,
    roundFilter,
    setRoundFilter,
    selectionStrategy,
    setSelectionStrategy,
    selectedPackCount,
    setAllSelected,
    packs,
    selectedPacks,
    togglePack,
    perPackCounts,
    setPerPackCounts,
  }

  const liveControlsProps = {
    roomSummaryText,
    stagePill,
    startError,
    startOk,
    resetError,
    resetOk,
    forceCloseError,
    roomCode,
    roomIsInfinite,
    roomModeSummary,
    roomProgressLabel,
    roomJokerSummary,
    startGame,
    canStart,
    startLabel,
    resetRoom,
    resetting,
    roomIsHeadsUp,
    sendHeadsUpAction,
    headsUpHostButtons,
    forcingClose,
    roomStage,
    roomState,
    roomHeadsUp,
    headsUpReviewCountdownSeconds,
    headsUpRoundCompleteReason,
    continueGame,
    canAdvanceHeadsUpSummary,
    canContinue,
    continueLabel,
    endGameNow,
    canEndGame,
    endingGame,
    clearRoom,
  }

  return (
    <PageShell width="full" contentClassName="max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Host</h1>
          <p className="mt-1 text-sm text-muted-foreground">Start a new game, share the room code, and run the quiz.</p>
        </div>

        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          Back to home
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {!hasRoom ? (
            <Card className={setupMode === "advanced" ? "border-0 bg-transparent" : undefined}>
              <CardHeader className={setupMode === "advanced" ? "border-b-0 px-0 pb-4 pt-0" : undefined}>
                <CardTitle>Start a new game</CardTitle>
                <div className="mt-1 text-sm text-muted-foreground">{setupMode === "simple" ? "Use the guided path for a quick setup." : "Build on the left. Use the right side for your question pool and recovery tools."}</div>
              </CardHeader>

              <CardContent className={setupMode === "advanced" ? "space-y-6 px-0 py-0" : "space-y-4"}>
                <div className="rounded-2xl border border-border p-3">
                  <div className="flex items-center gap-2">
                    {setupMode === "simple" ? <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">1</span> : null}
                    <div className="text-sm font-semibold text-foreground">Game basics</div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">Mode</div>
                      <SelectControl variant={setupMode === "advanced" ? "advanced" : "default"} value={gameMode} onChange={(e) => setGameMode(e.target.value as GameMode)} className="mt-1">
                        <option value="teams">Teams</option>
                        <option value="solo">No teams</option>
                      </SelectControl>
                      <div className="mt-1 text-xs text-muted-foreground">One phone per person.</div>
                    </div>

                    {gameMode === "teams" ? (
                      <div>
                        <div className="text-sm font-medium text-foreground">Scoring</div>
                        <div className="mt-2 text-sm text-muted-foreground">Total points. If team sizes differ, the scoreboard uses average points per player.</div>
                      </div>
                    ) : (
                      <div className="flex items-end text-sm text-muted-foreground">Players score individually.</div>
                    )}

                    {gameMode === "teams" ? (
                      <div className="flex items-end justify-end">
                        <Button variant="secondary" onClick={() => {
                          setTeamNames((prev) => {
                            const used = new Set(prev.map((x) => x.trim()).filter(Boolean))
                            const nextName = randomTeamName(used)
                            return [...prev, nextName]
                          })
                        }}>
                          Add team
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {gameMode === "teams" ? (
                    <div className="mt-3 space-y-2">
                      <div className="text-sm text-muted-foreground">Teams (players pick one when joining)</div>
                      {teamNames.map((t, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input value={t} onChange={(e) => setTeamNames((prev) => prev.map((x, i) => i === idx ? e.target.value : x))} placeholder="Team name" />
                          <Button variant="ghost" onClick={() => setTeamNames((prev) => prev.filter((_, i) => i !== idx))} disabled={teamNames.length <= 2}>Remove</Button>
                        </div>
                      ))}
                      {teamNames.length <= 2 ? <div className="text-xs text-muted-foreground">Keep at least two teams.</div> : null}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        {setupMode === "simple" ? <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">2</span> : null}
                        <div className="text-sm font-semibold text-foreground">Choose setup path</div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {setupMode === "simple"
                          ? "Quick host flow for automatic quiz setup, quick Spotlight, or one continuous Infinite run."
                          : "Full round builder with templates, metadata filters, timing overrides, and legacy options."}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant={setupMode === "simple" ? "primary" : "secondary"} size="sm" onClick={() => setSetupMode("simple")}>
                        Simple
                      </Button>
                      <Button
                        variant={setupMode === "advanced" ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => {
                          setAdvancedUnlocked(true)
                          setSetupMode("advanced")
                        }}
                      >
                        {advancedUnlocked ? "Advanced" : "Advanced setup"}
                      </Button>
                    </div>
                  </div>
                </div>

                {setupMode === "advanced" ? (
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="text-sm font-semibold text-foreground">Advanced setup</div>
                    <div className="mt-1 text-sm text-muted-foreground">Choose a build method, then work in the matching builder below. The right side is for question-pool support, not the main workflow.</div>
                  </div>
                ) : null}

                {setupMode === "simple" ? <SimpleSetup {...simpleSetupProps} /> : <AdvancedSetup {...advancedSetupProps} />}

                {createError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{createError}</div> : null}
                {!createError && activeCreateBlockReason ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{activeCreateBlockReason}</div> : null}
              </CardContent>

              <CardFooter className={setupMode === "advanced" ? "flex flex-col items-stretch gap-3 border-t-0 px-0 pt-2 sm:flex-row sm:items-center sm:justify-between" : "flex items-center justify-between gap-3"}>
                <div className="text-sm text-muted-foreground">
                  {setupMode === "simple"
                    ? simpleFeasibilityBusy
                      ? simpleGameType === "infinite"
                        ? "Checking how many questions are available..."
                        : "Checking ready templates..."
                      : simpleGameType === "infinite"
                        ? simpleInfiniteQuestionLimit == null
                          ? `Continuous run using every available question from ${!selectPacks ? "all active packs" : `${selectedPackCount} selected pack${selectedPackCount === 1 ? "" : "s"}`}.`
                          : `Continuous run for ${simpleInfiniteResolvedQuestionCount} question${simpleInfiniteResolvedQuestionCount === 1 ? "" : "s"} from ${!selectPacks ? "all active packs" : `${selectedPackCount} selected pack${selectedPackCount === 1 ? "" : "s"}`}.`
                        : !selectPacks
                          ? `${simpleRoundCount} round${simpleRoundCount === 1 ? "" : "s"} planned from ready templates using all active packs.`
                          : `${simpleRoundCount} round${simpleRoundCount === 1 ? "" : "s"} planned from ready templates across ${selectedPackCount} selected pack${selectedPackCount === 1 ? "" : "s"}.`
                    : buildMode === "infinite"
                      ? simpleFeasibilityBusy
                        ? "Checking how many questions are available..."
                        : advancedInfiniteQuestionLimit == null
                          ? `Infinite run using every available question from ${!selectPacks ? "all active packs" : `${selectedPackCount} selected pack${selectedPackCount === 1 ? "" : "s"}`}.`
                          : `Infinite run for ${advancedInfiniteResolvedQuestionCount} question${advancedInfiniteResolvedQuestionCount === 1 ? "" : "s"} from ${!selectPacks ? "all active packs" : `${selectedPackCount} selected pack${selectedPackCount === 1 ? "" : "s"}`}.`
                      : buildMode === "manual_rounds"
                        ? `${manualRounds.length} round${manualRounds.length === 1 ? "" : "s"} planned.`
                        : buildMode === "quick_random" && quickRandomUseTemplates
                        ? `${quickRandomTemplateIds.length} template${quickRandomTemplateIds.length === 1 ? "" : "s"} in the quick-random pool.`
                        : !selectPacks
                          ? "Using all active packs."
                          : selectedPackCount > 0
                            ? `${selectedPackCount} pack${selectedPackCount === 1 ? "" : "s"} selected.`
                            : "No packs selected yet."}
                </div>
                <Button onClick={createRoom} disabled={creating || packsLoading || (setupMode === "simple" ? simpleFeasibilityBusy || Boolean(activeCreateBlockReason) : Boolean(activeCreateBlockReason))}>
                  {creating ? "Creating..." : packsLoading ? "Loading packs..." : "Create room"}
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <HostLiveControls {...liveControlsProps} />
          )}

          {packsError ? <Card><CardHeader><CardTitle>Packs</CardTitle></CardHeader><CardContent><div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{packsError}</div></CardContent></Card> : null}
        </div>

        <div className="space-y-6">
          {!hasRoom ? (
            <>
              <ResumeHostingCard rehostCode={rehostCode} setRehostCode={setRehostCode} cleanRoomCode={cleanRoomCode} rehostError={rehostError} rehostBusy={rehostBusy} rehostRoom={rehostRoom} />

              {setupMode === "advanced" && buildMode !== "manual_rounds" ? (
                selectPacks ? (
                  <Card className="lg:sticky lg:top-4 self-start">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle>Packs</CardTitle>
                          <div className="mt-1 text-sm text-muted-foreground">Choose which packs this build should use.</div>
                        </div>
                        <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{selectedPackCount} selected</div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => setAllSelected(true)}>Select all</Button>
                        <Button variant="secondary" onClick={() => setAllSelected(false)}>Clear</Button>
                        {buildMode === "legacy_pack_mode" ? (
                          <div className="ml-auto flex items-center gap-2">
                            <div className="text-sm text-muted-foreground">Strategy</div>
                            <SelectControl variant="advanced" value={selectionStrategy} onChange={(e) => setSelectionStrategy(e.target.value as SelectionStrategy)} className="">
                              <option value="all_packs">Mix all selected packs</option>
                              <option value="per_pack">Set counts per pack</option>
                            </SelectControl>
                          </div>
                        ) : null}
                      </div>
                      <div className="grid gap-2">
                        {packs.map((pack) => (
                          <label key={pack.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
                            <input type="checkbox" checked={Boolean(selectedPacks[pack.id])} onChange={() => togglePack(pack.id)} />
                            <span className="min-w-0 flex-1 text-sm">{pack.display_name}</span>
                            {buildMode === "legacy_pack_mode" && selectionStrategy === "per_pack" && selectedPacks[pack.id] ? (
                              <input value={perPackCounts[pack.id] ?? ""} onChange={(e) => setPerPackCounts((prev) => ({ ...prev, [pack.id]: e.target.value }))} inputMode="numeric" placeholder="Count" className="w-24 rounded-xl border border-border bg-card px-3 py-2 text-sm" />
                            ) : null}
                          </label>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader><CardTitle>Packs</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      <div>You are currently using all active packs.</div>
                      <div>Tick Select packs on the left if you want to choose specific packs.</div>
                    </CardContent>
                  </Card>
                )
              ) : null}
            </>
          ) : (
            <>
              <Card>
                <CardHeader><CardTitle>Room access</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-3"><div className="text-2xl font-semibold tracking-widest text-foreground">{roomCode}</div><QRTile value={joinUrl} size={112} /></div>
                  <div className="text-sm text-muted-foreground">Players join at</div>
                  <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm"><a href={joinUrl} className="break-all underline">{joinUrl}</a></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button onClick={() => openInNewWindow(displayUrl)}>Open TV display</Button>
                    <Button variant="secondary" onClick={() => openInNewWindow(joinPageUrl)}>Join room</Button>
                  </div>
                  <Button variant="secondary" onClick={copyJoinLink}>Copy join link</Button>
                </CardContent>
              </Card>
              <HostJoinedTeamsPanel code={roomCode ?? ""} />
            </>
          )}
        </div>
      </div>

      {packPickerRound ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-background shadow-2xl">
            <div className="border-b border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-foreground">Choose packs</div>
                  <div className="mt-1 text-sm text-muted-foreground">{packPickerRound.name.trim() || "This round"} will only draw from the packs you tick here.</div>
                </div>
                <Button variant="ghost" onClick={() => setPackPickerRoundId(null)}>Close</Button>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <div className="text-sm font-medium text-foreground">Search packs</div>
                  <Input value={packPickerSearch} onChange={(e) => setPackPickerSearch(e.target.value)} placeholder="Type a pack name" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setManualRoundPackIds(packPickerRound.id, packs.map((pack) => pack.id))}>Select all</Button>
                  <Button variant="secondary" size="sm" onClick={() => setManualRoundPackIds(packPickerRound.id, [])}>Clear</Button>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
                {packPickerRound.packIds.length > 0
                  ? `${packPickerRound.packIds.length} pack${packPickerRound.packIds.length === 1 ? "" : "s"} selected.`
                  : "No packs selected yet."}
              </div>

              <div className="grid max-h-[50vh] gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                {filteredPackPickerPacks.map((pack) => (
                  <label key={pack.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
                    <input type="checkbox" checked={packPickerRound.packIds.includes(pack.id)} onChange={() => toggleManualRoundPack(packPickerRound.id, pack.id)} />
                    <span className="min-w-0 flex-1">{pack.display_name}</span>
                  </label>
                ))}
              </div>

              <div className="text-sm text-muted-foreground">{describeManualRoundPackSummary(packPickerRound, packNameById)}</div>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  )
}
