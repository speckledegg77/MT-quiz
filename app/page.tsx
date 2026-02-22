import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Musical Theatre Quiz</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Host creates a room, teams join on their phones, and the TV display runs the questions.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/host" className="block">
          <Card className="h-full transition-colors hover:bg-[var(--muted)]">
            <CardHeader>
              <CardTitle>Host</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-[var(--muted-foreground)]">
                Create a room, choose packs and settings, then start the game.
              </p>
              <div className="text-sm font-medium">Go to Host →</div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/join" className="block">
          <Card className="h-full transition-colors hover:bg-[var(--muted)]">
            <CardHeader>
              <CardTitle>Join</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-[var(--muted-foreground)]">
                Enter the room code and your team name, then answer on your phone.
              </p>
              <div className="text-sm font-medium">Go to Join →</div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4 text-sm text-[var(--muted-foreground)]">
        Tip: after you create a room, the host screen shows a join link and QR code.
      </div>
    </main>
  );
}