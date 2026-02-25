import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function AdminHealthPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <div className="text-2xl font-semibold">Admin Health</div>
        <div className="text-sm text-[var(--muted-foreground)]">
          This page will run checks on packs, questions, and media.
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming next</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
          <div>Missing audio files</div>
          <div>Missing image files</div>
          <div>Broken media paths</div>
          <div>Duplicate questions across packs</div>

          <div className="pt-2">
            <Link href="/admin">
              <Button variant="secondary">Back to Admin</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}