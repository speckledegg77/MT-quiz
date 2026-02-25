"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type PlayerRow = {
  id: string;
  room_id: string;
  name: string;
  created_at: string;
};

type JoinEvent = {
  id: string;
  name: string;
  createdAt: string;
};

function formatTime(iso: string) {
  const d = new Date(iso);
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
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }

    return createClient(url, key);
  }, []);

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [recentJoins, setRecentJoins] = useState<JoinEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadPlayers() {
    setError(null);

    const { data, error } = await supabase
      .from("players")
      .select("id, room_id, name, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }

    const rows = (data ?? []) as PlayerRow[];
    setPlayers(dedupeByName(rows));
  }

  useEffect(() => {
    loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    const channel = supabase
      .channel(`players-join-feed-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as PlayerRow;
          const key = normaliseName(row.name);
          if (!key) return;

          setPlayers((prev) => {
            if (prev.some((p) => normaliseName(p.name) === key)) return prev;
            return [...prev, row];
          });

          setRecentJoins((prev) => {
            if (prev.some((j) => normaliseName(j.name) === key)) return prev;
            const next = [{ id: row.id, name: row.name, createdAt: row.created_at }, ...prev];
            return next.slice(0, 6);
          });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          setError("Realtime channel error. Check Supabase Realtime settings for players table.");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, supabase]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Teams joining
          </div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Live join feed for this room
          </div>
        </div>

        <button
          type="button"
          onClick={loadPlayers}
          className="rounded-xl border border-zinc-200 px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Joined teams ({players.length})
          </div>

          {players.length === 0 ? (
            <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">No teams yet.</div>
          ) : (
            <ul className="mt-2 space-y-2">
              {players.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm text-zinc-900 dark:text-zinc-100">
                    {p.name}
                  </div>
                  <div className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatTime(p.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Just joined</div>

          {recentJoins.length === 0 ? (
            <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Waiting for the first join…
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {recentJoins.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm text-zinc-900 dark:text-zinc-100">
                    {j.name}
                  </div>
                  <div className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatTime(j.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}