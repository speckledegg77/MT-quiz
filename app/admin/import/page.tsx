"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

type ImportTool = "" | "questions" | "spotlight" | "media"
type MediaBucket = "audio" | "images"

type AudioDurationRow = {
  filename: string
  durationMs: number | null
}

const inputClassName =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground"
const mutedBoxClassName =
  "rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
const resultClassName =
  "min-h-28 rounded-lg border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap break-words"

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

function buildAdminHeaders(token: string, validateOnly = false) {
  return {
    "x-admin-token": token.trim(),
    ...(validateOnly ? { "x-validate-only": "true" } : {}),
  }
}

export default function AdminImportPage() {
  const questionsFileInputRef = useRef<HTMLInputElement | null>(null)
  const spotlightFileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null)

  const [token, setToken] = useState("")
  const cleanToken = token.trim()

  const [selectedTool, setSelectedTool] = useState<ImportTool>("")

  const [questionsFile, setQuestionsFile] = useState<File | null>(null)
  const [questionsText, setQuestionsText] = useState("")
  const [questionsBusy, setQuestionsBusy] = useState(false)
  const [questionsResult, setQuestionsResult] = useState("")

  const [spotlightFile, setSpotlightFile] = useState<File | null>(null)
  const [spotlightText, setSpotlightText] = useState("")
  const [spotlightBusy, setSpotlightBusy] = useState(false)
  const [spotlightResult, setSpotlightResult] = useState("")

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

  const canUploadQuestions = useMemo(() => {
    return cleanToken.length > 0 && (!!questionsFile || questionsText.trim().length > 0) && !questionsBusy
  }, [cleanToken, questionsFile, questionsText, questionsBusy])

  const canUploadSpotlight = useMemo(() => {
    return cleanToken.length > 0 && (!!spotlightFile || spotlightText.trim().length > 0) && !spotlightBusy
  }, [cleanToken, spotlightFile, spotlightText, spotlightBusy])

  const canUploadMedia = useMemo(() => {
    return cleanToken.length > 0 && mediaFiles.length > 0 && !mediaBusy
  }, [cleanToken, mediaFiles, mediaBusy])

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

  async function uploadCsv(options: {
    endpoint: string
    file: File | null
    text: string
    setBusy: (value: boolean) => void
    setResult: (value: string) => void
    validateOnly: boolean
  }) {
    options.setBusy(true)
    options.setResult("")

    try {
      if (!cleanToken) {
        options.setResult('{"error":"Missing admin token"}')
        return
      }

      let textToSend = options.text
      if (options.file) textToSend = await options.file.text()

      if (!textToSend || !textToSend.trim()) {
        options.setResult('{"error":"No CSV content to upload"}')
        return
      }

      persistToken()

      const res = await fetch(options.endpoint, {
        method: "POST",
        headers: {
          ...buildAdminHeaders(cleanToken, options.validateOnly),
          "Content-Type": "text/csv",
        },
        body: textToSend,
      })

      const body = await res.text()
      options.setResult(body || `(no response body, status ${res.status})`)
    } catch (error: any) {
      options.setResult(error?.message ?? "Upload failed")
    } finally {
      options.setBusy(false)
    }
  }

  async function uploadMedia() {
    setMediaBusy(true)
    setMediaResult("")

    try {
      if (!cleanToken) {
        setMediaResult('{"error":"Missing admin token"}')
        return
      }

      if (mediaFiles.length === 0) {
        setMediaResult('{"error":"No files selected"}')
        return
      }

      persistToken()

      const form = new FormData()
      form.append("bucket", mediaBucket)
      if (mediaFolder.trim()) form.append("folder", mediaFolder.trim())
      form.append("upsert", mediaUpsert ? "true" : "false")

      for (const file of mediaFiles) form.append("files", file)

      const res = await fetch("/api/admin/upload-media", {
        method: "POST",
        headers: buildAdminHeaders(cleanToken),
        body: form,
      })

      const text = await res.text()
      if (!res.ok) {
        setMediaResult(text || `(upload failed, status ${res.status})`)
        return
      }

      let json: any = null
      try {
        json = JSON.parse(text)
      } catch {
        setMediaResult(text || "Could not parse response JSON")
        return
      }

      const uploaded = Array.isArray(json?.uploaded) ? json.uploaded : []
      const durationByFilename = new Map(audioDurations.map((item) => [item.filename, item.durationMs]))

      const friendly = {
        ok: json?.ok,
        bucket: json?.bucket,
        uploadedCount: json?.uploadedCount,
        failedCount: json?.failedCount,
        uploaded: uploaded.map((item: any) => ({
          filename: item?.filename,
          path: item?.path,
          media_duration_ms:
            mediaBucket === "audio" ? durationByFilename.get(String(item?.filename ?? "")) ?? null : null,
        })),
        failed: json?.failed,
      }

      setMediaResult(JSON.stringify(friendly, null, 2))
    } catch (error: any) {
      setMediaResult(error?.message ?? "Upload failed")
    } finally {
      setMediaBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">Admin Import</div>
          <div className="text-sm text-muted-foreground">
            Import question CSVs, Spotlight CSVs, or upload media in bulk.
          </div>
        </div>

        <Link href="/admin">
          <Button variant="secondary">Back to Admin</Button>
        </Link>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Admin token</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap gap-3">
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste ADMIN_TOKEN here"
                autoComplete="off"
                spellCheck={false}
                className={`${inputClassName} flex-1 min-w-[280px]`}
              />
              <Button variant="secondary" onClick={clearToken}>
                Clear token
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              The token is stored in this browser session only.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Choose import tool</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <select
              value={selectedTool}
              onChange={(event) => setSelectedTool(event.target.value as ImportTool)}
              className={inputClassName}
            >
              <option value="">Select a tool</option>
              <option value="questions">Question CSV import</option>
              <option value="spotlight">Spotlight CSV import</option>
              <option value="media">Bulk media upload</option>
            </select>

            <div className="text-sm text-muted-foreground">
              {selectedTool === "questions" &&
                "Use this for normal quiz questions and pack links."}
              {selectedTool === "spotlight" &&
                "Use this for Spotlight items and pack assignment. Duplicate rows now update matching items instead of silently creating copies."}
              {selectedTool === "media" &&
                "Use this for bulk audio or image uploads to Supabase Storage."}
              {!selectedTool && "Choose one tool to keep this page tidy and reduce mix-ups."}
            </div>
          </CardContent>
        </Card>

        {selectedTool === "questions" ? (
          <Card>
            <CardHeader>
              <CardTitle>Question CSV import</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <div className="text-sm font-medium">Upload CSV file</div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={() => questionsFileInputRef.current?.click()}>
                    Choose CSV file
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    {questionsFile
                      ? `Selected: ${questionsFile.name} (${Math.round(questionsFile.size / 1024)} KB)`
                      : "No file selected."}
                  </div>
                </div>
                <input
                  ref={questionsFileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setQuestionsFile(event.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </div>

              <div className="grid gap-2">
                <div className="text-sm font-medium">Or paste CSV</div>
                <textarea
                  value={questionsText}
                  onChange={(event) => setQuestionsText(event.target.value)}
                  placeholder="Paste question CSV here"
                  rows={10}
                  className={inputClassName}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={!canUploadQuestions}
                  onClick={() =>
                    void uploadCsv({
                      endpoint: "/api/admin/import-questions",
                      file: questionsFile,
                      text: questionsText,
                      setBusy: setQuestionsBusy,
                      setResult: setQuestionsResult,
                      validateOnly: true,
                    })
                  }
                >
                  {questionsBusy ? "Working..." : "Validate question CSV"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!canUploadQuestions}
                  onClick={() =>
                    void uploadCsv({
                      endpoint: "/api/admin/import-questions",
                      file: questionsFile,
                      text: questionsText,
                      setBusy: setQuestionsBusy,
                      setResult: setQuestionsResult,
                      validateOnly: false,
                    })
                  }
                >
                  {questionsBusy ? "Working..." : "Import questions"}
                </Button>
              </div>

              <div className="grid gap-2">
                <div className="text-sm font-medium">Question import result</div>
                <pre className={resultClassName}>{questionsResult || "No question CSV upload yet."}</pre>
              </div>

              <div className="grid gap-2">
                <div className="text-sm font-medium">Question CSV reminder</div>
                <div className="text-xs text-muted-foreground">
                  The metadata columns are optional, but when provided they are imported and validated.
                </div>
                <pre className={mutedBoxClassName}>
                  {"pack_id,pack_name,pack_round_type,pack_sort_order,\nquestion_id,question_round_type,answer_type,question_text,\noption_a,option_b,option_c,option_d,answer_index,\nanswer_text,accepted_answers,explanation,audio_path,image_path,\nmedia_type,prompt_target,clue_source,primary_show_key,\nmedia_duration_ms,audio_clip_type"}
                </pre>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {selectedTool === "spotlight" ? (
          <Card>
            <CardHeader>
              <CardTitle>Spotlight CSV import</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <div className="text-sm font-medium">Upload CSV file</div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={() => spotlightFileInputRef.current?.click()}>
                    Choose CSV file
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    {spotlightFile
                      ? `Selected: ${spotlightFile.name} (${Math.round(spotlightFile.size / 1024)} KB)`
                      : "No file selected."}
                  </div>
                </div>
                <input
                  ref={spotlightFileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setSpotlightFile(event.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </div>

              <div className="grid gap-2">
                <div className="text-sm font-medium">Or paste CSV</div>
                <textarea
                  value={spotlightText}
                  onChange={(event) => setSpotlightText(event.target.value)}
                  placeholder="Paste Spotlight CSV here"
                  rows={10}
                  className={inputClassName}
                />
              </div>

              <div className={mutedBoxClassName}>
                If <code>item_id</code> is blank, the importer now checks for an existing match using answer text,
                item type, and primary show. A matching item updates instead of creating a duplicate.
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={!canUploadSpotlight}
                  onClick={() =>
                    void uploadCsv({
                      endpoint: "/api/admin/import-spotlight",
                      file: spotlightFile,
                      text: spotlightText,
                      setBusy: setSpotlightBusy,
                      setResult: setSpotlightResult,
                      validateOnly: true,
                    })
                  }
                >
                  {spotlightBusy ? "Working..." : "Validate Spotlight CSV"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!canUploadSpotlight}
                  onClick={() =>
                    void uploadCsv({
                      endpoint: "/api/admin/import-spotlight",
                      file: spotlightFile,
                      text: spotlightText,
                      setBusy: setSpotlightBusy,
                      setResult: setSpotlightResult,
                      validateOnly: false,
                    })
                  }
                >
                  {spotlightBusy ? "Working..." : "Import Spotlight CSV"}
                </Button>
              </div>

              <div className="grid gap-2">
                <div className="text-sm font-medium">Spotlight import result</div>
                <pre className={resultClassName}>{spotlightResult || "No Spotlight CSV upload yet."}</pre>
              </div>

              <div className="grid gap-2">
                <div className="text-sm font-medium">Spotlight CSV reminder</div>
                <pre className={mutedBoxClassName}>
                  {"item_id,answer_text,item_type,person_roles,difficulty,primary_show_key,notes,is_active,pack_names"}
                </pre>
              </div>

              <div className="text-xs text-muted-foreground">
                Use pipe-separated values for <code>person_roles</code> and <code>pack_names</code>.
              </div>
            </CardContent>
          </Card>
        ) : null}

        {selectedTool === "media" ? (
          <Card>
            <CardHeader>
              <CardTitle>Bulk media upload</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <div className="text-sm font-medium">Bucket</div>
                <select
                  value={mediaBucket}
                  onChange={(event) => {
                    const nextBucket = event.target.value === "images" ? "images" : "audio"
                    setMediaBucket(nextBucket)
                    setAudioDurations([])
                  }}
                  className={inputClassName}
                >
                  <option value="audio">audio</option>
                  <option value="images">images</option>
                </select>
              </div>

              <div className="grid gap-2">
                <div className="text-sm font-medium">Folder</div>
                <input
                  value={mediaFolder}
                  onChange={(event) => setMediaFolder(event.target.value)}
                  placeholder="Optional. Example: 2026-03-21"
                  className={inputClassName}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mediaUpsert}
                  onChange={(event) => setMediaUpsert(event.target.checked)}
                />
                Overwrite files with the same name
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={() => mediaFileInputRef.current?.click()}>
                  Choose files
                </Button>
                <Button variant="secondary" onClick={clearMediaSelection}>
                  Clear selection
                </Button>
                <div className="text-sm text-muted-foreground">
                  {mediaFiles.length > 0 ? `${mediaFiles.length} file(s) selected` : "No files selected."}
                </div>
              </div>

              <input
                ref={mediaFileInputRef}
                type="file"
                multiple
                accept={mediaBucket === "audio" ? "audio/*" : "image/*"}
                onChange={(event) => void handleMediaFileChange(Array.from(event.target.files ?? []))}
                className="hidden"
              />

              {mediaBucket === "audio" && audioDurations.length > 0 ? (
                <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="text-sm font-medium">Detected audio durations</div>
                  <div className="grid gap-1 text-sm text-muted-foreground">
                    {audioDurations.map((item) => (
                      <div key={item.filename}>
                        {item.filename}: {item.durationMs == null ? "Could not detect" : `${item.durationMs} ms`}
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Copy the returned <code>media_duration_ms</code> values into your question CSV where needed.
                  </div>
                </div>
              ) : null}

              <div>
                <Button disabled={!canUploadMedia} onClick={() => void uploadMedia()}>
                  {mediaBusy ? "Uploading..." : "Upload files"}
                </Button>
              </div>

              <div className="grid gap-2">
                <div className="text-sm font-medium">Media upload result</div>
                <pre className={resultClassName}>{mediaResult || "No media upload yet."}</pre>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  )
}
