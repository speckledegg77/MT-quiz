"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { createClient } from "@supabase/supabase-js"

const inputStyle: CSSProperties = {
  width: "100%",
  padding: 10,
  border: "1px solid #ccc",
  borderRadius: 8,
  pointerEvents: "auto",
}

const buttonBase: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #111",
  cursor: "pointer",
  userSelect: "none",
}

const buttonPrimary: CSSProperties = { ...buttonBase, background: "#111", color: "#fff" }
const buttonSecondary: CSSProperties = { ...buttonBase, background: "#fff", color: "#111" }

function withDisabled(style: CSSProperties, disabled: boolean): CSSProperties {
  if (!disabled) return style
  return { ...style, opacity: 0.5, cursor: "not-allowed" }
}

export default function AdminImportPage() {
  const csvFileInputRef = useRef<HTMLInputElement | null>(null)
  const audioFileInputRef = useRef<HTMLInputElement | null>(null)
  const imageFileInputRef = useRef<HTMLInputElement | null>(null)

  const [token, setToken] = useState("")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvText, setCsvText] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState("")

  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioTargetPath, setAudioTargetPath] = useState("")
  const [audioBusy, setAudioBusy] = useState(false)
  const [audioResult, setAudioResult] = useState("")

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageTargetPath, setImageTargetPath] = useState("")
  const [imageBusy, setImageBusy] = useState(false)
  const [imageResult, setImageResult] = useState("")

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("mtq_admin_token") ?? ""
      if (saved) setToken(saved)
    } catch {
      // ignore
    }
  }, [])

  const cleanToken = token.trim()

  const canUploadCsv = useMemo(() => {
    const hasToken = cleanToken.length > 0
    const hasData = !!csvFile || csvText.trim().length > 0
    return hasToken && hasData && !busy
  }, [cleanToken, csvFile, csvText, busy])

  const canUploadAudio = useMemo(() => {
    return cleanToken.length > 0 && !!audioFile && !audioBusy
  }, [cleanToken, audioFile, audioBusy])

  const canUploadImage = useMemo(() => {
    return cleanToken.length > 0 && !!imageFile && !imageBusy
  }, [cleanToken, imageFile, imageBusy])

  async function uploadCsv() {
    setBusy(true)
    setResult("")
    try {
      if (!cleanToken) {
        setResult('{"error":"Missing admin token"}')
        return
      }

      let textToSend = csvText
      if (csvFile) textToSend = await csvFile.text()

      if (!textToSend || !textToSend.trim()) {
        setResult('{"error":"No CSV content to upload"}')
        return
      }

      try {
        sessionStorage.setItem("mtq_admin_token", cleanToken)
      } catch {
        // ignore
      }

      const res = await fetch("/api/admin/import-questions", {
        method: "POST",
        headers: {
          "x-admin-token": cleanToken,
          "Content-Type": "text/csv",
        },
        body: textToSend,
      })

      const body = await res.text()
      setResult(body || `(no response body, status ${res.status})`)
    } catch (e: any) {
      setResult(e?.message ?? "Upload failed")
    } finally {
      setBusy(false)
    }
  }

  async function uploadMedia(kind: "audio" | "image") {
    const file = kind === "audio" ? audioFile : imageFile
    const targetPath = kind === "audio" ? audioTargetPath : imageTargetPath

    if (!cleanToken) {
      const msg = '{"error":"Missing admin token"}'
      if (kind === "audio") setAudioResult(msg)
      else setImageResult(msg)
      return
    }

    if (!file) {
      const msg = '{"error":"No file selected"}'
      if (kind === "audio") setAudioResult(msg)
      else setImageResult(msg)
      return
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      const msg = '{"error":"Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"}'
      if (kind === "audio") setAudioResult(msg)
      else setImageResult(msg)
      return
    }

    if (kind === "audio") {
      setAudioBusy(true)
      setAudioResult("")
    } else {
      setImageBusy(true)
      setImageResult("")
    }

    try {
      const initEndpoint = kind === "audio" ? "/api/admin/upload-audio" : "/api/admin/upload-image"
      const initRes = await fetch(initEndpoint, {
        method: "POST",
        headers: {
          "x-admin-token": cleanToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: file.name,
          path: targetPath.trim() || undefined,
        }),
      })

      const initText = await initRes.text()
      if (!initRes.ok) {
        if (kind === "audio") setAudioResult(initText || `(init failed, status ${initRes.status})`)
        else setImageResult(initText || `(init failed, status ${initRes.status})`)
        return
      }

      let initJson: any = null
      try {
        initJson = JSON.parse(initText)
      } catch {
        const msg = initText || "Could not parse init response JSON"
        if (kind === "audio") setAudioResult(msg)
        else setImageResult(msg)
        return
      }

      const bucket = kind === "audio" ? "audio" : "images"
      const path = String(initJson?.path ?? "").trim()
      const signedToken = String(initJson?.token ?? "").trim()

      if (!path || !signedToken) {
        const msg = JSON.stringify({ error: "Missing path or token from server", initJson }, null, 2)
        if (kind === "audio") setAudioResult(msg)
        else setImageResult(msg)
        return
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      const { error } = await supabase.storage
        .from(bucket)
        .uploadToSignedUrl(path, signedToken, file, { contentType: file.type || "application/octet-stream" })

      if (error) {
        const msg = JSON.stringify({ error: error.message }, null, 2)
        if (kind === "audio") setAudioResult(msg)
        else setImageResult(msg)
        return
      }

      const okMsg = JSON.stringify({ ok: true, bucket, path }, null, 2)
      if (kind === "audio") setAudioResult(okMsg)
      else setImageResult(okMsg)
    } catch (e: any) {
      const msg = e?.message ?? "Upload failed"
      if (kind === "audio") setAudioResult(msg)
      else setImageResult(msg)
    } finally {
      if (kind === "audio") setAudioBusy(false)
      else setImageBusy(false)
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

  function openCsvPicker() {
    csvFileInputRef.current?.click()
  }

  function openAudioPicker() {
    audioFileInputRef.current?.click()
  }

  function openImagePicker() {
    imageFileInputRef.current?.click()
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Admin: Import questions</h1>
      <p>Paste your admin token, then upload CSV or paste CSV content. This tab stores the token in session storage.</p>

      <h2>Admin token</h2>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="Paste ADMIN_TOKEN here"
          autoComplete="off"
          spellCheck={false}
          style={{ ...inputStyle, flex: "1 1 320px" }}
        />
        <button type="button" onClick={clearToken} style={buttonSecondary}>
          Clear token
        </button>
      </div>

      <hr style={{ margin: "18px 0" }} />

      <h2>Upload CSV file</h2>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={openCsvPicker} style={buttonSecondary}>
          Choose CSV file
        </button>
        <div style={{ color: "#555" }}>
          {csvFile ? `Selected: ${csvFile.name} (${Math.round(csvFile.size / 1024)} KB)` : "No file selected."}
        </div>
      </div>

      <input
        ref={csvFileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={e => setCsvFile(e.target.files?.[0] ?? null)}
        style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
        tabIndex={-1}
      />

      <h2 style={{ marginTop: 16 }}>Or paste CSV</h2>
      <textarea
        value={csvText}
        onChange={e => setCsvText(e.target.value)}
        placeholder="Paste CSV here if you do not want to upload a file"
        rows={8}
        style={inputStyle}
      />

      <div style={{ marginTop: 16 }}>
        <button type="button" disabled={!canUploadCsv} onClick={uploadCsv} style={withDisabled(buttonPrimary, !canUploadCsv)}>
          {busy ? "Uploading..." : "Upload to question bank"}
        </button>
      </div>

      <h2 style={{ marginTop: 20 }}>Result</h2>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          padding: 12,
          border: "1px solid #ccc",
          borderRadius: 8,
          background: "#fafafa",
          minHeight: 80,
        }}
      >
        {result || "No upload yet."}
      </pre>

      <hr style={{ margin: "18px 0" }} />

      <h2>Upload media</h2>
      <p>Upload audio and images to Supabase Storage, then copy the returned path into your CSV.</p>

      <h3>Upload audio file</h3>
      <div style={{ display: "grid", gap: 10 }}>
        <input
          value={audioTargetPath}
          onChange={e => setAudioTargetPath(e.target.value)}
          placeholder="Optional target path, eg 2026-02-15/warmup-001.mp3 (leave blank to auto-name)"
          style={inputStyle}
        />

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={openAudioPicker} style={buttonSecondary}>
            Choose audio file
          </button>
          <div style={{ color: "#555" }}>
            {audioFile ? `Selected: ${audioFile.name} (${Math.round(audioFile.size / 1024)} KB)` : "No file selected."}
          </div>
        </div>

        <input
          ref={audioFileInputRef}
          type="file"
          accept="audio/*"
          onChange={e => setAudioFile(e.target.files?.[0] ?? null)}
          style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
          tabIndex={-1}
        />

        <button
          type="button"
          disabled={!canUploadAudio}
          onClick={() => uploadMedia("audio")}
          style={withDisabled(buttonPrimary, !canUploadAudio)}
        >
          {audioBusy ? "Uploading..." : "Upload audio"}
        </button>

        <pre style={{ whiteSpace: "pre-wrap", padding: 12, border: "1px solid #ccc", borderRadius: 8, background: "#fafafa" }}>
          {audioResult || "No audio upload yet."}
        </pre>
      </div>

      <h3 style={{ marginTop: 16 }}>Upload image file</h3>
      <div style={{ display: "grid", gap: 10 }}>
        <input
          value={imageTargetPath}
          onChange={e => setImageTargetPath(e.target.value)}
          placeholder="Optional target path, eg 2026-02-15/pic-001.png (leave blank to auto-name)"
          style={inputStyle}
        />

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={openImagePicker} style={buttonSecondary}>
            Choose image file
          </button>
          <div style={{ color: "#555" }}>
            {imageFile ? `Selected: ${imageFile.name} (${Math.round(imageFile.size / 1024)} KB)` : "No file selected."}
          </div>
        </div>

        <input
          ref={imageFileInputRef}
          type="file"
          accept="image/*"
          onChange={e => setImageFile(e.target.files?.[0] ?? null)}
          style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
          tabIndex={-1}
        />

        <button
          type="button"
          disabled={!canUploadImage}
          onClick={() => uploadMedia("image")}
          style={withDisabled(buttonPrimary, !canUploadImage)}
        >
          {imageBusy ? "Uploading..." : "Upload image"}
        </button>

        <pre style={{ whiteSpace: "pre-wrap", padding: 12, border: "1px solid #ccc", borderRadius: 8, background: "#fafafa" }}>
          {imageResult || "No image upload yet."}
        </pre>
      </div>

      <hr style={{ margin: "18px 0" }} />

      <h2>CSV columns</h2>
      <pre style={{ whiteSpace: "pre-wrap", padding: 12, border: "1px solid #ccc", borderRadius: 8, background: "#fafafa" }}>
pack_id,pack_name,pack_round_type,pack_sort_order,
question_id,question_round_type,answer_type,question_text,
option_a,option_b,option_c,option_d,answer_index,
answer_text,accepted_answers,explanation,audio_path,image_path
      </pre>
    </main>
  )
}
