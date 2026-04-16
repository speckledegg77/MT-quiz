"use client"

import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import SelectControl from "@/components/host/SelectControl"
import { getRoundTemplateDisplayName } from "@/lib/roundTemplateNaming"
import { getDefaultAnswerSecondsForBehaviour, getDefaultRoundReviewSecondsForBehaviour } from "@/lib/roomRoundPlan"

type PackOption = { id: string; display_name: string }
type TemplateOption = { id: string; name: string; default_question_count?: number }
type ShowOption = { show_key: string; display_name: string }

const MEDIA_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "audio", label: "Audio" },
  { value: "image", label: "Image" },
]

const ANSWER_TYPE_OPTIONS = [
  { value: "mcq", label: "MCQ" },
  { value: "text", label: "Text" },
]

type Explanation = { tone: string; summary: string; detail?: string | null; fallback?: string | null }
type FeasibilityResult = {
  id: string
  eligibleCount: number
  assignedCount: number
  explanation: Explanation
}

function formatMetadataToken(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
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

function buildManualRoundFilterSummary(round: any, showNameByKey: Map<string, string>) {
  if (round.behaviourType === "heads_up") {
    const parts: string[] = []
    if (round.headsUpDifficulty) parts.push(`Difficulty: ${formatMetadataToken(round.headsUpDifficulty)}`)
    if (round.primaryShowKeys?.length) parts.push(`Show: ${describeShowSelection(round.primaryShowKeys, showNameByKey)}`)
    return parts
  }

  const parts: string[] = []
  const mediaSummary = describeTokenSelection(round.mediaTypes ?? [], "media type")
  const answerSummary = Array.isArray(round.answerTypes) && round.answerTypes.length
    ? round.answerTypes.map((value: string) => value.toUpperCase()).join(" + ")
    : ""
  const promptSummary = describeTokenSelection(round.promptTargets ?? [], "prompt target")
  const clueSummary = describeTokenSelection(round.clueSources ?? [], "clue source")
  const showSummary = describeShowSelection(round.primaryShowKeys ?? [], showNameByKey)
  const audioClipSummary = describeTokenSelection(round.audioClipTypes ?? [], "audio clip type")

  if (mediaSummary) parts.push(`Media: ${mediaSummary}`)
  if (answerSummary) parts.push(`Answer: ${answerSummary}`)
  if (promptSummary) parts.push(`Prompt: ${promptSummary}`)
  if (clueSummary) parts.push(`Clue: ${clueSummary}`)
  if (showSummary) parts.push(`Show: ${showSummary}`)
  if (audioClipSummary) parts.push(`Audio clip: ${audioClipSummary}`)
  return parts
}

function countManualRoundFilters(round: any) {
  let count = 0
  if (round.mediaTypes?.length) count += 1
  if (round.answerTypes?.length) count += 1
  if (round.promptTargets?.length) count += 1
  if (round.clueSources?.length) count += 1
  if (round.primaryShowKeys?.length) count += 1
  if (round.audioClipTypes?.length) count += 1
  if (round.behaviourType === "heads_up" && round.headsUpDifficulty) count += 1
  return count
}

function InlineChipMultiSelectField({
  title,
  values,
  options,
  onToggle,
  onClear,
  description,
}: {
  title: string
  values: string[]
  options: Array<{ value: string; label: string; disabled?: boolean }>
  onToggle: (value: string) => void
  onClear: () => void
  description?: string
}) {
  const activeCount = values.length
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">{description ?? (activeCount > 0 ? `${activeCount} selected` : "No restriction")}</div>
        </div>
        {activeCount > 0 ? (
          <button type="button" onClick={onClear} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            Clear
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = values.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              onClick={() => onToggle(option.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${selected ? "border-foreground bg-muted text-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"} ${option.disabled ? "cursor-not-allowed opacity-40" : ""}`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function AdvancedSetup(props: any) {
  const {
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
  } = props

  const showNameByKey: Map<string, string> = new Map<string, string>((shows ?? []).map((show: ShowOption): [string, string] => [String(show.show_key), String(show.display_name)]))

  return (
    <>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-sm font-semibold text-foreground">1. Choose a build method</div>
        <div className="mt-1 text-sm text-muted-foreground">Pick one route. Only the matching builder stays on screen below.</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className={`rounded-2xl border p-3 text-sm transition-colors ${buildMode === "manual_rounds" ? "border-foreground bg-muted" : "border-border bg-background hover:bg-muted"}`}>
            <div className="flex items-start gap-2">
              <input type="radio" name="build-mode" checked={buildMode === "manual_rounds"} onChange={() => setBuildMode("manual_rounds")} className="mt-0.5" />
              <div>
                <div className="font-medium text-foreground">Manual rounds</div>
                <div className="mt-1 text-xs text-muted-foreground">Build each round directly. Packs stay as sources and metadata decides eligibility.</div>
              </div>
            </div>
          </label>
          <label className={`rounded-2xl border p-3 text-sm transition-colors ${buildMode === "quick_random" ? "border-foreground bg-muted" : "border-border bg-background hover:bg-muted"}`}>
            <div className="flex items-start gap-2">
              <input type="radio" name="build-mode" checked={buildMode === "quick_random"} onChange={() => setBuildMode("quick_random")} className="mt-0.5" />
              <div>
                <div className="font-medium text-foreground">Quick random</div>
                <div className="mt-1 text-xs text-muted-foreground">Choose packs and let templates or a generic plan build the game for you.</div>
              </div>
            </div>
          </label>
          <label className={`rounded-2xl border p-3 text-sm transition-colors ${buildMode === "infinite" ? "border-foreground bg-muted" : "border-border bg-background hover:bg-muted"}`}>
            <div className="flex items-start gap-2">
              <input type="radio" name="build-mode" checked={buildMode === "infinite"} onChange={() => setBuildMode("infinite")} className="mt-0.5" />
              <div>
                <div className="font-medium text-foreground">Infinite</div>
                <div className="mt-1 text-xs text-muted-foreground">Run one continuous stream of questions from the chosen packs, with no round setup.</div>
              </div>
            </div>
          </label>
          <label className={`rounded-2xl border p-3 text-sm transition-colors ${buildMode === "legacy_pack_mode" ? "border-foreground bg-muted" : "border-border bg-background hover:bg-muted"}`}>
            <div className="flex items-start gap-2">
              <input type="radio" name="build-mode" checked={buildMode === "legacy_pack_mode"} onChange={() => setBuildMode("legacy_pack_mode")} className="mt-0.5" />
              <div>
                <div className="font-medium text-foreground">Legacy pack mode</div>
                <div className="mt-1 text-xs text-muted-foreground">Use the older pack-based builder with optional per-pack counts while you transition.</div>
              </div>
            </div>
          </label>
        </div>
      </div>

      {buildMode === "infinite" ? (
        <div className="rounded-2xl border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-foreground">Total questions asked</div>
              <Input value={advancedInfiniteQuestionLimitStr} onChange={(e) => setAdvancedInfiniteQuestionLimitStr(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="Blank = every available question" />
              <div className="mt-1 text-xs text-muted-foreground">Leave this blank to use the full pool from the chosen packs once each.</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">Infinite advanced mode still uses the same round-plan engine underneath. It creates one continuous standard run with Joker hidden and no manual round setup.</div>
          </div>
          <div className="mt-3 rounded-xl border border-border bg-card p-3 text-sm">
            {simpleFeasibilityBusy ? (
              <div className="text-muted-foreground">Checking how many questions are available...</div>
            ) : simpleCandidateCount > 0 ? (
              <div className="space-y-1">
                <div className="text-foreground">{advancedInfiniteQuestionLimit == null ? `${simpleCandidateCount} question${simpleCandidateCount === 1 ? "" : "s"} available for this run.` : `${advancedInfiniteResolvedQuestionCount} question${advancedInfiniteResolvedQuestionCount === 1 ? "" : "s"} will be used.`}</div>
                <div className="text-xs text-muted-foreground">Audio plays on {audioModeLabel(audioMode)}. Joker stays hidden in Infinite mode.</div>
              </div>
            ) : (
              <div className="text-amber-700 dark:text-amber-200">No questions are available in the current pack choice.</div>
            )}
          </div>
        </div>
      ) : null}

      {buildMode === "manual_rounds" ? (
        <div className="rounded-2xl border border-border p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">2. Build the rounds</div>
              <div className="mt-1 text-xs text-muted-foreground">Add rounds one at a time. Templates and pack choices live inside each round card.</div>
            </div>
            <Button variant="secondary" onClick={addManualRound}>Add round</Button>
          </div>

          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            <div>Total questions from rounds: {manualRoundsTotal}. {manualJokerNote}</div>
            {quickfireCount > 0 ? <div>Quickfire skips Joker, skips per-question reveals, and only pulls MCQ questions. Audio is allowed only when media_duration_ms is set and the clip is 5 seconds or shorter.</div> : null}
          </div>

          <div className="mt-3 rounded-2xl border border-border bg-card p-3 text-sm">
            {feasibilityBusy ? (
              <div className="text-muted-foreground">Checking round feasibility...</div>
            ) : feasibilityError ? (
              <div className="text-red-700 dark:text-red-200">{feasibilityError}</div>
            ) : manualFeasibility ? (
              <div className="space-y-2">
                <div className={manualFeasibility.summary.explanation.tone === "ok" ? "text-foreground" : manualFeasibility.summary.explanation.tone === "warning" ? "text-amber-700 dark:text-amber-200" : "text-red-700 dark:text-red-200"}>
                  {manualFeasibility.summary.explanation.summary}
                </div>
                {manualFeasibility.summary.explanation.detail ? <div className="text-xs text-muted-foreground">{manualFeasibility.summary.explanation.detail}</div> : null}
                {manualFeasibility.summary.explanation.fallback ? <div className="text-xs text-muted-foreground">{manualFeasibility.summary.explanation.fallback}</div> : null}
              </div>
            ) : (
              <div className="text-muted-foreground">Feasibility will appear once round settings are ready.</div>
            )}
          </div>

          <div className="mt-3 space-y-3">
            {manualRounds.map((round: any, index: number) => {
              const feasibility = manualFeasibilityById.get(round.id) as FeasibilityResult | undefined
              const filterCount = countManualRoundFilters(round)
              const packPreview = round.packIds.slice(0, 2).map((packId: string) => packNameById.get(packId)).filter(Boolean).join(", ")
              const templateChoice = roundTemplateSelections[round.id] ?? templates[0]?.id ?? ""
              return (
                <div key={round.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-foreground">Round {index + 1}</div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${roundBehaviourBadgeClass(round.behaviourType)}`}>{roundBehaviourLabel(round.behaviourType)}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{roundBehaviourSummary(round.behaviourType)}</div>
                    </div>
                    <Button variant="ghost" onClick={() => removeManualRound(round.id)} disabled={manualRounds.length <= 1}>Remove</Button>
                  </div>

                  <div className="mt-3 rounded-xl border border-border/70 bg-background/40 p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[220px] flex-1">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Template for this round</div>
                        <SelectControl variant="advanced" value={templateChoice} onChange={(e) => setRoundTemplateSelections((prev: Record<string, string>) => ({ ...prev, [round.id]: e.target.value }))} className="mt-1" compact disabled={!templates.length}>
                          {templates.length === 0 ? <option value="">No active templates</option> : null}
                          {templates.map((template: TemplateOption) => (
                            <option key={template.id} value={template.id}>{getRoundTemplateDisplayName(template as any)}</option>
                          ))}
                        </SelectControl>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => applyTemplateToManualRound(round.id, templateChoice)} disabled={!templateChoice}>Apply template</Button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">Name</div>
                      <Input value={round.name} onChange={(e) => updateManualRound(round.id, { name: e.target.value })} placeholder={defaultRoundName(index)} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{round.behaviourType === "heads_up" ? "Cards" : "Questions"}</div>
                      {round.behaviourType === "heads_up" ? (
                        <div className="mt-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">Uses all active cards from the selected pack.</div>
                      ) : (
                        <Input value={round.questionCountStr} onChange={(e) => updateManualRound(round.id, { questionCountStr: e.target.value })} inputMode="numeric" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">Behaviour</div>
                      <SelectControl variant="advanced" compact value={round.behaviourType} onChange={(e) => updateManualRound(round.id, { behaviourType: e.target.value as "standard" | "quickfire" | "heads_up" })} className="mt-1">
                        {ROUND_BEHAVIOUR_OPTIONS.map((option: { value: string; label: string }) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </SelectControl>
                      <div className="mt-1 text-xs text-muted-foreground">{getManualRoundTimingSummary(round)}</div>
                    </div>
                  </div>

                  {round.behaviourType === "heads_up" ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <div className="text-sm font-medium text-foreground">Heads Up pack</div>
                        <SelectControl variant="advanced" compact value={round.packIds[0] ?? ""} onChange={(e) => updateManualRound(round.id, { packIds: e.target.value ? [e.target.value] : [] })} className="mt-1">
                          <option value="">Choose one pack</option>
                          {headsUpPacks.map((pack: { id: string; name: string }) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
                        </SelectControl>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">Difficulty</div>
                        <SelectControl variant="advanced" compact value={round.headsUpDifficulty} onChange={(e) => updateManualRound(round.id, { headsUpDifficulty: e.target.value as "" | "easy" | "medium" | "hard" })} className="mt-1">
                          {HEADS_UP_DIFFICULTY_OPTIONS.map((option: { value: string; label: string }) => <option key={option.value || "blank"} value={option.value}>{option.label}</option>)}
                        </SelectControl>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">Turn length</div>
                        <SelectControl variant="advanced" compact value={String(round.headsUpTurnSeconds)} onChange={(e) => updateManualRound(round.id, { headsUpTurnSeconds: e.target.value === "90" ? 90 : 60 })} className="mt-1">
                          {HEADS_UP_TURN_OPTIONS.map((option: { value: number; label: string }) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </SelectControl>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">TV display</div>
                        <SelectControl variant="advanced" compact value={round.headsUpTvDisplayMode} onChange={(e) => updateManualRound(round.id, { headsUpTvDisplayMode: e.target.value as "show_clue" | "timer_only" })} className="mt-1">
                          {HEADS_UP_TV_DISPLAY_OPTIONS.map((option: { value: string; label: string }) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </SelectControl>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                      <div className="rounded-xl border border-border bg-background p-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Question pool</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" onClick={() => updateManualRound(round.id, { sourceMode: "specific_packs" })} className={`rounded-full border px-3 py-1 text-xs ${round.sourceMode === "specific_packs" ? "border-foreground bg-muted text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}>Chosen packs</button>
                          <button type="button" onClick={() => updateManualRound(round.id, { sourceMode: "all_questions", packIds: [] })} className={`rounded-full border px-3 py-1 text-xs ${round.sourceMode === "all_questions" ? "border-foreground bg-muted text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}>All active packs</button>
                        </div>
                        {round.sourceMode === "specific_packs" ? (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3">
                            <div>
                              <div className="text-sm font-medium text-foreground">{round.packIds.length > 0 ? `${round.packIds.length} selected pack${round.packIds.length === 1 ? "" : "s"}` : "No packs selected yet"}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{packPreview || "Choose the packs that should feed this round."}</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {index > 0 ? <Button variant="secondary" size="sm" onClick={() => copyManualRoundPacksFromPrevious(round.id)}>Copy previous</Button> : null}
                              <Button variant="secondary" size="sm" onClick={() => openManualRoundPackPicker(round.id)}>Choose packs</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-muted-foreground">This round can draw from any active pack.</div>
                        )}
                      </div>

                      <div className="rounded-xl border border-border bg-background p-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Round rules</div>
                        <div className="mt-2 space-y-2">
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input type="checkbox" checked={round.jokerEligible} onChange={(e) => updateManualRound(round.id, { jokerEligible: e.target.checked })} disabled={round.behaviourType === "quickfire"} />
                            Joker eligible
                          </label>
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input type="checkbox" checked={round.countsTowardsScore} onChange={(e) => updateManualRound(round.id, { countsTowardsScore: e.target.checked })} />
                            Counts towards score
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {round.behaviourType !== "heads_up" ? (
                    <details className="mt-3 rounded-xl border border-border bg-background">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-left">
                        <div>
                          <div className="text-sm font-medium text-foreground">Round filters</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {buildManualRoundFilterSummary(round, showNameByKey).length > 0 ? buildManualRoundFilterSummary(round, showNameByKey).join(" · ") : "No extra filters. This round can use any matching question from its chosen packs."}
                          </div>
                        </div>
                        <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{filterCount > 0 ? `${filterCount} active` : "Show"}</div>
                      </summary>
                      <div className="border-t border-border p-3">
                        <div className="grid gap-3 lg:grid-cols-2">
                          <InlineChipMultiSelectField
                            title="media_type"
                            values={round.mediaTypes ?? []}
                            options={MEDIA_TYPE_OPTIONS}
                            onToggle={(value) => {
                              const current = Array.isArray(round.mediaTypes) ? round.mediaTypes : []
                              const next = current.includes(value) ? current.filter((item: string) => item !== value) : [...current, value]
                              updateManualRound(round.id, {
                                mediaTypes: next,
                                audioClipTypes: next.includes("audio") ? round.audioClipTypes ?? [] : [],
                              })
                            }}
                            onClear={() => updateManualRound(round.id, { mediaTypes: [], audioClipTypes: [] })}
                            description="Within a field, selected values behave as OR."
                          />

                          <InlineChipMultiSelectField
                            title="answer_type"
                            values={round.answerTypes ?? []}
                            options={ANSWER_TYPE_OPTIONS.map((option) => ({
                              ...option,
                              disabled: round.behaviourType === "quickfire" && option.value === "text",
                            }))}
                            onToggle={(value) => {
                              if (round.behaviourType === "quickfire" && value === "text") return
                              const current = Array.isArray(round.answerTypes) ? round.answerTypes : []
                              const next = current.includes(value) ? current.filter((item: string) => item !== value) : [...current, value]
                              updateManualRound(round.id, { answerTypes: next })
                            }}
                            onClear={() => updateManualRound(round.id, { answerTypes: round.behaviourType === "quickfire" ? ["mcq"] : [] })}
                            description={round.behaviourType === "quickfire" ? "Quickfire is limited to MCQ." : "Leave clear for no answer-type restriction."}
                          />

                          <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prompt target</div>
                            <SelectControl variant="advanced" value={round.promptTargets?.[0] ?? ""} onChange={(e) => updateManualRound(round.id, { promptTargets: e.target.value ? [e.target.value] : [] })} className="mt-1" compact>
                              {PROMPT_TARGET_OPTIONS.map((option: { value: string; label: string }) => <option key={option.value || "blank"} value={option.value}>{option.label}</option>)}
                            </SelectControl>
                            {round.promptTargets?.length > 1 ? <div className="mt-1 text-[11px] text-muted-foreground">Template keeps {round.promptTargets.length} prompt targets.</div> : null}
                          </div>
                          <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Clue source</div>
                            <SelectControl variant="advanced" value={round.clueSources?.[0] ?? ""} onChange={(e) => updateManualRound(round.id, { clueSources: e.target.value ? [e.target.value] : [] })} className="mt-1" compact>
                              {CLUE_SOURCE_OPTIONS.map((option: { value: string; label: string }) => <option key={option.value || "blank"} value={option.value}>{option.label}</option>)}
                            </SelectControl>
                            {round.clueSources?.length > 1 ? <div className="mt-1 text-[11px] text-muted-foreground">Template keeps {round.clueSources.length} clue sources.</div> : null}
                          </div>
                          <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Show</div>
                            <SelectControl variant="advanced" value={round.primaryShowKeys?.[0] ?? ""} onChange={(e) => updateManualRound(round.id, { primaryShowKeys: e.target.value ? [e.target.value] : [] })} className="mt-1" compact>
                              <option value="">Any show</option>
                              {shows.map((show: ShowOption) => <option key={show.show_key} value={show.show_key}>{show.display_name}</option>)}
                            </SelectControl>
                            {round.primaryShowKeys?.length > 1 ? <div className="mt-1 text-[11px] text-muted-foreground">Template keeps {round.primaryShowKeys.length} show filters.</div> : null}
                          </div>
                          <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Audio clip</div>
                            <SelectControl variant="advanced" value={round.audioClipTypes?.[0] ?? ""} onChange={(e) => updateManualRound(round.id, { audioClipTypes: e.target.value ? [e.target.value] : [] })} className="mt-1" compact disabled={!Array.isArray(round.mediaTypes) || !round.mediaTypes.includes("audio")}>
                              {AUDIO_CLIP_TYPE_OPTIONS.map((option: { value: string; label: string }) => <option key={option.value || "blank"} value={option.value}>{option.label}</option>)}
                            </SelectControl>
                            {round.audioClipTypes?.length > 1 ? <div className="mt-1 text-[11px] text-muted-foreground">Template keeps {round.audioClipTypes.length} audio clip filters.</div> : null}
                          </div>
                        </div>
                      </div>
                    </details>
                  ) : null}

                  {round.behaviourType !== "heads_up" ? (
                    <details className="mt-3 rounded-xl border border-border bg-background">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-left">
                        <div>
                          <div className="text-sm font-medium text-foreground">Timing</div>
                          <div className="mt-1 text-xs text-muted-foreground">{getManualRoundTimingSummary(round)}</div>
                        </div>
                        <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">Edit</div>
                      </summary>
                      <div className="border-t border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs text-muted-foreground">Default timings are set automatically for each behaviour. Turn this on only when you need a slower or faster pace.</div>
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={round.useTimingOverride}
                              onChange={(e) =>
                                updateManualRound(round.id, {
                                  useTimingOverride: e.target.checked,
                                  answerSecondsStr: e.target.checked ? round.answerSecondsStr || String(getDefaultAnswerSecondsForBehaviour(round.behaviourType)) : "",
                                  roundReviewSecondsStr: e.target.checked ? round.roundReviewSecondsStr || String(getDefaultRoundReviewSecondsForBehaviour(round.behaviourType)) : "",
                                })
                              }
                            />
                            Override timings
                          </label>
                        </div>
                        {round.useTimingOverride ? (
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div>
                              <div className="text-sm font-medium text-foreground">Question seconds</div>
                              <Input value={round.answerSecondsStr} onChange={(e) => updateManualRound(round.id, { answerSecondsStr: e.target.value })} inputMode="numeric" />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-foreground">Round review seconds</div>
                              <Input value={round.roundReviewSecondsStr} onChange={(e) => updateManualRound(round.id, { roundReviewSecondsStr: e.target.value })} inputMode="numeric" />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </details>
                  ) : null}

                  {feasibility ? (
                    <div className={`mt-3 rounded-2xl border p-3 text-sm ${feasibilityTone(feasibility) === "error" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950" : feasibilityTone(feasibility) === "warning" ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950" : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"}`}>
                      <div className={feasibilityTone(feasibility) === "error" ? "text-red-700 dark:text-red-200" : feasibilityTone(feasibility) === "warning" ? "text-amber-800 dark:text-amber-200" : "text-emerald-800 dark:text-emerald-200"}>{feasibility.explanation.summary}</div>
                      {feasibility.explanation.detail ? <div className="mt-1 text-xs text-muted-foreground">{feasibility.explanation.detail}</div> : null}
                      {feasibility.explanation.fallback ? <div className="mt-1 text-xs text-muted-foreground">{feasibility.explanation.fallback}</div> : null}
                      <div className="mt-1 text-xs text-muted-foreground">Eligible now: {feasibility.eligibleCount}. Guaranteed under the current overlap: {feasibility.assignedCount}.</div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border p-3">
            <div className="text-sm font-semibold text-foreground">Rounds</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-sm font-medium text-foreground">Number of rounds</div>
                <Input value={roundCountStr} onChange={(e) => setRoundCountStr(e.target.value)} inputMode="numeric" />
                <div className="mt-1 text-xs text-muted-foreground">Players pick a Joker round in the lobby when enough rounds allow it.</div>
              </div>
              <div className="sm:col-span-2">
                {buildMode === "quick_random" ? (
                  <>
                    <div className="text-sm font-medium text-foreground">Quick random source</div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input type="checkbox" checked={quickRandomUseTemplates} onChange={(e) => setQuickRandomUseTemplates(e.target.checked)} />
                        Use round templates
                      </label>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {quickRandomUseTemplates
                        ? "The app will randomly choose from the selected templates below. Each chosen template keeps its own default question count and filters."
                        : "The app will create a simple generic round plan using the round names and total question count below."}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-medium text-foreground">Round names</div>
                    <div className="mt-1 grid gap-2 sm:grid-cols-2">
                      {roundNames.map((name: string, idx: number) => (
                        <Input key={idx} value={name} onChange={(e) => setRoundNames((prev: string[]) => prev.map((n: string, i: number) => (i === idx ? e.target.value : n)))} placeholder={defaultRoundName(idx)} />
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Empty names fall back to Round 1, Round 2, and so on.</div>
                  </>
                )}
              </div>
            </div>

            {buildMode === "quick_random" && quickRandomUseTemplates ? (
              <div className="mt-4 rounded-2xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">Template pool</div>
                    <div className="mt-1 text-xs text-muted-foreground">{selectedQuickRandomTemplates.length} template{selectedQuickRandomTemplates.length === 1 ? "" : "s"} selected. Default questions total: {quickRandomTemplatesQuestionTotal}.</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => setAllQuickRandomTemplates(true)} disabled={!templates.length}>Select all</Button>
                    <Button variant="secondary" onClick={() => setAllQuickRandomTemplates(false)} disabled={!quickRandomTemplateIds.length}>Clear</Button>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-border bg-background p-3 text-sm">
                  {feasibilityBusy ? (
                    <div className="text-muted-foreground">Checking template feasibility...</div>
                  ) : feasibilityError ? (
                    <div className="text-red-700 dark:text-red-200">{feasibilityError}</div>
                  ) : templateFeasibility ? (
                    <div className="space-y-2">
                      <div className={templateFeasibility.summary.explanation.tone === "ok" ? "text-foreground" : templateFeasibility.summary.explanation.tone === "warning" ? "text-amber-700 dark:text-amber-200" : "text-red-700 dark:text-red-200"}>{templateFeasibility.summary.explanation.summary}</div>
                      {templateFeasibility.summary.explanation.detail ? <div className="text-xs text-muted-foreground">{templateFeasibility.summary.explanation.detail}</div> : null}
                      {templateFeasibility.summary.explanation.fallback ? <div className="text-xs text-muted-foreground">{templateFeasibility.summary.explanation.fallback}</div> : null}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">Feasibility will appear once you choose templates.</div>
                  )}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {templates.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No active round templates are available yet.</div>
                  ) : (
                    templates.map((template: TemplateOption) => {
                      const selected = quickRandomTemplateIds.includes(template.id)
                      const feasibility = templateFeasibilityById.get(template.id) as FeasibilityResult | undefined
                      const tone = feasibility ? feasibilityTone(feasibility) : null
                      return (
                        <label key={template.id} className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
                          <div className="flex items-center gap-2">
                            <input type="checkbox" checked={selected} onChange={() => toggleQuickRandomTemplate(template.id)} />
                            <span className="min-w-0 flex-1">{getRoundTemplateDisplayName(template as any)}</span>
                            <span className="text-xs text-muted-foreground">{template.default_question_count}</span>
                          </div>
                          {feasibility ? (
                            <div className="mt-2 pl-6 text-xs">
                              <div className={tone === "error" ? "text-red-700 dark:text-red-200" : tone === "warning" ? "text-amber-700 dark:text-amber-200" : "text-emerald-700 dark:text-emerald-200"}>{feasibility.explanation.summary}</div>
                              {feasibility.explanation.detail ? <div className="mt-1 text-muted-foreground">{feasibility.explanation.detail}</div> : null}
                              {selected && feasibility.explanation.fallback ? <div className="mt-1 text-muted-foreground">{feasibility.explanation.fallback}</div> : null}
                            </div>
                          ) : null}
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {buildMode === "quick_random" && quickRandomUseTemplates ? (
              <div>
                <div className="text-sm font-medium text-foreground">Template randomiser</div>
                <div className="mt-2 text-sm text-muted-foreground">Randomly picks the number of rounds you set above from the selected template pool.</div>
              </div>
            ) : (
              <div>
                <div className="text-sm font-medium text-foreground">Total questions</div>
                <Input value={totalQuestionsStr} onChange={(e) => setTotalQuestionsStr(e.target.value)} inputMode="numeric" />
              </div>
            )}
            <div>
              <div className="text-sm font-medium text-foreground">Answer seconds</div>
              <Input value={answerSecondsStr} onChange={(e) => setAnswerSecondsStr(e.target.value)} inputMode="numeric" disabled={untimedAnswers} />
              <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={untimedAnswers} onChange={(e) => setUntimedAnswers(e.target.checked)} />
                Untimed answers (host controls)
              </label>
              {untimedAnswers ? <div className="mt-1 text-xs text-muted-foreground">The question stays open until everyone answers or you press Reveal answer.</div> : <div className="mt-1 text-xs text-muted-foreground">Questions open straight away. There is no get ready countdown.</div>}
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">Round review seconds</div>
              <Input value={roundReviewSecondsStr} onChange={(e) => setRoundReviewSecondsStr(e.target.value)} inputMode="numeric" />
              <div className="mt-1 text-xs text-muted-foreground">After the last question in a round, the round summary shows for this long before the next round starts.</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {buildMode === "quick_random" && quickRandomUseTemplates ? (
              <div>
                <div className="text-sm font-medium text-foreground">Template rules</div>
                <div className="mt-2 text-sm text-muted-foreground">Each chosen template keeps its own media, clue, and show filters.</div>
              </div>
            ) : (
              <div>
                <div className="text-sm font-medium text-foreground">Round filter</div>
                <SelectControl variant="advanced" value={roundFilter} onChange={(e) => setRoundFilter(e.target.value as "mixed" | "no_audio" | "no_image" | "audio_only" | "picture_only" | "audio_and_image")} className="mt-1">
                  <option value="mixed">Mixed</option>
                  <option value="no_audio">No audio</option>
                  <option value="no_image">No pictures</option>
                  <option value="audio_only">Audio only</option>
                  <option value="picture_only">Pictures only</option>
                  <option value="audio_and_image">Audio and pictures</option>
                </SelectControl>
              </div>
            )}
            <div>
              <div className="text-sm font-medium text-foreground">Audio mode</div>
              <SelectControl variant="advanced" value={audioMode} onChange={(e) => setAudioMode(e.target.value as "display" | "phones" | "both")} className="mt-1">
                <option value="display">TV display only</option>
                <option value="phones">Phones only</option>
                <option value="both">TV and phones</option>
              </SelectControl>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={selectPacks} onChange={(e) => setSelectPacks(e.target.checked)} />
                Select packs
              </label>
            </div>
          </div>
        </>
      )}

      {buildMode === "manual_rounds" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-sm font-medium text-foreground">Fallback answer seconds</div>
            <Input value={answerSecondsStr} onChange={(e) => setAnswerSecondsStr(e.target.value)} inputMode="numeric" disabled={untimedAnswers} />
            <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={untimedAnswers} onChange={(e) => setUntimedAnswers(e.target.checked)} />
              Untimed answers (host controls)
            </label>
            <div className="mt-1 text-xs text-muted-foreground">Manual rounds now carry their own standard or Quickfire timing defaults. This value is kept as the room fallback.</div>
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">Fallback round review seconds</div>
            <Input value={roundReviewSecondsStr} onChange={(e) => setRoundReviewSecondsStr(e.target.value)} inputMode="numeric" />
            <div className="mt-1 text-xs text-muted-foreground">Used only if a round does not already carry its own review timing.</div>
          </div>
        </div>
      ) : null}
    </>
  )
}
