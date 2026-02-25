"use client";

import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type PlayerRow = {
  id: string;
  room_id: string;
  name: string;
  joined_at?: string | null;
  created_at?: string | null;
};

type JoinEvent = {
  id: string;
  name: string;
  joinedAt: string;
};

function formatTime(iso: string) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function normaliseName(name: string) {
  return String(name ?? "").trim().toLowerCase();
}

function dedupeByName(players: PlayerRow[]) {
  const seen = new Set<string>();
  const out: PlayerRow[] = [];

  for (const p of players) {
    const key = normaliseName(p.name);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }

  return out;
}

export default function JoinedTeamsPanel({ roomId }: { roomId: string }) {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [recentJoins, setRecentJoins] = useState<JoinEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeField, setTimeField] = useState<"joined_at" | "created_at">("joined_at");

  const roomFilter = useMemo(() => `room_id=eq.${roomId}`, [roomId]);

  async function loadPlayers() {
    setError(null);
    setLoading(true);

    async function runSelect(field: "joined_at" | "created_at") {
      const cols =
        field === "joined_at"
          ? "id, room_id, name, joined_at"
          : "id, room_id, name, created_at";

      return supabase
        .from("players")
        .select(cols)
        .eq("room_id", roomId)
        .order(field, { ascending: true });
    }

    const first = await runSelect(timeField);

    if (first.error) {
      const msg = String(first.error.message ?? "").toLowerCase();

      if (timeField === "joined_at" && msg.includes("joined_at")) {
        setTimeField("created_at");
        const second = await runSelect("created_at");
        if (second.error) {
          setError(second.error.message);
          setLoading(false);
          return;
        }
        setPlayers(dedupeByName((second.data ?? []) as PlayerRow[]));
        setLoading(false);
        return;
      }

      if (timeField === "created_at" && msg.includes("created_at")) {
        setTimeField("joined_at");
        const second = await runSelect("joined_at");
        if (second.error) {
          setError(second.error.message);
          setLoading(false);
          return;
        }
        setPlayers(dedupeByName((second.data ?? []) as PlayerRow[]));
        setLoading(false);
        return;
      }

      setError(first.error.message);
      setLoading(false);
      return;
    }

    setPlayers(dedupeByName((first.data ?? []) as PlayerRow[]));
    setLoading(false);
  }

  useEffect(() => {
    loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;
    let pollId: any = null;
    let channel: any = null;

    async function subscribe() {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (token) supabase.realtime.setAuth(token);

        if (cancelled) return;

        channel = supabase
          .channel(`players-join-feed-${roomId}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "players", filter: roomFilter },
            (payload) => {
              const rowAny = payload.new as any;
              const row: PlayerRow = {
                id: String(rowAny?.id ?? ""),
                room_id: String(rowAny?.room_id ?? ""),
                name: String(rowAny?.name ?? ""),
                joined_at: rowAny?.joined_at ?? null,
                created_at: rowAny?.created_at ?? null,
              };

              const key = normaliseName(row.name);
              if (!key) return;

              setPlayers((prev) => {
                if (prev.some((p) => normaliseName(p.name) === key)) return prev;
                return [...prev, row];
              });

              const rawTime =
                (row as any)?.[timeField] ?? row.joined_at ?? row.created_at ?? null;

              const joinedAt = rawTime ? String(rawTime) : new Date().toISOString();

              setRecentJoins((prev) => {
                if (prev.some((j) => normaliseName(j.name) === key)) return prev;
                const next = [{ id: row.id, name: row.name, joinedAt }, ...prev];
                return next.slice(0, 6);
              });
            }
          )
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              setError("Live updates failed. Using refresh instead.");
            }
          });

        pollId = setInterval(() => {
          loadPlayers().catch(() => {});
        }, 1000);
      } catch {
        setError("Live updates failed. Using refresh instead.");
        pollId = setInterval(() => {
          loadPlayers().catch(() => {});
        }, 1000);
      }
    }

    subscribe();

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId, roomFilter, timeField]);

  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-4">
        <div>
          <CardTitle>Teams joining</CardTitle>
          <div className="mt-1 text-sm text-[var(--muted-foreground)]">
            Live join feed for this room
          </div>
        </div>

        <Button variant="secondary" size="sm" onClick={loadPlayers} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </CardHeader>

      <CardContent>
        {error ? (
          <div className="mb-3 rounded-lg border border-red-300 bg-red-600/10 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] p-3">
            <div className="text-sm font-semibold">Joined teams ({players.length})</div>

            {players.length === 0 ? (
              <div className="mt-2 text-sm text-[var(--muted-foreground)]">No teams yet.</div>
            ) : (
              <ul className="mt-2 space-y-2">
                {players.map((p) => {
                  const raw =
                    (p as any)?.[timeField] ?? p.joined_at ?? p.created_at ?? null;

                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm">{p.name}</div>
                      <div className="shrink-0 text-xs text-[var(--muted-foreground)]">
                        {raw ? formatTime(String(raw)) : ""}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border)] p-3">
            <div className="text-sm font-semibold">Just joined</div>

            {recentJoins.length === 0 ? (
              <div className="mt-2 text-sm text-[var(--muted-foreground)]">
                Waiting for the first join…
              </div>
            ) : (
              <ul className="mt-2 space-y-2">
                {recentJoins.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3">
                    <div className="truncate text-sm">{j.name}</div>
                    <div className="shrink-0 text-xs text-[var(--muted-foreground)]">
                      {formatTime(j.joinedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}