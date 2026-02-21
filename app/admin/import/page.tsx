"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

const inputStyle: CSSProperties = {
  width: "100%",
  padding: 10,
  border: "1px solid #ccc",
  borderRadius: 8,
  pointerEvents: "auto",
};

const buttonBase: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #111",
  cursor: "pointer",
  userSelect: "none",
};

const buttonPrimary: CSSProperties = { ...buttonBase, background: "#111", color: "#fff" };
const buttonSecondary: CSSProperties = { ...buttonBase, background: "#fff", color: "#111" };

function withDisabled(style: CSSProperties, disabled: boolean): CSSProperties {
  if (!disabled) return style;
  return { ...style, opacity: 0.5, cursor: "not-allowed" };
}

type MediaBucket = "audio" | "images";

export default function AdminImportPage() {
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);

  const [token, setToken] = useState("");
  const cleanToken = token.trim();

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvResult, setCsvResult] = useState("");

  const [mediaBucket, setMediaBucket] = useState<MediaBucket>("audio");
  const [mediaFolder, setMediaFolder] = useState("");
  const [mediaUpsert, setMediaUpsert] = useState(true);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaResult, setMediaResult] = useState("");

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("mtq_admin_token") ?? "";
      if (saved) setToken(saved);
    } catch {
      // ignore
    }
  }, []);

  function persistToken() {
    try {
      sessionStorage.setItem("mtq_admin_token", cleanToken);
    } catch {
      // ignore
    }
  }

  function clearToken() {
    setToken("");
    try {
      sessionStorage.removeItem("mtq_admin_token");
    } catch {
      // ignore
    }
  }

  const canUploadCsv = useMemo(() => {
    const hasToken = cleanToken.length > 0;
    const hasData = !!csvFile || csvText.trim().length > 0;
    return hasToken && hasData && !csvBusy;
  }, [cleanToken, csvFile, csvText, csvBusy]);

  const canUploadMedia = useMemo(() => {
    return cleanToken.length > 0 && mediaFiles.length > 0 && !mediaBusy;
  }, [cleanToken, mediaFiles, mediaBusy]);

  function openCsvPicker() {
    csvFileInputRef.current?.click();
  }

  function openMediaPicker() {
    mediaFileInputRef.current?.click();
  }

  function clearMediaSelection() {
    setMediaFiles([]);
    if (mediaFileInputRef.current) mediaFileInputRef.current.value = "";
  }

  async function uploadCsv() {
    setCsvBusy(true);
    setCsvResult("");

    try {
      if (!cleanToken) {
        setCsvResult('{"error":"Missing admin token"}');
        return;
      }

      let textToSend = csvText;
      if (csvFile) textToSend = await csvFile.text();

      if (!textToSend || !textToSend.trim()) {
        setCsvResult('{"error":"No CSV content to upload"}');
        return;
      }

      persistToken();

      const res = await fetch("/api/admin/import-questions", {
        method: "POST",
        headers: {
          "x-admin-token": cleanToken,
          "Content-Type": "text/csv",
        },
        body: textToSend,
      });

      const body = await res.text();
      setCsvResult(body || `(no response body, status ${res.status})`);
    } catch (e: any) {
      setCsvResult(e?.message ?? "Upload failed");
    } finally {
      setCsvBusy(false);
    }
  }

  async function uploadMedia() {
    setMediaBusy(true);
    setMediaResult("");

    try {
      if (!cleanToken) {
        setMediaResult('{"error":"Missing admin token"}');
        return;
      }

      if (mediaFiles.length === 0) {
        setMediaResult('{"error":"No files selected"}');
        return;
      }

      persistToken();

      const form = new FormData();
      form.append("bucket", mediaBucket);
      if (mediaFolder.trim()) form.append("folder", mediaFolder.trim());
      form.append("upsert", mediaUpsert ? "true" : "false");

      for (const f of mediaFiles) form.append("files", f);

      const res = await fetch("/api/admin/upload-media", {
        method: "POST",
        headers: { "x-admin-token": cleanToken },
        body: form,
      });

      const text = await res.text();
      if (!res.ok) {
        setMediaResult(text || `(upload failed, status ${res.status})`);
        return;
      }

      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        setMediaResult(text || "Could not parse response JSON");
        return;
      }

      const uploaded = Array.isArray(json?.uploaded) ? json.uploaded : [];
      const paths = uploaded.map((u: any) => u?.path).filter(Boolean);

      const friendly = {
        ok: json?.ok,
        bucket: json?.bucket,
        uploadedCount: json?.uploadedCount,
        failedCount: json?.failedCount,
        paths,
        failed: json?.failed,
      };

      setMediaResult(JSON.stringify(friendly, null, 2));
    } catch (e: any) {
      setMediaResult(e?.message ?? "Upload failed");
    } finally {
      setMediaBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1>Admin: Import questions and upload media</h1>

      <h2>Admin token</h2>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
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

      <div style={{ display: "grid", gap: 10 }}>
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
          onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
          style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
          tabIndex={-1}
        />
      </div>

      <h2 style={{ marginTop: 16 }}>Or paste CSV</h2>

      <textarea
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        placeholder="Paste CSV here if you do not want to upload a file"
        rows={8}
        style={inputStyle}
      />

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          disabled={!canUploadCsv}
          onClick={uploadCsv}
          style={withDisabled(buttonPrimary, !canUploadCsv)}
        >
          {csvBusy ? "Uploading..." : "Upload to question bank"}
        </button>
      </div>

      <h3 style={{ marginTop: 16 }}>CSV import result</h3>

      <pre style={{ whiteSpace: "pre-wrap", padding: 12, border: "1px solid #ccc", borderRadius: 8, background: "#fafafa", minHeight: 80 }}>
        {csvResult || "No CSV upload yet."}
      </pre>

      <hr style={{ margin: "18px 0" }} />

      <h2>Upload media (bulk)</h2>

      <p>
        Upload audio or images to Supabase Storage, then copy the returned paths into your CSV.
        Use bucket paths only. Example audio path: 2026-02-17/audio-008.mp3
      </p>

      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 14 }}>Bucket</div>
          <select
            value={mediaBucket}
            onChange={(e) => setMediaBucket(e.target.value === "images" ? "images" : "audio")}
            style={inputStyle}
          >
            <option value="audio">audio</option>
            <option value="images">images</option>
          </select>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 14 }}>Folder (optional)</div>
          <input
            value={mediaFolder}
            onChange={(e) => setMediaFolder(e.target.value)}
            placeholder="Example: 2026-02-17"
            style={inputStyle}
          />
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="checkbox" checked={mediaUpsert} onChange={(e) => setMediaUpsert(e.target.checked)} />
          <span>Overwrite files with the same name</span>
        </label>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={openMediaPicker} style={buttonSecondary}>
            Choose files
          </button>

          <button type="button" onClick={clearMediaSelection} style={buttonSecondary}>
            Clear selection
          </button>

          <div style={{ color: "#555" }}>
            {mediaFiles.length > 0 ? `${mediaFiles.length} file(s) selected` : "No files selected."}
          </div>
        </div>

        <input
          ref={mediaFileInputRef}
          type="file"
          multiple
          accept={mediaBucket === "audio" ? "audio/*" : "image/*"}
          onChange={(e) => setMediaFiles(Array.from(e.target.files ?? []))}
          style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
          tabIndex={-1}
        />

        <button
          type="button"
          disabled={!canUploadMedia}
          onClick={uploadMedia}
          style={withDisabled(buttonPrimary, !canUploadMedia)}
        >
          {mediaBusy ? "Uploading..." : "Upload files"}
        </button>

        <h3 style={{ marginTop: 6 }}>Media upload result</h3>

        <pre style={{ whiteSpace: "pre-wrap", padding: 12, border: "1px solid #ccc", borderRadius: 8, background: "#fafafa", minHeight: 80 }}>
          {mediaResult || "No media upload yet."}
        </pre>
      </div>

      <hr style={{ margin: "18px 0" }} />

      <h2>CSV columns reminder</h2>

      <pre style={{ whiteSpace: "pre-wrap", padding: 12, border: "1px solid #ccc", borderRadius: 8, background: "#fafafa" }}>
        pack_id,pack_name,pack_round_type,pack_sort_order,
        question_id,question_round_type,answer_type,question_text,
        option_a,option_b,option_c,option_d,answer_index,
        answer_text,accepted_answers,explanation,audio_path,image_path
      </pre>
    </main>
  );
}