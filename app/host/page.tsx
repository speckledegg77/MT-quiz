"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@supabase/supabase-js";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import HostJoinedTeamsPanel from "@/components/HostJoinedTeamsPanel";

type PackRow = {
  id: string;
  display_name: string;
  round_type: string;
  sort_order: number | null;
  is_active: boolean | null;
};

type SelectionStrategy = "all_packs" | "per_pack";
type RoundFilter = "mixed" | "no_audio" | "no_image" | "audio_only" | "picture_only" | "audio_and_image";
type AudioMode = "display" | "phones" | "both";

function clampInt(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export default function HostPage() {
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }

    return createClient(url, key);
  }, []);

  const [packs, setPacks] = useState<PackRow[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);
  const [packsError, setPacksError] = useState<string | null>(null);

  const [choosePacks, setChoosePacks] = useState(false);
  const [selectedPacks, setSelectedPacks] = useState<Record<string, boolean>>({});

  const [selectionStrategy, setSelectionStrategy] = useState<SelectionStrategy>("all_packs");
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("mixed");
  const [audioMode, setAudioMode] = useState<AudioMode>("display");

  const [totalQuestions, setTotalQuestions] = useState<number>(20);

  const [perPackCounts, setPerPackCounts] = useState<Record<string, string>>({});

  const [countdownSeconds, setCountdownSeconds] = useState<number>(5);
  const [answerSeconds, setAnswerSeconds] = useState<number>(20);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [roomCode, setRoomCode] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const joinUrl = roomCode && origin ? `${origin}/join?code=${roomCode}` : "";
  const displayUrl = roomCode ? `/display/${roomCode}` : "";
  const playUrl = roomCode ? `/play/${roomCode}` : "";

  useEffect(() => {
    let cancelled = false;

    async function loadPacks() {
      setPacksLoading(true);
      setPacksError(null);

      const { data, error } = await supabase
        .from("packs")
        .select("id, display_name, round_type, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (cancelled) return;

      if (error) {
        setPacksError(error.message);
        setPacks([]);
      } else {
        setPacks((data ?? []) as PackRow[]);
      }

      setPacksLoading(false);
    }

    loadPacks();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (packs.length === 0) return;

    setSelectedPacks((prev) => {
      if (Object.keys(prev).length > 0) return prev;

      const next: Record<string, boolean> = {};
      for (const p of packs) next[p.id] = true;
      return next;
    });
  }, [packs]);

  function togglePack(packId: string) {
    setSelectedPacks((prev) => ({ ...prev, [packId]: !prev[packId] }));
  }

  function getSelectedPackIds() {
    if (!choosePacks) {
      return packs.map((p) => p.id);
    }

    return packs.filter((p) => selectedPacks[p.id]).map((p) => p.id);
  }

  function buildRoundsPayload(selectedIds: string[]) {
    const rounds = selectedIds.map((packId) => {
      const raw = perPackCounts[packId] ?? "";
      const asNum = raw.trim() === "" ? 0 : Number(raw);
      const count = clampInt(Number.isFinite(asNum) ? asNum : 0, 0, 9999);
      return { packId, count };
    });

    return rounds;
  }

  async function createRoom() {
    setCreating(true);
    setCreateError(null);

    try {
      const selectedIds = getSelectedPackIds();

      if (selectedIds.length === 0) {
        setCreateError("Select at least one pack.");
        setCreating(false);
        return;
      }

      const payload: any = {
        selectionStrategy,
        roundFilter,
        totalQuestions: clampInt(totalQuestions, 1, 200),
        selectedPacks: selectedIds,
        rounds: selectionStrategy === "per_pack" ? buildRoundsPayload(selectedIds) : [],
        countdownSeconds: clampInt(countdownSeconds, 0, 60),
        answerSeconds: clampInt(answerSeconds, 5, 120),
        audioMode,
      };

      const res = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setCreateError(data?.error ?? "Room creation failed.");
        setCreating(false);
        return;
      }

      const code = String(data?.code ?? "").toUpperCase();
      if (!code) {
        setCreateError("Room created, but no code returned.");
        setCreating(false);
        return;
      }

      setRoomCode(code);
    } catch (e: any) {
      setCreateError(e?.message ?? "Room creation failed.");
    } finally {
      setCreating(false);
    }
  }

  function onPerPackChange(packId: string, value: string) {
    if (value === "") {
      setPerPackCounts((prev) => ({ ...prev, [packId]: "" }));
      return;
    }

    if (!/^\d+$/.test(value)) return;

    setPerPackCounts((prev) => ({ ...prev, [packId]: value }));
  }

  function onPerPackBlur(packId: string) {
    const raw = perPackCounts[packId] ?? "";
    if (raw.trim() === "") return;

    const asNum = Number(raw);
    const clamped = clampInt(Number.isFinite(asNum) ? asNum : 0, 0, 9999);

    setPerPackCounts((prev) => ({ ...prev, [packId]: String(clamped) }));
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4">
        <div className="text-2xl font-semibold">Host</div>
        <div className="text-sm text-[var(--muted-foreground)]">
          Create a room, choose question settings, then open the display screen on your TV.
        </div>
      </div>

      {roomCode ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Room created</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4">
                  <div className="text-sm text-[var(--muted-foreground)]">Room code</div>
                  <div className="text-3xl font-semibold tracking-wide">{roomCode}</div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[var(--border)] p-4">
                    <div className="text-sm font-medium">Players join link</div>
                    <div className="mt-1 text-sm text-[var(--muted-foreground)] break-all">
                      {joinUrl}
                    </div>
                    <div className="mt-3 flex justify-center">
                      {joinUrl ? <QRCodeSVG value={joinUrl} size={200} /> : null}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] p-4">
                    <div className="text-sm font-medium">Open screens</div>

                    <div className="mt-3 grid gap-2">
                      <Link href={displayUrl}>
                        <Button className="w-full">Open TV display</Button>
                      </Link>

                      <Link href={playUrl}>
                        <Button variant="secondary" className="w-full">
                          Open player view (for testing)
                        </Button>
                      </Link>

                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => setRoomCode(null)}
                      >
                        Create another room
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="text-sm text-[var(--muted-foreground)]">
                Keep this page open if you want to watch teams join.
              </CardFooter>
            </Card>

            <HostJoinedTeamsPanel code={roomCode} />
          </div>

          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Quick checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[var(--muted-foreground)]">
              <div>Open the TV display on a big screen.</div>
              <div>Share the join link or show the QR code.</div>
              <div>Wait for teams to join, then start the game.</div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Room settings</CardTitle>
              </CardHeader>

              <CardContent className="grid gap-4">
                {createError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    {createError}
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-sm font-medium">Selection strategy</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Button
                        variant={selectionStrategy === "all_packs" ? undefined : "secondary"}
                        onClick={() => setSelectionStrategy("all_packs")}
                      >
                        Total count
                      </Button>
                      <Button
                        variant={selectionStrategy === "per_pack" ? undefined : "secondary"}
                        onClick={() => setSelectionStrategy("per_pack")}
                      >
                        Per pack
                      </Button>
                    </div>
                    <div className="mt-2 text-sm text-[var(--muted-foreground)]">
                      Total count picks a total number of questions. Per pack lets you set a count per pack.
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium">Question filter</div>
                    <select
                      className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                      value={roundFilter}
                      onChange={(e) => setRoundFilter(e.target.value as RoundFilter)}
                    >
                      <option value="mixed">Mixed</option>
                      <option value="no_audio">No audio</option>
                      <option value="no_image">No images</option>
                      <option value="audio_only">Audio only</option>
                      <option value="picture_only">Picture only</option>
                      <option value="audio_and_image">Audio + image only</option>
                    </select>
                    <div className="mt-2 text-sm text-[var(--muted-foreground)]">
                      Use this when you want to avoid certain round types.
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <div className="text-sm font-medium">Total questions</div>
                    <Input
                      className="mt-2"
                      inputMode="numeric"
                      value={String(totalQuestions)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") return;
                        if (!/^\d+$/.test(v)) return;
                        setTotalQuestions(Number(v));
                      }}
                      onBlur={() => setTotalQuestions((n) => clampInt(n, 1, 200))}
                    />
                    <div className="mt-2 text-sm text-[var(--muted-foreground)]">
                      Used when strategy is Total count.
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium">Countdown (seconds)</div>
                    <Input
                      className="mt-2"
                      inputMode="numeric"
                      value={String(countdownSeconds)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") return;
                        if (!/^\d+$/.test(v)) return;
                        setCountdownSeconds(Number(v));
                      }}
                      onBlur={() => setCountdownSeconds((n) => clampInt(n, 0, 60))}
                    />
                  </div>

                  <div>
                    <div className="text-sm font-medium">Answer time (seconds)</div>
                    <Input
                      className="mt-2"
                      inputMode="numeric"
                      value={String(answerSeconds)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") return;
                        if (!/^\d+$/.test(v)) return;
                        setAnswerSeconds(Number(v));
                      }}
                      onBlur={() => setAnswerSeconds((n) => clampInt(n, 5, 120))}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium">Audio mode</div>
                  <select
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                    value={audioMode}
                    onChange={(e) => setAudioMode(e.target.value as AudioMode)}
                  >
                    <option value="display">TV display only</option>
                    <option value="phones">Phones only</option>
                    <option value="both">Both</option>
                  </select>
                  <div className="mt-2 text-sm text-[var(--muted-foreground)]">
                    If you set Phones only, the TV will not autoplay clips.
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Choose packs</div>
                      <div className="text-sm text-[var(--muted-foreground)]">
                        Off means you use all active packs.
                      </div>
                    </div>

                    <Button
                      variant={choosePacks ? undefined : "secondary"}
                      onClick={() => setChoosePacks((v) => !v)}
                    >
                      {choosePacks ? "Choosing packs" : "Using all packs"}
                    </Button>
                  </div>

                  {selectionStrategy === "per_pack" ? (
                    <div className="mt-3 text-sm text-[var(--muted-foreground)]">
                      When using Per pack, set each pack’s count in the pack list.
                    </div>
                  ) : null}
                </div>
              </CardContent>

              <CardFooter className="flex items-center justify-between gap-3">
                <div className="text-sm text-[var(--muted-foreground)]">
                  {packsLoading ? "Loading packs…" : `${packs.length} active packs available`}
                </div>

                <Button onClick={createRoom} disabled={creating || packsLoading}>
                  {creating ? "Creating…" : "Create room"}
                </Button>
              </CardFooter>
            </Card>

            {packsError ? (
              <Card>
                <CardContent className="py-6 text-sm text-red-700 dark:text-red-200">
                  {packsError}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Packs</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3">
              {choosePacks ? (
                <div className="text-sm text-[var(--muted-foreground)]">
                  Tap packs to include them. Only selected packs will be used.
                </div>
              ) : (
                <div className="text-sm text-[var(--muted-foreground)]">
                  You are using all active packs. Turn on Choose packs to narrow it down.
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--card)]">
                    <tr className="border-b border-[var(--border)]">
                      <th className="px-3 py-2 text-left font-medium">Pack</th>
                      <th className="w-24 px-3 py-2 text-right font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packs.map((p) => {
                      const selected = choosePacks ? Boolean(selectedPacks[p.id]) : true;

                      return (
                        <tr
                          key={p.id}
                          className={`border-b border-[var(--border)] last:border-b-0 ${
                            choosePacks ? "cursor-pointer" : ""
                          }`}
                          onClick={() => {
                            if (!choosePacks) return;
                            togglePack(p.id);
                          }}
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {choosePacks ? (
                                <span
                                  className={`inline-block h-3 w-3 rounded-sm border ${
                                    selected
                                      ? "bg-emerald-500/60 border-emerald-500/60"
                                      : "bg-transparent border-[var(--border)]"
                                  }`}
                                />
                              ) : null}
                              <div className="min-w-0">
                                <div className="truncate font-medium">{p.display_name}</div>
                                <div className="truncate text-xs text-[var(--muted-foreground)]">
                                  {p.round_type}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-3 py-2 text-right">
                            {selectionStrategy === "per_pack" ? (
                              <input
                                className="w-16 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-right text-sm"
                                inputMode="numeric"
                                value={perPackCounts[p.id] ?? ""}
                                onChange={(e) => onPerPackChange(p.id, e.target.value)}
                                onBlur={() => onPerPackBlur(p.id)}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="0"
                              />
                            ) : (
                              <span className="text-xs text-[var(--muted-foreground)]">n/a</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {packs.length === 0 && !packsLoading ? (
                      <tr>
                        <td className="px-3 py-4 text-sm text-[var(--muted-foreground)]" colSpan={2}>
                          No active packs found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>

            <CardFooter className="text-xs text-[var(--muted-foreground)]">
              Packs come from the Supabase packs table.
            </CardFooter>
          </Card>
        </div>
      )}
    </main>
  );
}