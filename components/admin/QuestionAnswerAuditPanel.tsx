"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

type AuditIssue = {
  code: string
  message: string
}

type HelperSuggestion = {
  label: string
  value: string
  reason: string
}

type DetailItem = {
  question: {
    id: string
    text: string
    answer_type: string
    answer_text: string | null
    explanation: string | null
    accepted_answers: unknown
    options?: unknown
    answer_index?: number | null
  }
  audit: {
    likelyProblem: boolean
    summaryBadges: string[]
    textNeedsAcceptedAnswersReview: boolean
    mcqHasIssues: boolean
    text: {
      canonicalRaw: string
      canonicalNormalised: string
      acceptedAnswers: string[]
      acceptedNormalised: string[]
      helperSuggestions: HelperSuggestion[]
      issues: AuditIssue[]
      needsAcceptedAnswersReview: boolean
    } | null
    mcq: {
      options: Array<{
        index: number
        label: string
        value: string
        normalised: string
      }>
      issues: AuditIssue[]
      duplicateOptionGroups: string[][]
    } | null
  }
}

type Props = {
  item: DetailItem | null
  adminToken: string
  onSaved: (questionId: string) => Promise<void>
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

function fieldCardClass() {
  return "rounded-lg border border-border bg-muted/30 p-3"
}

function metadataFieldNameClass() {
  return "text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground"
}

function metadataInputClass() {
  return "h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-border"
}

function metadataTextAreaClass() {
  return "min-h-[84px] rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-border"
}

function pillClass(tone: "default" | "success" | "warning" | "accent" = "default") {
  if (tone === "success") {
    return "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
  }

  if (tone === "warning") {
    return "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
  }

  if (tone === "accent") {
    return "inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700"
  }

  return "inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
}

function parseAcceptedAnswersEditorValue(value: string) {
  const rawParts = value
    .split(/\r?\n|\|/)
    .map((part) => part.trim())
    .filter(Boolean)

  const seen = new Set<string>()
  const out: string[] = []

  for (const part of rawParts) {
    const key = part.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(part)
  }

  return out
}

function joinAcceptedAnswersForEditor(values: string[]) {
  return values.join("\n")
}

function buildAdminHeaders(token: string) {
  return {
    "x-admin-token": token.trim(),
  }
}

export function QuestionAnswerAuditPanel({ item, adminToken, onSaved }: Props) {
  const [questionText, setQuestionText] = useState("")
  const [explanationText, setExplanationText] = useState("")
  const [textAnswer, setTextAnswer] = useState("")
  const [acceptedAnswersText, setAcceptedAnswersText] = useState("")
  const [mcqOptions, setMcqOptions] = useState(["", "", "", ""])
  const [mcqAnswerIndex, setMcqAnswerIndex] = useState(0)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveResult, setSaveResult] = useState("")

  useEffect(() => {
    setSaveResult("")

    if (!item) {
      setQuestionText("")
      setExplanationText("")
      setTextAnswer("")
      setAcceptedAnswersText("")
      setMcqOptions(["", "", "", ""])
      setMcqAnswerIndex(0)
      return
    }

    setQuestionText(String(item.question.text ?? ""))
    setExplanationText(String(item.question.explanation ?? ""))
    setTextAnswer(String(item.question.answer_text ?? item.audit.text?.canonicalRaw ?? ""))
    setAcceptedAnswersText(joinAcceptedAnswersForEditor(item.audit.text?.acceptedAnswers ?? []))
    setMcqOptions(
      item.audit.mcq?.options.map((option) => option.value) ??
        [0, 1, 2, 3].map((index) => String((item.question.options as string[] | undefined)?.[index] ?? ""))
    )
    setMcqAnswerIndex(Number.isFinite(Number(item.question.answer_index)) ? Number(item.question.answer_index) : 0)
  }, [item])

  const parsedAcceptedAnswers = useMemo(() => parseAcceptedAnswersEditorValue(acceptedAnswersText), [acceptedAnswersText])

  async function saveQuestionContent() {
    if (!item || !adminToken.trim()) {
      setSaveResult("Enter your admin token first.")
      return
    }

    if (!questionText.trim()) {
      setSaveResult("Question text is required.")
      return
    }

    setSaveBusy(true)
    setSaveResult("")

    try {
      const res = await fetch(`/api/admin/questions/${item.question.id}`, {
        method: "PATCH",
        headers: {
          ...buildAdminHeaders(adminToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: questionText.trim(),
          explanation: explanationText.trim(),
        }),
      })

      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setSaveResult(json.error || "Could not save question content.")
        return
      }

      setSaveResult("Saved question content.")
      await onSaved(item.question.id)
    } catch (error: any) {
      setSaveResult(error?.message || "Could not save question content.")
    } finally {
      setSaveBusy(false)
    }
  }

  async function saveTextAnswer() {
    if (!item || !adminToken.trim()) {
      setSaveResult("Enter your admin token first.")
      return
    }

    setSaveBusy(true)
    setSaveResult("")

    try {
      const res = await fetch(`/api/admin/questions/${item.question.id}/answer`, {
        method: "PATCH",
        headers: {
          ...buildAdminHeaders(adminToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          answerText: textAnswer.trim(),
          acceptedAnswers: parsedAcceptedAnswers.length ? parsedAcceptedAnswers : null,
        }),
      })

      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setSaveResult(json.error || "Could not save text-answer settings.")
        return
      }

      setSaveResult("Saved answer settings.")
      await onSaved(item.question.id)
    } catch (error: any) {
      setSaveResult(error?.message || "Could not save text-answer settings.")
    } finally {
      setSaveBusy(false)
    }
  }

  async function saveMcqAnswer() {
    if (!item || !adminToken.trim()) {
      setSaveResult("Enter your admin token first.")
      return
    }

    setSaveBusy(true)
    setSaveResult("")

    try {
      const res = await fetch(`/api/admin/questions/${item.question.id}/answer`, {
        method: "PATCH",
        headers: {
          ...buildAdminHeaders(adminToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          options: mcqOptions,
          answerIndex: mcqAnswerIndex,
        }),
      })

      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setSaveResult(json.error || "Could not save MCQ options.")
        return
      }

      setSaveResult("Saved MCQ options.")
      await onSaved(item.question.id)
    } catch (error: any) {
      setSaveResult(error?.message || "Could not save MCQ options.")
    } finally {
      setSaveBusy(false)
    }
  }

  function addAcceptedAnswerSuggestion(value: string) {
    const next = parseAcceptedAnswersEditorValue(`${acceptedAnswersText}\n${value}`.trim())
    setAcceptedAnswersText(joinAcceptedAnswersForEditor(next))
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Answer editing</CardTitle>
          {item?.audit?.summaryBadges?.length ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              {item.audit.summaryBadges.map((badge) => (
                <span key={badge} className={pillClass(item.audit.likelyProblem ? "warning" : "default")}>
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {!item ? (
          <div className="text-sm text-muted-foreground">Select a question to review and edit its answer setup.</div>
        ) : (
          <>
            <div className={fieldCardClass()}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-foreground">Question content</div>
                <div className="flex flex-wrap gap-1.5">
                  <span className={pillClass(questionText.trim() ? "default" : "warning")}>
                    stem {questionText.trim() ? `${questionText.trim().length} chars` : "blank"}
                  </span>
                  <span className={pillClass(explanationText.trim() ? "default" : "warning")}>
                    explanation {explanationText.trim() ? `${explanationText.trim().length} chars` : "blank"}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid gap-3">
                <label>
                  <div className={metadataFieldNameClass()}>Question text</div>
                  <textarea
                    value={questionText}
                    onChange={(event) => setQuestionText(event.target.value)}
                    className={cx(metadataTextAreaClass(), "mt-2 min-h-[120px] w-full whitespace-pre-wrap")}
                    placeholder="Edit the question stem here"
                  />
                  <div className="mt-2 text-xs text-muted-foreground">
                    Use real line breaks where needed. Lyric and excerpt formatting should stay multiline where appropriate.
                  </div>
                </label>

                <label>
                  <div className={metadataFieldNameClass()}>Explanation</div>
                  <textarea
                    value={explanationText}
                    onChange={(event) => setExplanationText(event.target.value)}
                    className={cx(metadataTextAreaClass(), "mt-2 min-h-[96px] w-full whitespace-pre-wrap")}
                    placeholder="Edit the explanation shown on reveal and in admin"
                  />
                  <div className="mt-2 text-xs text-muted-foreground">
                    Keep it short and useful. Confirm the answer and add just enough context to support the host.
                  </div>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={saveQuestionContent}
                  disabled={saveBusy || !questionText.trim()}
                >
                  {saveBusy ? "Saving…" : "Save question content"}
                </Button>
              </div>
            </div>

            {item.question.answer_type === "text" ? (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className={fieldCardClass()}>
                    <div className={metadataFieldNameClass()}>Canonical answer</div>
                    <input
                      value={textAnswer}
                      onChange={(event) => setTextAnswer(event.target.value)}
                      className={cx(metadataInputClass(), "mt-2 w-full")}
                      placeholder="Enter the main accepted title or answer"
                    />
                    <div className="mt-2 text-xs text-muted-foreground">
                      This is the answer shown to the host and used as the main matcher target.
                    </div>
                  </label>

                  <label className={fieldCardClass()}>
                    <div className={metadataFieldNameClass()}>Accepted answers</div>
                    <textarea
                      value={acceptedAnswersText}
                      onChange={(event) => setAcceptedAnswersText(event.target.value)}
                      className={cx(metadataTextAreaClass(), "mt-2 w-full")}
                      placeholder="One fair variant per line"
                    />
                    <div className="mt-2 text-xs text-muted-foreground">
                      Use one line per fair human variant. Keep this tight and intentional.
                    </div>
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className={fieldCardClass()}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-foreground">Normalised preview</div>
                      <span className={pillClass(item.audit.text?.needsAcceptedAnswersReview ? "warning" : "default")}>
                        {item.audit.text?.needsAcceptedAnswersReview ? "review suggested" : "looks fine"}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <div className="rounded-md border border-border bg-background/70 px-2.5 py-2">
                        <div className={metadataFieldNameClass()}>Canonical normalised</div>
                        <div className="mt-1 text-sm text-foreground">
                          {item.audit.text?.canonicalNormalised || "Blank"}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-background/70 px-2.5 py-2">
                        <div className={metadataFieldNameClass()}>Accepted normalised</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {item.audit.text?.acceptedNormalised?.length ? (
                            item.audit.text?.acceptedNormalised?.map((value) => (
                              <span key={value} className={pillClass()}>
                                {value}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">No accepted variants saved.</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      Case, punctuation, apostrophes, spacing, and leading articles already normalise in live matching.
                    </div>
                  </div>

                  <div className={fieldCardClass()}>
                    <div className="text-sm font-medium text-foreground">Safe helper suggestions</div>
                    <div className="mt-2 space-y-2">
                      {item.audit.text?.helperSuggestions?.length ? (
                        item.audit.text?.helperSuggestions?.map((suggestion) => (
                          <div key={suggestion.value} className="rounded-md border border-border bg-background/70 px-2.5 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-medium text-foreground">{suggestion.value}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{suggestion.reason}</div>
                              </div>
                              <Button size="sm" variant="secondary" onClick={() => addAcceptedAnswerSuggestion(suggestion.value)}>
                                {suggestion.label}
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-md border border-border bg-background/70 px-2.5 py-2 text-sm text-muted-foreground">
                          No safe automatic suggestions for this answer.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className={fieldCardClass()}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-foreground">Audit flags</div>
                    <span className={pillClass(item.audit.text?.issues.length ? "warning" : "success")}>
                      {item.audit.text?.issues?.length
                        ? `${item.audit.text?.issues?.length ?? 0} flag${(item.audit.text?.issues?.length ?? 0) === 1 ? "" : "s"}`
                        : "No flags"}
                    </span>
                  </div>
                  {item.audit.text?.issues?.length ? (
                    <div className="mt-3 space-y-2">
                      {item.audit.text?.issues?.map((issue) => (
                        <div key={issue.code} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                          {issue.message}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-muted-foreground">No obvious text-answer issues surfaced for this question.</div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={saveTextAnswer} disabled={saveBusy}>
                    {saveBusy ? "Saving…" : "Save answer settings"}
                  </Button>
                </div>
              </>
            ) : item.question.answer_type === "mcq" ? (
              <>
                <div className={fieldCardClass()}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-foreground">MCQ distractor editor</div>
                    <span className={pillClass(item.audit.mcqHasIssues ? "warning" : "default")}>
                      {item.audit.mcqHasIssues ? "needs review" : "ready to refine"}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {mcqOptions.map((option, index) => {
                      const optionLabel = String.fromCharCode(65 + index)
                      return (
                        <div key={optionLabel} className="grid gap-2 rounded-md border border-border bg-background/70 p-2 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
                          <label className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                            <input
                              type="radio"
                              name="mcq-correct-answer"
                              checked={mcqAnswerIndex === index}
                              onChange={() => setMcqAnswerIndex(index)}
                            />
                            Correct {optionLabel}
                          </label>
                          <input
                            value={option}
                            onChange={(event) => {
                              const next = [...mcqOptions]
                              next[index] = event.target.value
                              setMcqOptions(next)
                            }}
                            className={metadataInputClass()}
                            placeholder={`Option ${optionLabel}`}
                          />
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Use this when playtesting shows a distractor is too obvious, too weak, or too close to another option.
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className={fieldCardClass()}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-foreground">MCQ audit flags</div>
                      <span className={pillClass(item.audit.mcq?.issues.length ? "warning" : "success")}>
                        {item.audit.mcq?.issues?.length
                          ? `${item.audit.mcq?.issues?.length ?? 0} flag${(item.audit.mcq?.issues?.length ?? 0) === 1 ? "" : "s"}`
                          : "No flags"}
                      </span>
                    </div>
                    {item.audit.mcq?.issues?.length ? (
                      <div className="mt-3 space-y-2">
                        {item.audit.mcq?.issues?.map((issue) => (
                          <div key={issue.code} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            {issue.message}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-muted-foreground">No obvious MCQ structure issues surfaced for this question.</div>
                    )}
                  </div>

                  <div className={fieldCardClass()}>
                    <div className="text-sm font-medium text-foreground">Normalised option preview</div>
                    <div className="mt-3 space-y-2">
                      {item.audit.mcq?.options?.map((option) => (
                        <div key={option.label} className="rounded-md border border-border bg-background/70 px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className={pillClass(option.index === item.question.answer_index ? "accent" : "default")}>
                              {option.label}
                            </span>
                            <span className="text-xs text-muted-foreground">{option.normalised || "Blank"}</span>
                          </div>
                          <div className="mt-1 text-sm text-foreground">{option.value || "Blank"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={saveMcqAnswer} disabled={saveBusy}>
                    {saveBusy ? "Saving…" : "Save MCQ options"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">This answer type does not have an editor here.</div>
            )}
          </>
        )}

        {saveResult ? (
          <div
            className={cx(
              "rounded-lg px-3 py-2 text-sm",
              saveResult.toLowerCase().startsWith("saved")
                ? "border border-green-300 bg-green-50 text-green-700"
                : "border border-red-300 bg-red-50 text-red-700"
            )}
          >
            {saveResult}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
