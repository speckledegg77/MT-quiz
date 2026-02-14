"use client"

import { useMemo, useState } from "react"

export default function AdminImportPage() {
  const [token, setToken] = useState<string>(() => {
    if (typeof window === "undefined") return ""
    return sessionStorage.getItem("mtq_admin_token") ?? ""
  })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string>("")

  const canUpload = useMemo(() => {
    return token.trim().length > 0 && !!file && !busy
  }, [token, file, busy])

  async function upload() {
    if (!file) return
    setBusy(true)
    setResult("")

    try {
      sessionStorage.setItem("mtq_admin_token", token)

      const csvText = await file.text()

      const res = await fetch("/api/admin/import-questions", {
        method: "POST",
        headers: {
          "x-admin-token": token,
          "Content-Type": "text/csv",
        },
        body: csvText,
      })

      const text = await res.text()
      setResult(text || `(no response body, status ${res.status})`)
    } catch (e: any) {
      setResult(e?.message ?? "Upload failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1>Admin: Import questions</h1>

      <p>
        Upload a CSV to create or update packs and questions in Supabase. You need your admin token. This page stores the
        token in your browser session storage only.
      </p>

      <h2>Admin token</h2>
      <input
        type="password"
        value={token}
        onChange={e => setToken(e.target.value)}
        placeholder="Paste ADMIN_TOKEN here"
        style={{
          width: "100%",
          padding: 10,
          border: "1px solid #ccc",
          borderRadius: 8,
        }}
      />

      <h2 style={{ marginTop: 16 }}>CSV file</h2>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={e => setFile(e.target.files?.[0] ?? null)}
      />

      {file && (
        <div style={{ marginTop: 8, color: "#555" }}>
          Selected: {file.name} ({Math.round(file.size / 1024)} KB)
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          disabled={!canUpload}
          onClick={upload}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #111",
            background: canUpload ? "#111" : "#999",
            color: "#fff",
            cursor: canUpload ? "pointer" : "not-allowed",
          }}
        >
          {busy ? "Uploading…" : "Upload CSV"}
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
