"use client"

import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import RoundSummaryCard from "@/components/RoundSummaryCard"
import { getDefaultAnswerSecondsForBehaviour, getDefaultRoundReviewSecondsForBehaviour } from "@/lib/roomRoundPlan"


function formatMetadataToken(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function buildManualRoundFilterSummary(round: any, showNameByKey: Map<string, string>) {
  if (round.behaviourType === "heads_up") {
    const parts: string[] = []
    if (round.headsUpDifficulty) parts.push(`Difficulty: ${formatMetadataToken(round.headsUpDifficulty)}`)
    if (round.primaryShowKey) parts.push(`Show: ${showNameByKey.get(round.primaryShowKey) ?? round.primaryShowKey}`)
    return parts
  }

  const parts: string[] = []
  if (round.mediaType) parts.push(`Media: ${formatMetadataToken(round.mediaType)}`)
  if (round.promptTarget) parts.push(`Prompt: ${formatMetadataToken(round.promptTarget)}`)
  if (round.clueSource) parts.push(`Clue: ${formatMetadataToken(round.clueSource)}`)
  if (round.primaryShowKey) parts.push(`Show: ${showNameByKey.get(round.primaryShowKey) ?? round.primaryShowKey}`)
  if (round.audioClipType) parts.push(`Audio clip: ${formatMetadataToken(round.audioClipType)}`)
  return parts
}

export default function AdvancedSetup(props: any) {
  const {
    buildMode, setBuildMode, advancedInfiniteQuestionLimitStr, setAdvancedInfiniteQuestionLimitStr,
    simpleFeasibilityBusy, simpleCandidateCount, advancedInfiniteQuestionLimit, advancedInfiniteResolvedQuestionCount,
    audioMode, setAudioMode, audioModeLabel, selectPacks, setSelectPacks, manualRounds, templateToAddId, setTemplateToAddId,
    templates, selectedTemplateToAdd, addManualRoundFromTemplate, addManualRound, manualRoundsTotal, manualJokerNote,
    quickfireCount, manualFeasibility, feasibilityBusy, feasibilityError, roundBehaviourBadgeClass, roundBehaviourLabel,
    roundBehaviourTimingText, roundBehaviourSummary, removeManualRound, defaultRoundName, updateManualRound,
    ROUND_BEHAVIOUR_OPTIONS, getManualRoundTimingSummary, HEADS_UP_DIFFICULTY_OPTIONS, HEADS_UP_TURN_OPTIONS,
    HEADS_UP_TV_DISPLAY_OPTIONS, headsUpPacks, shows, PROMPT_TARGET_OPTIONS, CLUE_SOURCE_OPTIONS,
    AUDIO_CLIP_TYPE_OPTIONS, manualFeasibilityById, feasibilityTone, describeManualRoundPackSummary, packNameById,
    setPackPickerRoundId, setPackPickerSearch, copyManualRoundPacksFromPrevious, roomStage, roomState, roomIsInfinite,
    roundCountStr, setRoundCountStr, roundNames, setRoundNames, quickRandomUseTemplates, setQuickRandomUseTemplates,
    quickRandomTemplateIds, selectedQuickRandomTemplates, quickRandomTemplatesQuestionTotal, setAllQuickRandomTemplates,
    templateFeasibility, templateFeasibilityById, toggleQuickRandomTemplate, totalQuestionsStr, setTotalQuestionsStr,
    answerSecondsStr, setAnswerSecondsStr, untimedAnswers, setUntimedAnswers, roundReviewSecondsStr, setRoundReviewSecondsStr,
    roundFilter, setRoundFilter, selectionStrategy, setSelectionStrategy, selectedPackCount, setAllSelected,
    packs, selectedPacks, togglePack, perPackCounts, setPerPackCounts,
  } = props

  const showNameByKey: Map<string, string> = new Map<string, string>((shows ?? []).map((show: any): [string, string] => [String(show.show_key), String(show.display_name)]))
  return (
  <>
<div className="rounded-2xl border border-border p-3">
  <div className="text-sm font-semibold text-foreground">Build mode</div>
  <div className="mt-3 grid gap-3 sm:grid-cols-3">
    <div>
      <div className="text-sm font-medium text-foreground">Mode</div>
      <select value={buildMode} onChange={(e) => setBuildMode(e.target.value as "manual_rounds" | "quick_random" | "legacy_pack_mode" | "infinite")} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
        <option value="manual_rounds">Manual rounds</option>
        <option value="quick_random">Quick random</option>
        <option value="infinite">Infinite</option>
        <option value="legacy_pack_mode">Legacy pack mode</option>
      </select>
    </div>
    <div className="sm:col-span-2 text-sm text-muted-foreground">
      {buildMode === "manual_rounds"
        ? "Create each round directly. Packs stay as sources, and metadata decides eligibility."
        : buildMode === "quick_random"
          ? "Choose packs and either use saved round templates or let the app create a simple generic round plan for you."
          : buildMode === "infinite"
            ? "Run one continuous stream of questions from the chosen packs, with no round setup."
            : "Use the older pack-based builder with optional per-pack counts while you transition."}
    </div>
  </div>
</div>

{buildMode === "infinite" ? (
  <div className="rounded-2xl border border-border p-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <div className="text-sm font-medium text-foreground">Total questions asked</div>
        <Input
          value={advancedInfiniteQuestionLimitStr}
          onChange={(e) => setAdvancedInfiniteQuestionLimitStr(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          placeholder="Blank = every available question"
        />
        <div className="mt-1 text-xs text-muted-foreground">Leave this blank to use the full pool from the chosen packs once each.</div>
      </div>
      <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
        Infinite advanced mode still uses the same round-plan engine underneath. It creates one continuous standard run with Joker hidden and no manual round setup.
      </div>
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
        <div className="text-sm font-semibold text-foreground">Manual rounds</div>
        <div className="mt-1 text-xs text-muted-foreground">Each round picks its own pool using pack scope and metadata rules.</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          value={templateToAddId}
          onChange={(e) => setTemplateToAddId(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
          disabled={!templates.length}
        >
          {templates.length === 0 ? (
            <option value="">No active templates</option>
          ) : null}
          {templates.map((template: any) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          onClick={() => {
            if (selectedTemplateToAdd) addManualRoundFromTemplate(selectedTemplateToAdd)
          }}
          disabled={!selectedTemplateToAdd}
        >
          Add from template
        </Button>
        <Button variant="secondary" onClick={addManualRound}>Add blank round</Button>
      </div>
    </div>

    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
      <div>Total questions from rounds: {manualRoundsTotal}. {manualJokerNote}</div>
      {quickfireCount > 0 ? <div>Quickfire skips Joker, skips per-question reveals, and only pulls MCQ questions. Audio is allowed only when media_duration_ms is set and the clip is 5 seconds or shorter.</div> : null}
      {selectedTemplateToAdd?.description ? <div>Template: {selectedTemplateToAdd.description}</div> : null}
    </div>

    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${roundBehaviourBadgeClass("standard")}`}>
            {roundBehaviourLabel("standard")}
          </span>
          <span className="text-xs text-muted-foreground">{roundBehaviourTimingText("standard")}</span>
        </div>
        <div className="mt-2 text-sm text-foreground">{roundBehaviourSummary("standard")}</div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${roundBehaviourBadgeClass("quickfire")}`}>
            {roundBehaviourLabel("quickfire")}
          </span>
          <span className="text-xs text-muted-foreground">{roundBehaviourTimingText("quickfire")}</span>
        </div>
        <div className="mt-2 text-sm text-foreground">{roundBehaviourSummary("quickfire")}</div>
        <div className="mt-2 text-xs text-muted-foreground">Quickfire question pool: MCQ only. Audio is allowed when media_duration_ms is set and the clip is 5 seconds or shorter.</div>
      </div>
    </div>

    {buildMode === "manual_rounds" ? (
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
            {manualFeasibility.summary.explanation.detail ? (
              <div className="text-xs text-muted-foreground">{manualFeasibility.summary.explanation.detail}</div>
            ) : null}
            {manualFeasibility.summary.explanation.fallback ? (
              <div className="text-xs text-muted-foreground">{manualFeasibility.summary.explanation.fallback}</div>
            ) : null}
          </div>
        ) : (
          <div className="text-muted-foreground">Feasibility will appear once round settings are ready.</div>
        )}
      </div>
    ) : null}

    <div className="mt-3 space-y-3">
      {manualRounds.map((round: any, index: number) => (
        <div key={round.id} className="rounded-2xl border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium text-foreground">Round {index + 1}</div>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${roundBehaviourBadgeClass(round.behaviourType)}`}>
                  {roundBehaviourLabel(round.behaviourType)}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{roundBehaviourSummary(round.behaviourType)}</div>
            </div>
            <Button variant="ghost" onClick={() => removeManualRound(round.id)} disabled={manualRounds.length <= 1}>Remove</Button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <div className="text-sm font-medium text-foreground">Name</div>
              <Input value={round.name} onChange={(e) => updateManualRound(round.id, { name: e.target.value })} placeholder={defaultRoundName(index)} />
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">{round.behaviourType === "heads_up" ? "Cards" : "Questions"}</div>
              {round.behaviourType === "heads_up" ? (
                <div className="mt-1 rounded-xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Uses all active cards from the selected pack.
                </div>
              ) : (
                <Input value={round.questionCountStr} onChange={(e) => updateManualRound(round.id, { questionCountStr: e.target.value })} inputMode="numeric" />
              )}
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">Behaviour</div>
              <select value={round.behaviourType} onChange={(e) => updateManualRound(round.id, { behaviourType: e.target.value as "standard" | "quickfire" | "heads_up" })} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                {ROUND_BEHAVIOUR_OPTIONS.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <div className="mt-1 text-xs text-muted-foreground">{getManualRoundTimingSummary(round)}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">Source mode</div>
              {round.behaviourType === "heads_up" ? (
                <>
                  <div className="mt-1 w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                    Specific Heads Up pack
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Heads Up v1 uses one themed Heads Up pack per round.</div>
                </>
              ) : (
                <select value={round.sourceMode} onChange={(e) => updateManualRound(round.id, { sourceMode: e.target.value as "selected_packs" | "specific_packs" | "all_questions" })} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                  <option value="specific_packs">Chosen packs for this round</option>
                  <option value="all_questions">All active packs</option>
                </select>
              )}
            </div>
            <div className="space-y-2 pt-6">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={round.jokerEligible} onChange={(e) => updateManualRound(round.id, { jokerEligible: e.target.checked })} disabled={round.behaviourType === "quickfire" || round.behaviourType === "heads_up"} />
                Joker eligible
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={round.countsTowardsScore} onChange={(e) => updateManualRound(round.id, { countsTowardsScore: e.target.checked })} disabled={round.behaviourType === "heads_up"} />
                Counts towards score
              </label>
            </div>
          </div>

          {round.behaviourType === "quickfire" ? (
            <div className="mt-3 rounded-2xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">Round timing override</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Default {roundBehaviourLabel(round.behaviourType)} timings are {roundBehaviourTimingText(round.behaviourType)}. Turn this on if your group needs a slower or faster pace.
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={round.useTimingOverride}
                    onChange={(e) =>
                      updateManualRound(round.id, {
                        useTimingOverride: e.target.checked,
                        answerSecondsStr: e.target.checked
                          ? round.answerSecondsStr || String(getDefaultAnswerSecondsForBehaviour(round.behaviourType))
                          : "",
                        roundReviewSecondsStr: e.target.checked
                          ? round.roundReviewSecondsStr || String(getDefaultRoundReviewSecondsForBehaviour(round.behaviourType))
                          : "",
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
                    <Input
                      value={round.answerSecondsStr}
                      onChange={(e) => updateManualRound(round.id, { answerSecondsStr: e.target.value })}
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">Round review seconds</div>
                    <Input
                      value={round.roundReviewSecondsStr}
                      onChange={(e) => updateManualRound(round.id, { roundReviewSecondsStr: e.target.value })}
                      inputMode="numeric"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {round.behaviourType === "heads_up" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="text-sm font-medium text-foreground">Heads Up pack</div>
                <select
                  value={round.packIds[0] ?? ""}
                  onChange={(e) => updateManualRound(round.id, { packIds: e.target.value ? [e.target.value] : [] })}
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                >
                  <option value="">Choose one pack</option>
                  {headsUpPacks.map((pack: any) => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
                </select>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">difficulty</div>
                <select value={round.headsUpDifficulty} onChange={(e) => updateManualRound(round.id, { headsUpDifficulty: e.target.value as "" | "easy" | "medium" | "hard" })} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                  {HEADS_UP_DIFFICULTY_OPTIONS.map((option: any) => <option key={option.value || "blank"} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">Turn length</div>
                <select value={String(round.headsUpTurnSeconds)} onChange={(e) => updateManualRound(round.id, { headsUpTurnSeconds: e.target.value === "90" ? 90 : 60 })} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                  {HEADS_UP_TURN_OPTIONS.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">TV display</div>
                <select value={round.headsUpTvDisplayMode} onChange={(e) => updateManualRound(round.id, { headsUpTvDisplayMode: e.target.value as "show_clue" | "timer_only" })} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                  {HEADS_UP_TV_DISPLAY_OPTIONS.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">primary_show_key</div>
                <select value={round.primaryShowKey} onChange={(e) => updateManualRound(round.id, { primaryShowKey: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
                  <option value="">Any show</option>
                  {shows.map((show: any) => <option key={show.show_key} value={show.show_key}>{show.display_name}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <details className="mt-3 rounded-2xl border border-border bg-background">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-left">
                <div>
                  <div className="text-sm font-medium text-foreground">Round filters</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {buildManualRoundFilterSummary(round, showNameByKey).length > 0
                      ? buildManualRoundFilterSummary(round, showNameByKey).join(" · ")
                      : "No extra filters. This round can use any matching question from its chosen packs."}
                  </div>
                </div>
                <div className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {buildManualRoundFilterSummary(round, showNameByKey).length > 0
                    ? `${buildManualRoundFilterSummary(round, showNameByKey).length} active`
                    : "Optional"}
                </div>
              </summary>
              <div className="border-t border-border px-3 py-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Media</div>
                    <select value={round.mediaType} onChange={(e) => updateManualRound(round.id, { mediaType: e.target.value as "" | "text" | "audio" | "image" })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
                      <option value="">Any media</option>
                      <option value="text">Text</option>
                      <option value="audio">Audio</option>
                      <option value="image">Picture</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prompt target</div>
                    <select value={round.promptTarget} onChange={(e) => updateManualRound(round.id, { promptTarget: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
                      {PROMPT_TARGET_OPTIONS.map((option: any) => <option key={option.value || "blank"} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Clue source</div>
                    <select value={round.clueSource} onChange={(e) => updateManualRound(round.id, { clueSource: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
                      {CLUE_SOURCE_OPTIONS.map((option: any) => <option key={option.value || "blank"} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Show</div>
                    <select value={round.primaryShowKey} onChange={(e) => updateManualRound(round.id, { primaryShowKey: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm">
                      <option value="">Any show</option>
                      {shows.map((show: any) => <option key={show.show_key} value={show.show_key}>{show.display_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Audio clip</div>
                    <select value={round.audioClipType} onChange={(e) => updateManualRound(round.id, { audioClipType: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" disabled={round.mediaType !== "audio"}>
                      {AUDIO_CLIP_TYPE_OPTIONS.map((option: any) => <option key={option.value || "blank"} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </details>
          )}

          {(() => {
            const feasibility = manualFeasibilityById.get(round.id)
            if (!feasibility) return null
            const tone = feasibilityTone(feasibility)
            const toneClasses =
              tone === "error"
                ? {
                    container: "mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950",
                    text: "text-red-700 dark:text-red-200",
                  }
                : tone === "warning"
                  ? {
                      container: "mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950",
                      text: "text-amber-800 dark:text-amber-200",
                    }
                  : {
                      container: "mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950",
                      text: "text-emerald-800 dark:text-emerald-200",
                    }
            return (
              <div className={toneClasses.container}>
                <div className={toneClasses.text}>{feasibility.explanation.summary}</div>
                {feasibility.explanation.detail ? (
                  <div className="mt-1 text-xs text-muted-foreground">{feasibility.explanation.detail}</div>
                ) : null}
                {feasibility.explanation.fallback ? (
                  <div className="mt-1 text-xs text-muted-foreground">{feasibility.explanation.fallback}</div>
                ) : null}
                <div className="mt-1 text-xs text-muted-foreground">
                  Eligible now: {feasibility.eligibleCount}. Guaranteed under the current overlap: {feasibility.assignedCount}.
                </div>
              </div>
            )
          })()}

          {round.behaviourType === "quickfire" ? (
            <div className="mt-3 rounded-xl border border-violet-500/30 bg-violet-600/10 px-3 py-2 text-xs text-muted-foreground">
              Quickfire question pool: MCQ only. Audio is allowed when media_duration_ms is set and the clip is 5 seconds or shorter. Audio and typed answers are excluded automatically.
            </div>
          ) : null}

          {round.behaviourType === "heads_up" ? (
            <div className="mt-3 text-xs text-muted-foreground">Heads Up rounds use the themed pack chosen above.</div>
          ) : round.sourceMode === "all_questions" ? (
            <div className="mt-3 rounded-xl border border-border bg-background px-3 py-3 text-sm text-muted-foreground">
              This round can draw from any question linked to an active pack.
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">Chosen packs</div>
                  <div className="mt-1 text-xs text-muted-foreground">{describeManualRoundPackSummary(round, packNameById)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setPackPickerRoundId(round.id); setPackPickerSearch("") }}>
                    Choose packs
                  </Button>
                  {index > 0 ? (
                    <Button variant="secondary" size="sm" onClick={() => copyManualRoundPacksFromPrevious(round.id)}>
                      Copy previous
                    </Button>
                  ) : null}
                </div>
              </div>
              {round.packIds.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {round.packIds.slice(0, 4).map((packId: string) => (
                    <span key={packId} className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
                      {packNameById.get(packId) ?? "Unknown pack"}
                    </span>
                  ))}
                  {round.packIds.length > 4 ? (
                    <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
                      +{round.packIds.length - 4} more
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 text-xs text-amber-700 dark:text-amber-300">No packs chosen yet.</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
    {roomStage === "round_summary" ? (
      <RoundSummaryCard
        round={roomState?.rounds?.current}
        roundStats={roomState?.roundStats}
        roundReview={roomState?.roundReview}
        gameMode={roomState?.gameMode === "solo" ? "solo" : "teams"}
        isLastQuestionOverall={Boolean(roomState?.flow?.isLastQuestionOverall)}
        roundSummaryEndsAt={roomState?.times?.roundSummaryEndsAt ?? null}
        isInfiniteMode={roomIsInfinite}
      />
    ) : null}
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
                  <input
                    type="checkbox"
                    checked={quickRandomUseTemplates}
                    onChange={(e) => setQuickRandomUseTemplates(e.target.checked)}
                  />
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
                  <Input key={idx} value={name} onChange={(e) => setRoundNames((prev: string[]) => prev.map((n: string, i: number) => i === idx ? e.target.value : n))} placeholder={defaultRoundName(idx)} />
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
              <div className="mt-1 text-xs text-muted-foreground">
                {selectedQuickRandomTemplates.length} template{selectedQuickRandomTemplates.length === 1 ? "" : "s"} selected. Default questions total: {quickRandomTemplatesQuestionTotal}.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setAllQuickRandomTemplates(true)} disabled={!templates.length}>Select all</Button>
              <Button variant="secondary" onClick={() => setAllQuickRandomTemplates(false)} disabled={!quickRandomTemplateIds.length}>Clear</Button>
            </div>
          </div>
          {quickRandomUseTemplates ? (
            <div className="mt-3 rounded-2xl border border-border bg-background p-3 text-sm">
              {feasibilityBusy ? (
                <div className="text-muted-foreground">Checking template feasibility...</div>
              ) : feasibilityError ? (
                <div className="text-red-700 dark:text-red-200">{feasibilityError}</div>
              ) : templateFeasibility ? (
                <div className="space-y-2">
                  <div className={templateFeasibility.summary.explanation.tone === "ok" ? "text-foreground" : templateFeasibility.summary.explanation.tone === "warning" ? "text-amber-700 dark:text-amber-200" : "text-red-700 dark:text-red-200"}>
                    {templateFeasibility.summary.explanation.summary}
                  </div>
                  {templateFeasibility.summary.explanation.detail ? (
                    <div className="text-xs text-muted-foreground">{templateFeasibility.summary.explanation.detail}</div>
                  ) : null}
                  {templateFeasibility.summary.explanation.fallback ? (
                    <div className="text-xs text-muted-foreground">{templateFeasibility.summary.explanation.fallback}</div>
                  ) : null}
                </div>
              ) : (
                <div className="text-muted-foreground">Feasibility will appear once you choose templates.</div>
              )}
            </div>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {templates.length === 0 ? (
              <div className="text-sm text-muted-foreground">No active round templates are available yet.</div>
            ) : (
              templates.map((template: any) => {
                const selected = quickRandomTemplateIds.includes(template.id)
                const feasibility = templateFeasibilityById.get(template.id)
                const tone = feasibility ? feasibilityTone(feasibility) : null
                return (
                  <label key={template.id} className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleQuickRandomTemplate(template.id)}
                      />
                      <span className="min-w-0 flex-1">{template.name}</span>
                      <span className="text-xs text-muted-foreground">{template.default_question_count}</span>
                    </div>
                    {feasibility ? (
                      <div className="mt-2 pl-6 text-xs">
                        <div className={tone === "error" ? "text-red-700 dark:text-red-200" : tone === "warning" ? "text-amber-700 dark:text-amber-200" : "text-emerald-700 dark:text-emerald-200"}>
                          {feasibility.explanation.summary}
                        </div>
                        {feasibility.explanation.detail ? (
                          <div className="mt-1 text-muted-foreground">{feasibility.explanation.detail}</div>
                        ) : null}
                        {selected && feasibility.explanation.fallback ? (
                          <div className="mt-1 text-muted-foreground">{feasibility.explanation.fallback}</div>
                        ) : null}
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
          <select value={roundFilter} onChange={(e) => setRoundFilter(e.target.value as "mixed" | "no_audio" | "no_image" | "audio_only" | "picture_only" | "audio_and_image")} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
            <option value="mixed">Mixed</option>
            <option value="no_audio">No audio</option>
            <option value="no_image">No pictures</option>
            <option value="audio_only">Audio only</option>
            <option value="picture_only">Pictures only</option>
            <option value="audio_and_image">Audio and pictures</option>
          </select>
        </div>
      )}
      <div>
        <div className="text-sm font-medium text-foreground">Audio mode</div>
        <select value={audioMode} onChange={(e) => setAudioMode(e.target.value as "display" | "phones" | "both")} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
          <option value="display">TV display only</option>
          <option value="phones">Phones only</option>
          <option value="both">TV and phones</option>
        </select>
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
