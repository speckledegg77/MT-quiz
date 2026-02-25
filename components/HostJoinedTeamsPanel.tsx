"use client";

import { useEffect, useMemo, useState } from "react";
import JoinFeedPanel from "@/components/JoinFeedPanel";
import { Card, CardContent } from "@/components/ui/Card";

type RoomState = any;

type PlayerPublic = {
  id: string;
  name: string;
  score?: number | null;
  joined_at?: string | null;
  created_at?: string | null;
};

export default function HostJoinedTeamsPanel({ code }: { code: string }) {
  const roomCode = useMemo(() => String(code ?? "").trim().toUpperCase(), [code]);

  const [players, setPlayers] = useState<PlayerPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode) return;

    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/room/state?code=${roomCode}`, { cache: "no-store" });
        const data: RoomState = await res.json().catch(() => ({}));

        if (cancelled) return;

        if (!res.ok) {
          setError(String(data?.error ?? "Could not load join feed."));
          setPlayers([]);
          setLoading(false);
          return;
        }

        const list = Array.isArray(data?.players) ? data.players : [];
        setPlayers(list as PlayerPublic[]);
        setError(null);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setError("Could not load join feed.");
        setPlayers([]);
        setLoading(false);
      }
    }

    tick();
    const id = setInterval(tick, 500);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomCode]);

  if (!roomCode) return null;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-[var(--muted-foreground)]">
          Loading teams…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <Card>
          <CardContent className="py-4 text-sm text-red-600">{error}</CardContent>
        </Card>
      ) : null}

      <JoinFeedPanel players={players} />
    </div>
  );
}