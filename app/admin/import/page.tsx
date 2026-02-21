"use client";

import { useMemo, useRef, useState } from "react";

type MediaBucket = "audio" | "images";

export default function AdminImportPage() {
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);

  const [token, setToken] = useState("");
  const cleanToken = token.trim();

  const [mediaBucket, setMediaBucket] = useState<MediaBucket>("audio");
  const [mediaFolder, setMediaFolder] = useState("");
  const [mediaUpsert, setMediaUpsert] = useState(true);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  const canUpload = useMemo(() => cleanToken.length > 0 && mediaFiles.length > 0 && !busy, [cleanToken, mediaFiles, busy]);

  function openPicker() {
    mediaFileInputRef.current?.click();
  }

  function clearSelection() {
    setMediaFiles([]);
    if (mediaFileInputRef.current) mediaFileInputRef.current.value = "";
  }

  async function upload() {
    setBusy(true);
    setResult("");

    try {
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
        setResult(text || `(upload failed, status ${res.status})`);
        return;
      }

      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        setResult(text || "Could not parse response JSON");
        return;
      }

      const uploaded = Array.isArray(json?.uploaded) ? json.uploaded : [];
      const paths = uploaded.map((u: any) => u?.path).filter(Boolean);

      setResult(
        JSON.stringify(
          {
            ok: json?.ok,
            bucket: json?.bucket,
            uploadedCount: json?.uploadedCount,
            failedCount: json?.failedCount,
            paths,
            failed: json?.failed,
          },
          null,
          2
        )
      );
    } catch (e: any) {
      setResult(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1>Admin: Upload media (bulk)</h1>

      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, marginBottom: 6 }}>Admin token</div>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste ADMIN_TOKEN here"
            autoComplete="off"
            spellCheck={false}
            style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </div>

        <div>
          <div style={{ fontSize: 14, marginBottom: 6 }}>Bucket</div>
          <select
            value={mediaBucket}
            onChange={(e) => setMediaBucket(e.target.value === "images" ? "images" : "audio")}
            style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          >
            <option value="audio">audio</option>
            <option value="images">images</option>
          </select>
        </div>

        <div>
          <div style={{ fontSize: 14, marginBottom: 6 }}>Folder (optional)</div>
          <input
            value={mediaFolder}
            onChange={(e) => setMediaFolder(e.target.value)}
            placeholder="Example: 2026-02-17"
            style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
          />
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="checkbox" checked={mediaUpsert} onChange={(e) => setMediaUpsert(e.target.checked)} />
          <span>Overwrite files with the same name</span>
        </label>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={openPicker} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #111" }}>
            Choose files
          </button>

          <button type="button" onClick={clearSelection} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #111" }}>
            Clear selection
          </button>

          <div style={{ color: "#555" }}>{mediaFiles.length ? `${mediaFiles.length} file(s) selected` : "No files selected."}</div>
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
          {busy ? "Uploading..." : "Upload files"}
        </button>

        <pre style={{ whiteSpace: "pre-wrap", padding: 12, border: "1px solid #ccc", borderRadius: 8, background: "#fafafa", minHeight: 80 }}>
          {result || "No upload yet."}
        </pre>
      </div>
    </main>
  );
}