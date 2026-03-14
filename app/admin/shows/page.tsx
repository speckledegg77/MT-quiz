import Link from "next/link"

import { ShowsDashboard } from "@/components/admin/ShowsDashboard"

function linkButtonClass() {
  return "inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-border focus:ring-offset-2 focus:ring-offset-background"
}

export default function AdminShowsPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">Admin Shows</div>
          <div className="text-sm text-muted-foreground">
            Manage show keys and alternative names used by question metadata suggestions.
          </div>
        </div>

        <Link href="/admin" className={linkButtonClass()}>
          Back to Admin
        </Link>
      </div>

      <ShowsDashboard />
    </main>
  )
}