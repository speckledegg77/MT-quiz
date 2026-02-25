import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function AdminHomePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <div className="text-2xl font-semibold">Admin</div>
        <div className="text-sm text-[var(--muted-foreground)]">
          Choose a tool.
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-[var(--muted-foreground)]">
              Import questions from CSV and upload media in bulk.
            </div>
            <Link href="/admin/import">
              <Button>Open Import</Button>
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
            <Link href="/admin/health">
              <Button variant="secondary">Open Health</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}