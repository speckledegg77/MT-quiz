"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SimpleSelect } from "@/components/ui/SimpleSelect";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type GameMode = "teams" | "solo";

type RoomInfo = {
  phase?: string;
  gameMode?: GameMode;
  teamNames?: string[];
};

function cleanRoomCode(input: string) {
  return String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function JoinInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const [code, setCode] = useState(cleanRoomCode(sp.get("code") ?? ""));

  const [playerName, setPlayerName] = useState("");
  const [teamName, setTeamName] = useState("");

  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<number | null>(null);

  const gameMode: GameMode = (roomInfo?.gameMode ?? "teams") as GameMode;
  const teamNames = Array.isArray(roomInfo?.teamNames) ? roomInfo!.teamNames! : [];

  const needsTeam = gameMode === "teams";
  const hasTeamList = needsTeam && teamNames.length > 0;

  const canJoin = useMemo(() => {
    if (!code.trim()) return false;
    if (!playerName.trim()) return false;
    if (busy) return false;
    if (needsTeam && hasTeamList && !teamName.trim()) return false;
    if (needsTeam && !hasTeamList && !teamName.trim()) return false;
    return true;
  }, [code, playerName, teamName, busy, needsTeam, hasTeamList]);

  useEffect(() => {
    const clean = cleanRoomCode(code);
    if (!clean) {
      setRoomInfo(null);
      setError(null);
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      setLoadingRoom(true);
      setError(null);

      try {
        const res = await fetch(`/api/room/state?code=${encodeURIComponent(clean)}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setRoomInfo(null);
          setError(String(data?.error ?? "Room not found."));
          setLoadingRoom(false);
          return;
        }

        if (String(data?.phase ?? "") !== "lobby") {
          setRoomInfo({ phase: String(data?.phase ?? ""), gameMode: data?.gameMode ?? "teams", teamNames: data?.teamNames ?? [] });
          setError("Game already started. Ask the host to reset the room.");
          setLoadingRoom(false);
          return;
        }

        const info: RoomInfo = {
          phase: String(data?.phase ?? "lobby"),
          gameMode: (data?.gameMode ?? "teams") as GameMode,
          teamNames: Array.isArray(data?.teamNames) ? data.teamNames : [],
        };

        setRoomInfo(info);

        if (info.gameMode === "solo") {
          setTeamName("");
        } else if (Array.isArray(info.teamNames) && info.teamNames.length > 0) {
          setTeamName((prev) => prev || String(info.teamNames?.[0] ?? ""));
        }

        setLoadingRoom(false);
      } catch {
        setRoomInfo(null);
        setError("Could not load that room.");
        setLoadingRoom(false);
      }
    }, 450);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [code]);

  async function join() {
    setError(null);

    const cleanCode = cleanRoomCode(code);
    const cleanPlayerName = playerName.trim();
    const cleanTeamName = teamName.trim();

    if (!cleanCode) {
      setError("Enter a room code.");
      return;
    }

    if (!cleanPlayerName) {
      setError("Enter your name.");
      return;
    }

    if (needsTeam && !cleanTeamName) {
      setError("Pick a team.");
      return;
    }

    setBusy(true);

    try {
      const res = await fetch("/api/room/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: cleanCode,
          playerName: cleanPlayerName,
          teamName: needsTeam ? cleanTeamName : null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(String(data?.error ?? "Could not join."));
        return;
      }

      localStorage.setItem(`mtq_player_${data.code}`, data.playerId);
      localStorage.setItem(`mtq_player_name_${data.code}`, cleanPlayerName);
      if (needsTeam && cleanTeamName) {
        localStorage.setItem(`mtq_team_name_${data.code}`, cleanTeamName);
      } else {
        localStorage.removeItem(`mtq_team_name_${data.code}`);
      }

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
            Enter the room code and your name.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <div className="text-sm font-medium">Room code</div>
            <Input
              value={code}
              onChange={(e) => setCode(cleanRoomCode(e.target.value))}
              placeholder="For example 3PDSXFT5"
              autoCapitalize="characters"
              spellCheck={false}
            />
            {loadingRoom ? (
              <div className="text-xs text-[var(--muted-foreground)]">Loading room…</div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-medium">Your name</div>
            <Input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="For example Elphaba"
              autoComplete="nickname"
            />
            <div className="text-xs text-[var(--muted-foreground)]">Names must be unique in a room.</div>
          </div>

          {needsTeam ? (
            <div className="grid gap-2">
              <div className="text-sm font-medium">Team</div>
              {hasTeamList ? (
            <SimpleSelect
              buttonClassName="h-12"
              value={teamName}
              onChange={setTeamName}
              options={teamNames.map((t) => ({ value: t, label: t }))}
            />
              ) : (
                <Input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Enter team name"
                  autoComplete="off"
                />
              )}
            </div>
          ) : null}

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
