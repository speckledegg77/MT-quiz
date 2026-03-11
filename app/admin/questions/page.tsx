import Link from "next/link"

import { QuestionMetadataDashboard } from "@/components/admin/QuestionMetadataDashboard"

function linkButtonClass() {
  return "inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--border)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
}

export default function AdminQuestionsPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">Admin Questions</div>
          <div className="text-sm text-[var(--muted-foreground)]">
            Review suggested metadata, confirm values, and save updates to Supabase.
          </div>
        </div>

        <Link href="/admin" className={linkButtonClass()}>
          Back to Admin
        </Link>
      </div>

      <QuestionMetadataDashboard />
    </main>
  )
}