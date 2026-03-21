"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"

const textareaClassName =
  "min-h-[160px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-border"

const resultClassName =
  "min-h-[96px] whitespace-pre-wrap rounded-lg border border-border bg-muted px-3 py-3 text-xs text-foreground"

const labelClassName = "text-sm font-medium text-foreground"
const helperClassName = "text-xs text-muted-foreground"
const fileSummaryClassName = "text-sm text-muted-foreground"

type MediaBucket = "audio" | "images"

type AudioDurationRow = {
  filename: string
  durationMs: number | null
}

async function probeAudioDurationMs(file: File) {
  const objectUrl = URL.createObjectURL(file)

  try {
    const durationMs = await new Promise<number | null>((resolve) => {
      const audio = document.createElement("audio")
      audio.preload = "metadata"
      audio.src = objectUrl
      audio.onloadedmetadata = () => {
        if (!Number.isFinite(audio.duration) || audio.duration < 0) {
          resolve(null)
          return
        }
        resolve(Math.round(audio.duration * 1000))
      }
      audio.onerror = () => resolve(null)
    })

    return durationMs
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function readSelectedCsv(file: File | null, text: string) {
  if (file) return await file.text()
  return text
}

export default function AdminImportPage() {
  const questionFileInputRef = useRef<HTMLInputElement | null>(null)
  const headsUpFileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null)

  const [token, setToken] = useState("")
  const cleanToken = token.trim()

  const [questionCsvFile, setQuestionCsvFile] = useState<File | null>(null)
  const [questionCsvText, setQuestionCsvText] = useState("")
  const [questionBusy, setQuestionBusy] = useState(false)
  const [questionResult, setQuestionResult] = useState("")

  const [headsUpCsvFile, setHeadsUpCsvFile] = useState<File | null>(null)
  const [headsUpCsvText, setHeadsUpCsvText] = useState("")
  const [headsUpBusy, setHeadsUpBusy] = useState(false)
  const [headsUpResult, setHeadsUpResult] = useState("")

  const [mediaBucket, setMediaBucket] = useState<MediaBucket>("audio")
  const [mediaFolder, setMediaFolder] = useState("")
  const [mediaUpsert, setMediaUpsert] = useState(true)
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [mediaBusy, setMediaBusy] = useState(false)
  const [mediaResult, setMediaResult] = useState("")
  const [audioDurations, setAudioDurations] = useState<AudioDurationRow[]>([])

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("mtq_admin_token") ?? ""
      if (saved) setToken(saved)
    } catch {
      // ignore
    }
  }, [])

  function persistToken() {
    try {
      sessionStorage.setItem("mtq_admin_token", cleanToken)
    } catch {
      // ignore
    }
  }

  function clearToken() {
    setToken("")
    try {
      sessionStorage.removeItem("mtq_admin_token")
    } catch {
      // ignore
    }
  }

  const canRunQuestionImport = useMemo(() => {
    return cleanToken.length > 0 && (!!questionCsvFile || questionCsvText.trim().length > 0) && !questionBusy
  }, [cleanToken, questionCsvFile, questionCsvText, questionBusy])

  const canRunHeadsUpImport = useMemo(() => {
    return cleanToken.length > 0 && (!!headsUpCsvFile || headsUpCsvText.trim().length > 0) && !headsUpBusy
  }, [cleanToken, headsUpCsvFile, headsUpCsvText, headsUpBusy])

  const canUploadMedia = useMemo(() => {
    return cleanToken.length > 0 && mediaFiles.length > 0 && !mediaBusy
  }, [cleanToken, mediaFiles, mediaBusy])

  async function runQuestionImport(validateOnly: boolean) {
    setQuestionBusy(true)
    setQuestionResult("")

    try {
      if (!cleanToken) {
        setQuestionResult('{"error":"Missing admin token"}')
        return
      }

      const textToSend = await readSelectedCsv(questionCsvFile, questionCsvText)
      if (!textToSend.trim()) {
        setQuestionResult('{"error":"No CSV content to upload"}')
        return
      }

      persistToken()

      const res = await fetch(`/api/admin/import-questions?validateOnly=${validateOnly ? "true" : "false"}`, {
        method: "POST",
        headers: {
          "x-admin-token": cleanToken,
          "Content-Type": "text/csv",
        },
        body: textToSend,
      })

      const body = await res.text()
      setQuestionResult(body || `(no response body, status ${res.status})`)
    } catch (error) {
      setQuestionResult(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setQuestionBusy(false)
    }
  }

  async function runHeadsUpImport(validateOnly: boolean) {
    setHeadsUpBusy(true)
    setHeadsUpResult("")

    try {
      if (!cleanToken) {
        setHeadsUpResult('{"error":"Missing admin token"}')
        return
      }

      const textToSend = await readSelectedCsv(headsUpCsvFile, headsUpCsvText)
      if (!textToSend.trim()) {
        setHeadsUpResult('{"error":"No CSV content to upload"}')
        return
      }

      persistToken()

      const res = await fetch(`/api/admin/import-heads-up?validateOnly=${validateOnly ? "true" : "false"}`, {
        method: "POST",
        headers: {
          "x-admin-token": cleanToken,
          "Content-Type": "text/csv",
        },
        body: textToSend,
      })

      const body = await res.text()
      setHeadsUpResult(body || `(no response body, status ${res.status})`)
    } catch (error) {
      setHeadsUpResult(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setHeadsUpBusy(false)
    }
  }

  function clearMediaSelection() {
    setMediaFiles([])
    setAudioDurations([])
    if (mediaFileInputRef.current) mediaFileInputRef.current.value = ""
  }

  async function handleMediaFileChange(nextFiles: File[]) {
    setMediaFiles(nextFiles)
    setMediaResult("")

    if (mediaBucket !== "audio") {
      setAudioDurations([])
      return
    }

    const durations = await Promise.all(
      nextFiles.map(async (file) => ({
        filename: file.name,
        durationMs: await probeAudioDurationMs(file),
      }))
    )

    setAudioDurations(durations)
  }

  async function uploadMedia() {
    setMediaBusy(true)
    setMediaResult("")

    try {
      if (!cleanToken) {
        setMediaResult('{"error":"Missing admin token"}')
        return
      }

      if (!mediaFiles.length) {
        setMediaResult('{"error":"No files selected"}')
        return
      }

      persistToken()

      const form = new FormData()
      form.append("bucket", mediaBucket)
      if (mediaFolder.trim()) form.append("folder", mediaFolder.trim())
      form.append("upsert", mediaUpsert ? "true" : "false")

      for (const file of mediaFiles) {
        form.append("files", file)
      }

      const res = await fetch("/api/admin/upload-media", {
        method: "POST",
        headers: { "x-admin-token": cleanToken },
        body: form,
      })

      const text = await res.text()
      if (!res.ok) {
        setMediaResult(text || `(upload failed, status ${res.status})`)
        return
      }

      let json: unknown = null
      try {
        json = JSON.parse(text)
      } catch {
        setMediaResult(text || "Could not parse response JSON")
        return
      }

      const data = (json ?? {}) as {
        ok?: boolean
        bucket?: string
        uploadedCount?: number
        failedCount?: number
        uploaded?: Array<{ filename?: string; path?: string }>
        failed?: unknown
      }

      const durationByFilename = new Map(audioDurations.map((item) => [item.filename, item.durationMs]))
      const friendly = {
        ok: data.ok,
        bucket: data.bucket,
        uploadedCount: data.uploadedCount,
        failedCount: data.failedCount,
        uploaded: (data.uploaded ?? []).map((item) => ({
          filename: item.filename,
          path: item.path,
          media_duration_ms: mediaBucket === "audio" ? durationByFilename.get(String(item.filename ?? "")) ?? null : null,
        })),
        failed: data.failed,
      }

      setMediaResult(JSON.stringify(friendly, null, 2))
    } catch (error) {
      setMediaResult(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setMediaBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <div className="text-2xl font-semibold">Admin import and media tools</div>
        <div className="text-sm text-muted-foreground">
          Validate CSVs before import, keep the question import format in sync with the current app, and bulk upload media.
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Question CSV import</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={helperClassName}>
                Official format now includes <code>media_duration_ms</code> and <code>audio_clip_type</code>. Legacy <code>pack_sort_order</code> is still tolerated but ignored.
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => questionFileInputRef.current?.click()}>
                  Choose CSV file
                </Button>
                <div className={fileSummaryClassName}>
                  {questionCsvFile
                    ? `Selected: ${questionCsvFile.name} (${Math.round(questionCsvFile.size / 1024)} KB)`
                    : "No file selected."}
                </div>
              </div>

              <input
                ref={questionFileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => setQuestionCsvFile(event.target.files?.[0] ?? null)}
                className="sr-only"
                tabIndex={-1}
              />

              <div className="grid gap-2">
                <div className={labelClassName}>Or paste question CSV</div>
                <textarea
                  value={questionCsvText}
                  onChange={(event) => setQuestionCsvText(event.target.value)}
                  placeholder="Paste question CSV here"
                  className={textareaClassName}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button disabled={!canRunQuestionImport} onClick={() => void runQuestionImport(true)}>
                  {questionBusy ? "Working..." : "Validate question CSV"}
                </Button>
                <Button variant="secondary" disabled={!canRunQuestionImport} onClick={() => void runQuestionImport(false)}>
                  {questionBusy ? "Working..." : "Import questions"}
                </Button>
              </div>

              <div className="grid gap-2">
                <div className={labelClassName}>Question import result</div>
                <pre className={resultClassName}>{questionResult || "No question CSV import run yet."}</pre>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Heads Up CSV import</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={helperClassName}>
                One CSV row should describe one Heads Up item. The importer will create any missing Heads Up packs named in <code>pack_names</code> and replace the item’s pack membership with the names supplied in that row.
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => headsUpFileInputRef.current?.click()}>
                  Choose CSV file
                </Button>
                <div className={fileSummaryClassName}>
                  {headsUpCsvFile
                    ? `Selected: ${headsUpCsvFile.name} (${Math.round(headsUpCsvFile.size / 1024)} KB)`
                    : "No file selected."}
                </div>
              </div>

              <input
                ref={headsUpFileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => setHeadsUpCsvFile(event.target.files?.[0] ?? null)}
                className="sr-only"
                tabIndex={-1}
              />

              <div className="grid gap-2">
                <div className={labelClassName}>Or paste Heads Up CSV</div>
                <textarea
                  value={headsUpCsvText}
                  onChange={(event) => setHeadsUpCsvText(event.target.value)}
                  placeholder="Paste Heads Up CSV here"
                  className={textareaClassName}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button disabled={!canRunHeadsUpImport} onClick={() => void runHeadsUpImport(true)}>
                  {headsUpBusy ? "Working..." : "Validate Heads Up CSV"}
                </Button>
                <Button variant="secondary" disabled={!canRunHeadsUpImport} onClick={() => void runHeadsUpImport(false)}>
                  {headsUpBusy ? "Working..." : "Import Heads Up items"}
                </Button>
              </div>

              <div className="grid gap-2">
                <div className={labelClassName}>Heads Up import result</div>
                <pre className={resultClassName}>{headsUpResult || "No Heads Up CSV import run yet."}</pre>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bulk media upload</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={helperClassName}>
                Upload audio or images to Supabase Storage, then copy the returned bucket-relative paths into your CSV. For audio, this tool also tries to detect <code>media_duration_ms</code> from the selected files.
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <div className={labelClassName}>Bucket</div>
                  <select
                    value={mediaBucket}
                    onChange={(event) => {
                      const nextBucket = event.target.value === "images" ? "images" : "audio"
                      setMediaBucket(nextBucket)
                      setAudioDurations([])
                    }}
                    className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-border"
                  >
                    <option value="audio">audio</option>
                    <option value="images">images</option>
                  </select>
                </div>

                <div className="grid gap-2">
                  <div className={labelClassName}>Folder (optional)</div>
                  <Input
                    value={mediaFolder}
                    onChange={(event) => setMediaFolder(event.target.value)}
                    placeholder="Example: 2026-03-21"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={mediaUpsert} onChange={(event) => setMediaUpsert(event.target.checked)} />
                <span>Overwrite files with the same name</span>
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => mediaFileInputRef.current?.click()}>
                  Choose files
                </Button>
                <Button variant="secondary" onClick={clearMediaSelection}>
                  Clear selection
                </Button>
                <div className={fileSummaryClassName}>
                  {mediaFiles.length > 0 ? `${mediaFiles.length} file(s) selected` : "No files selected."}
                </div>
              </div>

              <input
                ref={mediaFileInputRef}
                type="file"
                multiple
                accept={mediaBucket === "audio" ? "audio/*" : "image/*"}
                onChange={(event) => void handleMediaFileChange(Array.from(event.target.files ?? []))}
                className="sr-only"
                tabIndex={-1}
              />

              {mediaBucket === "audio" && audioDurations.length > 0 ? (
                <div className="rounded-lg border border-border bg-muted px-3 py-3">
                  <div className="mb-2 text-sm font-medium text-foreground">Detected audio durations</div>
                  <div className="grid gap-1 text-sm text-muted-foreground">
                    {audioDurations.map((item) => (
                      <div key={item.filename}>
                        {item.filename}: {item.durationMs == null ? "Could not detect" : `${item.durationMs} ms`}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button disabled={!canUploadMedia} onClick={() => void uploadMedia()}>
                  {mediaBusy ? "Uploading..." : "Upload files"}
                </Button>
              </div>

              <div className="grid gap-2">
                <div className={labelClassName}>Media upload result</div>
                <pre className={resultClassName}>{mediaResult || "No media upload run yet."}</pre>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 self-start">
          <Card>
            <CardHeader>
              <CardTitle>Admin token</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste ADMIN_TOKEN here"
                autoComplete="off"
                spellCheck={false}
              />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={clearToken}>
                  Clear token
                </Button>
              </div>
              <div className={helperClassName}>Stored in session storage for this browser tab only.</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current CSV formats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <div className={labelClassName}>Question import column order</div>
                <pre className={resultClassName}>pack_id,pack_name,pack_round_type,question_id,question_round_type,answer_type,question_text,option_a,option_b,option_c,option_d,answer_index,answer_text,accepted_answers,explanation,audio_path,image_path,media_duration_ms,audio_clip_type</pre>
              </div>

              <div className="grid gap-2">
                <div className={labelClassName}>Heads Up import column order</div>
                <pre className={resultClassName}>item_id,answer_text,item_type,person_roles,difficulty,primary_show_key,notes,is_active,pack_names</pre>
              </div>

              <div className="grid gap-2 text-sm text-muted-foreground">
                <div>Question CSV guide: <code>docs/question-writing-standards.md</code></div>
                <div>Heads Up CSV guide: <code>docs/heads-up-writing-standards.md</code></div>
                <div>Question template: <code>docs/questions_csv/question-import-template.csv</code></div>
                <div>Heads Up template: <code>docs/heads_up_csv/heads-up-import-template.csv</code></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
