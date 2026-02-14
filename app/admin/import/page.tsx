"use client"

import { useEffect, useMemo, useRef, useState } from "react"

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  border: "1px solid #ccc",
  borderRadius: 8,
  pointerEvents: "auto",
}

const buttonBase: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #111",
  cursor: "pointer",
  userSelect: "none",
}

const buttonPrimary: React.CSSProperties = {
  ...buttonBase,
  background: "#111",
  color: "#fff",
}

const buttonSecondary: React.CSSProperties = {
  ...buttonBase,
  background: "#fff",
  color: "#111",
}

function withDisabled(style: React.CSSProperties, disabled: boolean): React.CSSProperties {
  if (!disabled) return style
  return { ...style, opacity: 0.5, cursor: "not-allowed" }
}

export default function AdminImportPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [token, setToken] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [csvText, setCsvText] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState("")

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("mtq_admin_token") ?? ""
      if (saved) setToken(saved)
    } catch {
      // ignore
    }
  }, [])

  const canUpload = useMemo(() => {
    const hasToken = token.trim().length > 0
    const hasData = !!file || csvText.trim().length > 0
    return hasToken && hasData && !busy
  }, [token, file, csvText, busy])

  async function upload() {
    setBusy(true)
    setResult("")

    try {
      const cleanToken = token.trim()
      if (!cleanToken) {
        setResult('{"error":"Missing admin token"}')
        return
      }

      let textToSend = csvText
      if (file) textToSend = await file.text()

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

  function clearToken() {
    setToken("")
    try {
      sessionStorage.removeItem("mtq_admin_token")
    } catch {
      // ignore
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1>Admin: Import questions</h1>

      <p>
        Paste your admin token, then choose a CSV file or paste CSV content. This page stores the token in browser session
        storage for this tab only.
      </p>

      <h2>Admin token</h2>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
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

      <h2 style={{ marginTop: 16 }}>Upload CSV file</h2>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={openFilePicker} style={buttonSecondary}>
          Choose CSV file
        </button>

        <div style={{ color: "#555" }}>
          {file ? `Selected: ${file.name} (${Math.round(file.size / 1024)} KB)` : "No file selected."}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={e => setFile(e.target.files?.[0] ?? null)}
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
        <button
          type="button"
          disabled={!canUpload}
          onClick={upload}
          style={withDisabled(buttonPrimary, !canUpload)}
        >
          {busy ? "Uploading…" : "Upload to question bank"}
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

      <h2 style={{ marginTop: 20 }}>CSV columns</h2>

      <pre
        style={{
          whiteSpace: "pre-wrap",
          padding: 12,
          border: "1px solid #ccc",
          borderRadius: 8,
          background: "#fafafa",
        }}
      >
pack_id,pack_name,pack_round_type,pack_sort_order,question_id,question_round_type,question_text,option_a,option_b,option_c,option_d,answer_index,explanation,audio_path
      </pre>
    </main>
  )
}
