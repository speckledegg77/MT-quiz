import Link from "next/link"

import PageShell from "@/components/PageShell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

const pathCards = [
  {
    href: "/host/wizard",
    eyebrow: "Easy path",
    title: "Start with easy setup",
    description:
      "Best for first-time and casual hosts. The wizard helps you choose a quiz style, create a room, open the TV display, and get players joined without throwing the full host controls at you straight away.",
    bullets: [
      "Guided quiz-first setup",
      "Explains host screen, TV display, and player phones",
      "Builds a real room on the current round-plan model",
    ],
  },
  {
    href: "/host/direct",
    eyebrow: "Power path",
    title: "Use existing host setup",
    description:
      "Best if you already know how the app works and want direct control. This opens the current host screen with Simple and Advanced setup, live controls, templates, and specialist flows.",
    bullets: [
      "Current host screen stays intact",
      "Simple and Advanced setup still available",
      "Better for Heads Up, Infinite, and manual control",
    ],
  },
]

const screenCards = [
  {
    title: "Host screen",
    body: "Keep this on your device. You create the room here, launch the TV display, and control the game.",
  },
  {
    title: "TV display",
    body: "Open this on the screen in the room so everyone can see the question, timer, and scoreboard.",
  },
  {
    title: "Player phones",
    body: "Players join with the room code or QR link on their own phones and submit answers there.",
  },
]

export default function HostLandingPage() {
  return (
    <PageShell width="wide">
      <div className="space-y-8">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            Host setup
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Choose the right way to set up your game
          </h1>
          <p className="text-base text-muted-foreground">
            The easy setup wizard helps you choose a path. The wizard helps you complete a game setup.
            The existing host page stays as the control centre once you know what you are doing.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {screenCards.map((card) => (
            <Card key={card.title} className="h-full">
              <CardHeader>
                <CardTitle>{card.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{card.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {pathCards.map((card) => (
            <Link key={card.href} href={card.href} className="block h-full">
              <Card className="h-full transition-colors hover:bg-muted">
                <CardHeader className="space-y-2 border-b border-border">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {card.eyebrow}
                  </div>
                  <CardTitle className="text-xl">{card.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{card.description}</p>
                  <div className="space-y-2 text-sm text-foreground">
                    {card.bullets.map((bullet) => (
                      <div key={bullet} className="flex items-start gap-2">
                        <span className="mt-1 h-2 w-2 rounded-full bg-foreground" />
                        <span>{bullet}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 text-sm font-medium text-foreground">
                    {card.href === "/host/wizard" ? "Open easy setup →" : "Open existing host setup →"}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-muted p-5">
          <div className="text-sm font-medium text-foreground">Not sure which one to use?</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Start with easy setup if this is your first game, if you are hosting casually, or if you want the app to recommend a sensible quiz plan. Use the existing host setup when you want specialist modes, manual round building, or deeper control.
          </p>
        </div>
      </div>
    </PageShell>
  )
}
