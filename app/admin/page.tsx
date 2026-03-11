import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

function linkButtonClass(variant: "primary" | "secondary" = "primary") {
  const base =
    "inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--border)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"

  if (variant === "secondary") {
    return `${base} border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]`
  }

  return `${base} border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] hover:opacity-90`
}

export default function AdminHomePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <div className="text-2xl font-semibold">Admin</div>
        <div className="text-sm text-[var(--muted-foreground)]">Choose a tool.</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-[var(--muted-foreground)]">
              Review question metadata, warnings, and suggested values before rounds start using the new fields.
            </div>
            <Link href="/admin/questions" className={linkButtonClass()}>
              Open Questions
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shows</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-[var(--muted-foreground)]">
              Manage show keys and alternative names used by primary_show_key suggestions and dropdowns.
            </div>
            <Link href="/admin/shows" className={linkButtonClass("secondary")}>
              Open Shows
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-[var(--muted-foreground)]">
              Import questions from CSV and upload media in bulk.
            </div>
            <Link href="/admin/import" className={linkButtonClass("secondary")}>
              Open Import
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-[var(--muted-foreground)]">
              Check for missing media, broken paths, and duplicates.
            </div>
            <Link href="/admin/health" className={linkButtonClass("secondary")}>
              Open Health
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}