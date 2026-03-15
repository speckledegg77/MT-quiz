"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

type ReadinessBreakdownRow = {
  key: string
  label: string
  totalQuestions: number
  standardMcqCount: number
  standardPictureCount: number
  quickfireSafeCount: number
  quickfireSafeTextOrImageCount: number
  quickfireSafeAudioCount: number
  audioQuestionCount: number
  audioWithDurationCount: number
  audioMissingDurationCount: number
  quickfireAudioTooLongCount: number
}

type ReadinessResponse = {
  ok?: boolean
  report?: {
    summary: {
      totalQuestions: number
      standardMcqCount: number
      standardPictureCount: number
      quickfireSafeCount: number
      quickfireSafeTextOrImageCount: number
      quickfireSafeAudioCount: number
      audioQuestionCount: number
      audioWithDurationCount: number
      audioMissingDurationCount: number
      quickfireAudioTooLongCount: number
      confirmedMetadataCount: number
      missingCoreMetadataCount: number
    }
    quickfireExclusionReasons: Array<{ code: string; label: string; count: number }>
    metadataGapCounts: Array<{ code: string; label: string; count: number }>
    byPack: ReadinessBreakdownRow[]
    byShow: ReadinessBreakdownRow[]
  }
  error?: string
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

function buildAdminHeaders(token: string) {
  return {
    "x-admin-token": token.trim(),
  }
}

function StatCard(props: { title: string; value: number; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{props.title}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{props.value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{props.hint}</div>
    </div>
  )
}

function BreakdownTable(props: { title: string; rows: ReadinessBreakdownRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {props.rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No rows yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Total</th>
                  <th className="px-2 py-2 font-medium">Standard MCQ</th>
                  <th className="px-2 py-2 font-medium">Standard picture</th>
                  <th className="px-2 py-2 font-medium">Quickfire safe</th>
                  <th className="px-2 py-2 font-medium">Quickfire audio</th>
                  <th className="px-2 py-2 font-medium">Audio missing duration</th>
                  <th className="px-2 py-2 font-medium">Audio too long</th>
                </tr>
              </thead>
              <tbody>
                {props.rows.map((row) => (
                  <tr key={row.key} className="border-b border-border/70 last:border-b-0">
                    <td className="px-2 py-2 text-foreground">{row.label}</td>
                    <td className="px-2 py-2">{row.totalQuestions}</td>
                    <td className="px-2 py-2">{row.standardMcqCount}</td>
                    <td className="px-2 py-2">{row.standardPictureCount}</td>
                    <td className="px-2 py-2">{row.quickfireSafeCount}</td>
                    <td className="px-2 py-2">{row.quickfireSafeAudioCount}</td>
                    <td className="px-2 py-2">{row.audioMissingDurationCount}</td>
                    <td className="px-2 py-2">{row.quickfireAudioTooLongCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function RoundReadinessDashboard() {
  const [token, setToken] = useState("")
  const cleanToken = token.trim()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [report, setReport] = useState<ReadinessResponse["report"] | null>(null)

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("mtq_admin_token") ?? ""
      if (saved) setToken(saved)
    } catch {
      // ignore
    }
  }, [])

  async function loadReadiness() {
    if (!cleanToken) {
      setError("Enter your admin token first.")
      setReport(null)
      return
    }

    setBusy(true)
    setError("")
    try {
      try {
        sessionStorage.setItem("mtq_admin_token", cleanToken)
      } catch {
        // ignore
      }

      const res = await fetch("/api/admin/readiness", {
        headers: buildAdminHeaders(cleanToken),
        cache: "no-store",
      })
      const json = (await res.json()) as ReadinessResponse
      if (!res.ok || !json.report) {
        setReport(null)
        setError(json.error || "Could not load readiness.")
        return
      }
      setReport(json.report)
    } catch (err: any) {
      setReport(null)
      setError(err?.message || "Could not load readiness.")
    } finally {
      setBusy(false)
    }
  }

  const summary = report?.summary ?? null
  const byPack = useMemo(() => report?.byPack ?? [], [report])
  const byShow = useMemo(() => report?.byShow ?? [], [report])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin token</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">Use the same admin token you use for metadata and import tools.</div>
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Paste ADMIN_TOKEN here"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={loadReadiness} disabled={busy}>{busy ? "Loading…" : "Load readiness"}</Button>
            <Button variant="secondary" onClick={() => { setReport(null); setError("") }}>Clear results</Button>
          </div>
          {error ? <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        </CardContent>
      </Card>

      {summary ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Total questions" value={summary.totalQuestions} hint="Everything currently in the questions table." />
              <StatCard title="Standard MCQ" value={summary.standardMcqCount} hint="Broad pool for classic rounds." />
              <StatCard title="Standard picture" value={summary.standardPictureCount} hint="Image-based question count." />
              <StatCard title="Quickfire safe" value={summary.quickfireSafeCount} hint="MCQ only, with short audio allowed." />
              <StatCard title="Quickfire safe audio" value={summary.quickfireSafeAudioCount} hint="Audio at or under 5 seconds." />
              <StatCard title="Audio missing duration" value={summary.audioMissingDurationCount} hint="These need media_duration_ms." />
              <StatCard title="Audio too long" value={summary.quickfireAudioTooLongCount} hint="Audio over 5 seconds cannot enter Quickfire." />
              <StatCard title="Confirmed metadata" value={summary.confirmedMetadataCount} hint="Questions marked confirmed." />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Quickfire exclusions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {report?.quickfireExclusionReasons.length ? report.quickfireExclusionReasons.map((item) => (
                  <div key={item.code} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                    <span>{item.label}</span>
                    <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", item.count > 0 ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground")}>{item.count}</span>
                  </div>
                )) : <div className="text-sm text-muted-foreground">No exclusion reasons found.</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Metadata gaps</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {report?.metadataGapCounts.length ? report.metadataGapCounts.map((item) => (
                  <div key={item.code} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                    <span>{item.label}</span>
                    <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", item.count > 0 ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground")}>{item.count}</span>
                  </div>
                )) : <div className="text-sm text-muted-foreground">No metadata gaps found.</div>}
              </CardContent>
            </Card>
          </div>

          <BreakdownTable title="By pack" rows={byPack} />
          <BreakdownTable title="By show" rows={byShow} />
        </>
      ) : null}
    </div>
  )
}
