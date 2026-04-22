import Link from "next/link"

import { HeadsUpDashboard } from "@/components/admin/HeadsUpDashboard"

function linkButtonClass() {
  return "inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-border focus:ring-offset-2 focus:ring-offset-background"
}

export default function AdminHeadsUpPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">Admin Spotlight</div>
          <div className="text-sm text-muted-foreground">
            Create Spotlight items and themed packs without forcing them into the normal questions model.
          </div>
        </div>

        <Link href="/admin" className={linkButtonClass()}>
          Back to Admin
        </Link>
      </div>

      <HeadsUpDashboard />
    </main>
  )
}
