import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Musical Theatre Quiz</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Host creates a room, the TV display shows the quiz, and players answer on their phones.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/host" className="block">
          <Card className="h-full transition-colors hover:bg-muted">
            <CardHeader>
              <CardTitle>Host</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Start with the easy setup wizard, or open the existing host controls if you already know the flow.
              </p>
              <div className="text-sm font-medium">Go to Host →</div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/join" className="block">
          <Card className="h-full transition-colors hover:bg-muted">
            <CardHeader>
              <CardTitle>Join</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Enter the room code and your team name, then answer on your phone.
              </p>
              <div className="text-sm font-medium">Go to Join →</div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="mt-8 rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
        Tip: after you create a room, open the TV display on the room screen and let players join from their phones.
      </div>
    </main>
  )
}
