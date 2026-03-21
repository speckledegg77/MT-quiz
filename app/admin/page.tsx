import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

function linkButtonClass(variant: "primary" | "secondary" = "primary") {
  const base =
    "inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-border focus:ring-offset-2 focus:ring-offset-background"

  if (variant === "secondary") {
    return `${base} border-border bg-card text-foreground hover:bg-muted`
  }

  return `${base} border-foreground bg-foreground text-background hover:opacity-90`
}

export default function AdminHomePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <div className="text-2xl font-semibold">Admin</div>
        <div className="text-sm text-muted-foreground">Choose a tool.</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader>
            <CardTitle>Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Review question metadata, warnings, and suggested values before rounds start using the new fields.
            </div>
            <Link href="/admin/questions" className={linkButtonClass()}>
              Open Questions
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Round Templates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Create reusable round definitions that can later be added to games from the host page.
            </div>
            <Link href="/admin/round-templates" className={linkButtonClass("secondary")}>
              Open Templates
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shows</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Manage show keys and alternative names used by primary_show_key suggestions and dropdowns.
            </div>
            <Link href="/admin/shows" className={linkButtonClass("secondary")}>
              Open Shows
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Heads Up</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Create Heads Up items and themed packs without forcing them into the normal quiz question model.
            </div>
            <Link href="/admin/heads-up" className={linkButtonClass("secondary")}>
              Open Heads Up
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Import questions, Heads Up items, and media in bulk.
            </div>
            <Link href="/admin/import" className={linkButtonClass("secondary")}>
              Open Import
            </Link>
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <CardTitle>Readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              See which questions are currently ready for standard rounds, Quickfire, and short-audio Quickfire.
            </div>
            <Link href="/admin/readiness" className={linkButtonClass("secondary")}>
              Open Readiness
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
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