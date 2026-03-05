"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type PlayerPublic = {
  id: string;
  name: string;
  team_name?: string | null;
  score?: number | null;
  joined_at?: string | null;
  created_at?: string | null;
};

function normaliseName(name: string) {
  return String(name ?? "").trim().toLowerCase();
}

function getIso(p: PlayerPublic) {
  return p.joined_at ?? p.created_at ?? "";
}

function getMs(p: PlayerPublic) {
  const iso = getIso(p);
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function formatTime(iso: string) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function JoinFeedPanel({ players }: { players: PlayerPublic[] }) {
  const uniquePlayers = useMemo(() => {
    const sorted = [...(players ?? [])].sort((a, b) => getMs(a) - getMs(b));
    const seen = new Set<string>();
    const out: PlayerPublic[] = [];

    for (const p of sorted) {
      const key = normaliseName(p.name);
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }

    return out;
  }, [players]);

  const recent = useMemo(() => {
    const last = uniquePlayers.slice(-6);
    return [...last].reverse();
  }, [uniquePlayers]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Players joining</CardTitle>
        <div className="mt-1 text-sm text-[var(--muted-foreground)]">
          Live join feed for this room
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] p-3">
            <div className="text-sm font-semibold">Joined players ({uniquePlayers.length})</div>

            {uniquePlayers.length === 0 ? (
              <div className="mt-2 text-sm text-[var(--muted-foreground)]">No players yet.</div>
            ) : (
              <ul className="mt-2 space-y-2">
                {uniquePlayers.map((p) => {
                  const iso = getIso(p);
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate text-sm">
                        {p.name}
                        {p.team_name ? (
                          <span className="ml-2 text-xs text-[var(--muted-foreground)]">{p.team_name}</span>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-xs text-[var(--muted-foreground)]">
                        {iso ? formatTime(iso) : ""}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border)] p-3">
            <div className="text-sm font-semibold">Just joined</div>

            {recent.length === 0 ? (
              <div className="mt-2 text-sm text-[var(--muted-foreground)]">
                Waiting for the first join…
              </div>
            ) : (
              <ul className="mt-2 space-y-2">
                {recent.map((p) => {
                  const iso = getIso(p);
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate text-sm">
                        {p.name}
                        {p.team_name ? (
                          <span className="ml-2 text-xs text-[var(--muted-foreground)]">{p.team_name}</span>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-xs text-[var(--muted-foreground)]">
                        {iso ? formatTime(iso) : ""}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}