"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

function JoinInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const [code, setCode] = useState((sp.get("code") ?? "").toUpperCase());
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canJoin = code.trim().length > 0 && name.trim().length > 0 && !busy;

  async function join() {
    setError(null);

    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();

    if (!cleanCode) {
      setError("Enter a room code.");
      return;
    }
    if (!cleanName) {
      setError("Enter a team name.");
      return;
    }

    setBusy(true);

    try {
      const res = await fetch("/api/room/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cleanCode, name: cleanName }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Could not join.");
        return;
      }

      localStorage.setItem(`mtq_player_${data.code}`, data.playerId);
      localStorage.setItem(`mtq_player_name_${data.code}`, cleanName);

      router.push(`/play/${data.code}`);
    } catch {
      setError("Could not join.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Join game</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Enter the room code and your team name.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <div className="text-sm font-medium">Room code</div>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="For example 3PDSXFT5"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-medium">Team name</div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="For example Sondheim Stans"
              autoComplete="nickname"
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-red-300 bg-red-600/10 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          ) : null}
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-3">
          <a href="/host" className="text-sm underline text-[var(--muted-foreground)]">
            Host instead
          </a>

          <Button onClick={join} disabled={!canJoin}>
            {busy ? "Joining…" : "Join"}
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-md px-4 py-10">
          <Card>
            <CardContent className="py-8 text-sm text-[var(--muted-foreground)]">Loading…</CardContent>
          </Card>
        </main>
      }
    >
      <JoinInner />
    </Suspense>
  );
}