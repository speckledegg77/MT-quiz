"use client"

import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import SelectControl from "@/components/host/SelectControl"
import { getRoundTemplateDisplayName } from "@/lib/roundTemplateNaming"

type LocalAudioMode = "display" | "phones" | "both"
type SimplePresetOption = { value: string; label: string; description: string }
type HeadsUpPackOption = { id: string; name: string }
type PackOption = { id: string; display_name: string }
type TemplateExplanation = { tone: string; summary: string; detail?: string | null }
type UnavailableTemplate = { id: string; name: string; explanation: TemplateExplanation }
type PlannedRound = {
  id: string
  name: string
  behaviourType: string
  jokerEligible?: boolean
  questionCount?: number
  answerSeconds?: number
  roundReviewSeconds?: number
}

export default function SimpleSetup(props: any) {
  const {
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
  } = props

  return (
    <>
      <div className="rounded-2xl border border-border p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">3</span>
              <div className="text-sm font-semibold text-foreground">Choose game type</div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Pick what sort of session you want to run. Recommended builds a full quiz for you, Heads Up starts a clueing game, and Infinite runs one long stream without round setup.
            </div>
          </div>
          <div className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-semibold leading-none text-sky-700 shadow-sm dark:border-sky-500/40 dark:bg-sky-600/10 dark:text-sky-200">
            {simpleGameType === "infinite"
              ? simpleFeasibilityBusy
                ? "Checking..."
                : simpleInfiniteQuestionLimit == null
                  ? simpleCandidateCount > 0
                    ? `${simpleCandidateCount} available`
                    : "Question pool"
                  : `${simpleInfiniteResolvedQuestionCount} questions`
              : simpleGameType === "heads_up"
                ? simpleFeasibilityBusy
                  ? "Checking..."
                  : simpleCandidateCount > 0
                    ? `${simpleCandidateCount} cards`
                    : "Heads Up pack"
                : `${simpleRoundCount} rounds`}
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <label className={`rounded-2xl border p-4 text-sm shadow-sm transition-colors ${simpleGameType === "recommended" ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted"}`}>
            <div className="flex items-start gap-3">
              <input type="radio" name="simple-game-type" checked={simpleGameType === "recommended"} onChange={() => setSimpleGameType("recommended")} className="mt-0.5" />
              <div>
                <div className="font-medium text-foreground">Recommended quiz</div>
                <div className="mt-1 text-xs text-muted-foreground">Automatic round plan using ready templates and sensible defaults.</div>
              </div>
            </div>
          </label>

          <label className={`rounded-2xl border p-4 text-sm shadow-sm transition-colors ${simpleGameType === "heads_up" ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted"}`}>
            <div className="flex items-start gap-3">
              <input type="radio" name="simple-game-type" checked={simpleGameType === "heads_up"} onChange={() => setSimpleGameType("heads_up")} className="mt-0.5" />
              <div>
                <div className="font-medium text-foreground">Heads Up</div>
                <div className="mt-1 text-xs text-muted-foreground">Quick host flow for one themed clueing pack with default settings.</div>
              </div>
            </div>
          </label>

          <label className={`rounded-2xl border p-4 text-sm shadow-sm transition-colors ${simpleGameType === "infinite" ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted"}`}>
            <div className="flex items-start gap-3">
              <input type="radio" name="simple-game-type" checked={simpleGameType === "infinite"} onChange={() => setSimpleGameType("infinite")} className="mt-0.5" />
              <div>
                <div className="font-medium text-foreground">Infinite run</div>
                <div className="mt-1 text-xs text-muted-foreground">One continuous stream of questions without round setup.</div>
              </div>
            </div>
          </label>
        </div>

        {simpleGameType === "recommended" ? (
          <div className="mt-4 rounded-2xl border border-border bg-card/70 p-4">
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <div className="text-sm font-medium text-foreground">Rounds</div>
                <SelectControl value={roundCountStr} onChange={(e) => setRoundCountStr(e.target.value)} className="mt-1" variant="soft">
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((count: number) => (
                    <option key={count} value={String(count)}>
                      {count}
                    </option>
                  ))}
                </SelectControl>
                <div className="mt-1 text-xs text-muted-foreground">Four or five rounds usually feels best for a normal game.</div>
              </div>

              <div>
                <div className="text-sm font-medium text-foreground">Quiz feel</div>
                <div className="mt-1 text-xs text-muted-foreground">This only affects the Recommended quiz. It changes how often Quickfire appears when the ready template pool supports it.</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {SIMPLE_PRESET_OPTIONS.map((preset: SimplePresetOption) => {
                    const selected = simplePreset === preset.value
                    const label =
                      preset.value === "classic"
                        ? "Mostly standard"
                        : preset.value === "balanced"
                          ? "Balanced mix"
                          : "More Quickfire"
                    const description =
                      preset.value === "classic"
                        ? "Closer to a classic quiz."
                        : preset.value === "balanced"
                          ? "Standard rounds with some Quickfire."
                          : "Use more Quickfire where possible."

                    return (
                      <label key={preset.value} className={`rounded-xl border p-3 text-sm transition-colors ${selected ? "border-foreground bg-muted" : "border-border bg-background hover:bg-muted"}`}>
                        <div className="flex items-start gap-2">
                          <input type="radio" name="simple-preset" checked={selected} onChange={() => setSimplePreset(preset.value)} className="mt-0.5" />
                          <div>
                            <div className="font-medium text-foreground">{label}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{description}</div>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : simpleGameType === "heads_up" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-foreground">Heads Up pack</div>
              <SelectControl value={simpleHeadsUpPackId} onChange={(e) => setSimpleHeadsUpPackId(e.target.value)} className="mt-1" variant="soft">
                <option value="">Choose a Heads Up pack</option>
                {headsUpPacks.map((pack: HeadsUpPackOption) => (
                  <option key={pack.id} value={pack.id}>{pack.name}</option>
                ))}
              </SelectControl>
              <div className="mt-1 text-xs text-muted-foreground">Quick play uses one Heads Up pack, 60 second turns, and timer-only TV by default.</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
              Heads Up quick play is ready for a fast host flow. No extra round builder steps, Joker stays hidden, and solo mode still works if you do not want teams.
            </div>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium text-foreground">Total questions asked</div>
              <Input value={simpleInfiniteQuestionLimitStr} onChange={(e) => setSimpleInfiniteQuestionLimitStr(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="Blank = every available question" />
              <div className="mt-1 text-xs text-muted-foreground">Leave this blank to use the full pool from the chosen packs once each.</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
              Infinite uses the normal question flow. It just removes round planning, so the game keeps moving until the chosen question limit is reached. Choose where audio should play below.
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border p-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">4</span>
          <div className="text-sm font-semibold text-foreground">Audio</div>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">Choose where audio questions should play for this game.</div>
        <div className="mt-3 max-w-sm">
          <div className="text-sm font-medium text-foreground">Audio mode</div>
          <SelectControl value={audioMode} onChange={(e) => setAudioMode(e.target.value as LocalAudioMode)} className="mt-1" variant="soft">
            <option value="display">TV display only</option>
            <option value="phones">Phones only</option>
            <option value="both">TV and phones</option>
          </SelectControl>
        </div>
      </div>

      <div className="rounded-2xl border border-border p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">5</span>
              <div className="text-sm font-semibold text-foreground">Question pool</div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Use all active packs, or narrow the game to a smaller pack set.</div>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={selectPacks} onChange={(e) => setSelectPacks(e.target.checked)} />
            Choose packs
          </label>
        </div>

        {!selectPacks ? (
          <div className="mt-3 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">Using all active packs.</div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setAllSelected(true)} disabled={!packs.length}>Select all</Button>
              <Button variant="secondary" size="sm" onClick={() => setAllSelected(false)} disabled={!selectedPackCount}>Clear</Button>
              <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{selectedPackCount} selected</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {packs.map((pack: PackOption) => (
                <label key={pack.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted">
                  <input type="checkbox" checked={Boolean(selectedPacks[pack.id])} onChange={() => togglePack(pack.id)} />
                  <span className="min-w-0 flex-1 truncate">{pack.display_name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border">
        <button type="button" className="flex w-full items-start justify-between gap-3 p-3 text-left" onClick={() => setShowSimpleGameSummary((prev: boolean) => !prev)}>
          <div>
            <div className="text-sm font-semibold text-foreground">Preview game</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {simpleGameType === "infinite"
                ? "Open to preview the question pool and continuous-run behaviour."
                : simpleGameType === "heads_up"
                  ? "Open to preview the quick Heads Up setup."
                  : "Open to preview the game that Simple mode will create."}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{simpleReadyLabel}</div>
            <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{showSimpleGameSummary ? "Hide" : "Show"}</div>
          </div>
        </button>

        {showSimpleGameSummary ? (
          <div className="border-t border-border p-3">
            {simpleFeasibilityBusy ? (
              <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
                {simpleGameType === "infinite" ? "Checking question pool..." : "Checking ready templates..."}
              </div>
            ) : simpleFeasibilityError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{simpleFeasibilityError}</div>
            ) : simpleGameType === "infinite" ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-card p-3 text-sm text-foreground">{simpleInfiniteSummaryText}</div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Question pool</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{simpleFeasibilityBusy ? "Checking..." : `${simpleCandidateCount} available`}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Questions asked</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{simpleInfiniteQuestionLimit == null ? "All available" : simpleInfiniteResolvedQuestionCount}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Packs</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{!selectPacks ? "All active packs" : selectedPackCount > 0 ? `${selectedPackCount} selected` : "Choose pack"}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Audio</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{audioModeLabel(audioMode)}</div>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">Standard timing stays in place, with 20 second answers, 30 second reveals, and a single end-of-game summary when the continuous run finishes.</div>
              </div>
            ) : simpleGameType === "heads_up" ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-card p-3 text-sm text-foreground">{simpleGameSummaryText}</div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Pack</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{headsUpPacks.find((pack: HeadsUpPackOption) => pack.id === simpleHeadsUpPackId)?.name ?? "Choose pack"}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Cards</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{simpleFeasibilityBusy ? "Checking..." : `${simpleCandidateCount} active`}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Turns</div>
                    <div className="mt-1 text-sm font-medium text-foreground">60 seconds</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">TV</div>
                    <div className="mt-1 text-sm font-medium text-foreground">Timer only</div>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">{simpleTimingSummary}</div>
              </div>
            ) : simpleTemplatePlan.rounds.length > 0 ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-card p-3 text-sm text-foreground">{simpleGameSummaryText}</div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Round mix</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{simpleTemplatePlan.standardCount} Standard, {simpleTemplatePlan.quickfireCount} Quickfire</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Joker</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{simpleJokerSummary}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Packs</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{!selectPacks ? "All active packs" : selectedPackCount > 0 ? `${selectedPackCount} selected` : "Choose pack"}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Audio</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{audioModeLabel(audioMode)}</div>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">{simpleTimingSummary}</div>
                {simpleTemplatePlan.notes.length ? (
                  <div className="space-y-2">
                    {simpleTemplatePlan.notes.map((note: string) => (
                      <div key={note} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{note}</div>
                    ))}
                  </div>
                ) : null}
                {simpleUnavailableTemplateExamples.length ? (
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Templates not ready now</div>
                    {simpleUnavailableTemplateExamples.map((template: UnavailableTemplate) => (
                      <div key={template.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                        <div className="font-medium text-foreground">{getRoundTemplateDisplayName(template as any)}</div>
                        <div className={template.explanation.tone === "error" ? "mt-1 text-red-700 dark:text-red-200" : "mt-1 text-amber-700 dark:text-amber-200"}>{template.explanation.summary}</div>
                        {template.explanation.detail ? <div className="mt-1 text-xs text-muted-foreground">{template.explanation.detail}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{simpleTemplatePlan.error ?? "No simple plan is ready yet."}</div>
            )}
          </div>
        ) : null}
      </div>

      {simpleGameType === "recommended" ? (
        <div className="rounded-2xl border border-border">
          <button type="button" className="flex w-full items-start justify-between gap-3 p-3 text-left" onClick={() => setShowSimpleRecommendedRounds((prev: boolean) => !prev)}>
            <div>
              <div className="text-sm font-semibold text-foreground">Preview rounds</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Ready now: {simpleTemplatePlan.availableTemplateCount} template{simpleTemplatePlan.availableTemplateCount === 1 ? "" : "s"}, with {simpleTemplatePlan.availableStandardCount} standard and {simpleTemplatePlan.availableQuickfireCount} Quickfire.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{simpleTemplatePlan.jokerEligibleCount >= 2 ? "Joker ready" : "Joker hidden"}</div>
              <div className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{showSimpleRecommendedRounds ? "Hide" : "Show"}</div>
            </div>
          </button>

          {showSimpleRecommendedRounds ? (
            <div className="border-t border-border p-3">
              {simpleFeasibilityBusy ? (
                <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">Checking ready templates...</div>
              ) : simpleFeasibilityError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{simpleFeasibilityError}</div>
              ) : simpleTemplatePlan.rounds.length > 0 ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {simpleTemplatePlan.rounds.map((round: PlannedRound, index: number) => (
                      <div key={round.id} className="rounded-xl border border-border bg-card p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{index + 1}. {round.name}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${roundBehaviourBadgeClass(round.behaviourType)}`}>{roundBehaviourLabel(round.behaviourType)}</span>
                          {round.jokerEligible ? <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">Joker eligible</span> : null}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {round.behaviourType === "heads_up" ? "All active cards from the selected pack." : `${round.questionCount} question${round.questionCount === 1 ? "" : "s"}.`} {round.answerSeconds}s {round.behaviourType === "heads_up" ? "turn" : "answer window"}, {round.roundReviewSeconds}s round review.
                        </div>
                      </div>
                    ))}
                  </div>
                  {simpleTemplatePlan.notes.length ? (
                    <div className="space-y-2">
                      {simpleTemplatePlan.notes.map((note: string) => (
                        <div key={note} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{note}</div>
                      ))}
                    </div>
                  ) : null}
                  <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">Simple mode uses the audio setting you choose here, standard timing defaults, and only templates that are currently feasible for the chosen pack scope.</div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{simpleTemplatePlan.error ?? "No simple plan is ready yet."}</div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
