"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";

import { supabase } from "@/lib/supabaseClient";
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
type RoundFilter =
  | "mixed"
  | "no_audio"
  | "no_image"
  | "audio_only"
  | "picture_only"
  | "audio_and_image";
type AudioMode = "display" | "phones" | "both";

type RoomState = any;

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function parseIntOr(value: string, fallback: number) {
  const v = value.trim();
  if (v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

export default function HostPage() {
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);
  const [packsError, setPacksError] = useState<string | null>(null);

  const [selectPacks, setSelectPacks] = useState(false);
  const [selectedPacks, setSelectedPacks] = useState<Record<string, boolean>>({});

  const [selectionStrategy, setSelectionStrategy] = useState<SelectionStrategy>("all_packs");
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("mixed");
  const [audioMode, setAudioMode] = useState<AudioMode>("display");

  const [totalQuestionsStr, setTotalQuestionsStr] = useState<string>("20");
  const [countdownSecondsStr, setCountdownSecondsStr] = useState<string>("5");
  const [answerSecondsStr, setAnswerSecondsStr] = useState<string>("20");

  const [perPackCounts, setPerPackCounts] = useState<Record<string, string>>({});

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomPhase, setRoomPhase] = useState<string>("lobby");
  const [roomStage, setRoomStage] = useState<string>("lobby");

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startOk, setStartOk] = useState<string | null>(null);

  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetOk, setResetOk] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const joinUrl = roomCode && origin ? `${origin}/join?code=${roomCode}` : "";
  const displayUrl = roomCode ? `/display/${roomCode}` : "";
  const playUrl = roomCode ? `/play/${roomCode}` : "";

  const mustShowPackPicker = selectionStrategy === "per_pack";
  const showPackPicker = selectPacks || mustShowPackPicker;

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
  }, []);

  useEffect(() => {
    if (packs.length === 0) return;

    setSelectedPacks((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const next: Record<string, boolean> = {};
      for (const p of packs) next[p.id] = true;
      return next;
    });

    setPerPackCounts((prev) => {
      const next = { ...prev };
      for (const p of packs) {
        if (next[p.id] === undefined) next[p.id] = "";
      }
      return next;
    });
  }, [packs]);

  useEffect(() => {
    if (!roomCode) return;

    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/room/state?code=${roomCode}`, { cache: "no-store" });
        const data: RoomState = await res.json();

        if (cancelled) return;

        if (res.ok) {
          setRoomPhase(String(data?.phase ?? "lobby"));
          setRoomStage(String(data?.stage ?? "lobby"));
        }
      } catch {
        // ignore
      }
    }

    tick();
    const id = setInterval(tick, 1000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomCode]);

  function togglePack(packId: string) {
    setSelectedPacks((prev) => ({ ...prev, [packId]: !prev[packId] }));
  }

  function getSelectedPackIds(): string[] {
    if (!showPackPicker) return packs.map((p) => p.id);
    return packs.filter((p) => selectedPacks[p.id]).map((p) => p.id);
  }

  function buildRoundsPayload(selectedIds: string[]) {
    return selectedIds
      .map((packId) => {
        const raw = perPackCounts[packId] ?? "";
        const count = clampInt(parseIntOr(raw, 0), 0, 9999);
        return { packId, count };
      })
      .filter((r) => r.count > 0);
  }

  async function createRoom() {
    setCreating(true);
    setCreateError(null);
    setStartError(null);
    setStartOk(null);
    setResetError(null);
    setResetOk(null);

    try {
      const selectedIds = getSelectedPackIds();

      if (selectedIds.length === 0) {
        setCreateError("Select at least one pack.");
        setCreating(false);
        return;
      }

      const totalQuestions = clampInt(parseIntOr(totalQuestionsStr, 20), 1, 200);
      const countdownSeconds = clampInt(parseIntOr(countdownSecondsStr, 5), 0, 60);
      const answerSeconds = clampInt(parseIntOr(answerSecondsStr, 20), 5, 120);

      const rounds = selectionStrategy === "per_pack" ? buildRoundsPayload(selectedIds) : [];

      if (selectionStrategy === "per_pack" && rounds.length === 0) {
        setCreateError("Set a question count for at least one selected pack.");
        setCreating(false);
        return;
      }

      const payload: any = {
        selectionStrategy,
        roundFilter,
        totalQuestions,
        selectedPacks: selectedIds,
        rounds,
        countdownSeconds,
        answerSeconds,
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
      setRoomPhase("lobby");
      setRoomStage("lobby");
    } catch (e: any) {
      setCreateError(e?.message ?? "Room creation failed.");
    } finally {
      setCreating(false);
    }
  }

  async function startGame() {
    if (!roomCode) return;

    setStarting(true);
    setStartError(null);
    setStartOk(null);

    try {
      const res = await fetch("/api/room/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStartError(data?.error ?? "Could not start game.");
        return;
      }

      setRoomPhase("running");
      setRoomStage("countdown");
      setStartOk("Game started. Joining is now closed.");
    } catch (e: any) {
      setStartError(e?.message ?? "Could not start game.");
    } finally {
      setStarting(false);
    }
  }

  async function resetRoom() {
    if (!roomCode) return;

    setResetting(true);
    setResetError(null);
    setResetOk(null);
    setStartError(null);
    setStartOk(null);

    try {
      const res = await fetch("/api/room/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResetError(data?.error ?? "Reset failed.");
        return;
      }

      setRoomPhase("lobby");
      setRoomStage("lobby");
      setResetOk("Room reset. Teams kept, scores set to 0, new questions picked, and joining is open again.");
    } catch (e: any) {
      setResetError(e?.message ?? "Reset failed.");
    } finally {
      setResetting(false);
    }
  }

  function onDigitsChange(setter: (v: string) => void, value: string) {
    if (value === "") {
      setter("");
      return;
    }
    if (!/^\d+$/.test(value)) return;
    setter(value);
  }

  function onDigitsBlur(
    setter: (v: string) => void,
    value: string,
    fallback: number,
    min: number,
    max: number
  ) {
    const n = clampInt(parseIntOr(value, fallback), min, max);
    setter(String(n));
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
    const clamped = clampInt(parseIntOr(raw, 0), 0, 9999);
    setPerPackCounts((prev) => ({ ...prev, [packId]: String(clamped) }));
  }

  const stagePill = useMemo(() => {
    if (roomPhase === "running") {
      if (roomStage === "countdown") return "Countdown";
      if (roomStage === "open") return "Answering";
      if (roomStage === "wait") return "Waiting";
      if (roomStage === "reveal") return "Reveal";
      return "Running";
    }
    if (roomPhase === "finished") return "Finished";
    return "Lobby";
  }, [roomPhase, roomStage]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4">
        <div className="text-2xl font-semibold">Host</div>
        <div className="text-sm text-[var(--muted-foreground)]">
          Create a room, then open the display screen on your TV.
        </div>
      </div>

      {roomCode ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 grid gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle>Room created</CardTitle>
                  <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-sm text-[var(--muted-foreground)]">
                    {stagePill}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {startError ? (
                  <div className="rounded-lg border border-red-300 bg-red-600/10 px-3 py-2 text-sm text-red-600">
                    {startError}
                  </div>
                ) : null}

                {startOk ? (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-700">
                    {startOk}
                  </div>
                ) : null}

                {resetError ? (
                  <div className="rounded-lg border border-red-300 bg-red-600/10 px-3 py-2 text-sm text-red-600">
                    {resetError}
                  </div>
                ) : null}

                {resetOk ? (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-700">
                    {resetOk}
                  </div>
                ) : null}

                <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4">
                  <div className="text-sm text-[var(--muted-foreground)]">Room code</div>
                  <div className="text-3xl font-semibold tracking-wide">{roomCode}</div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[var(--border)] p-4">
                    <div className="text-sm font-medium">Players join link</div>
                    <div className="mt-1 text-sm text-[var(--muted-foreground)] break-all">{joinUrl}</div>
                    <div className="mt-3 flex justify-center">
                      {joinUrl ? <QRCodeSVG value={joinUrl} size={200} /> : null}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] p-4">
                    <div className="text-sm font-medium">Controls</div>

                    <div className="mt-3 grid gap-2">
                      <Link href={displayUrl}>
                        <Button variant="secondary" className="w-full">
                          Open TV display
                        </Button>
                      </Link>

                      <Button
                        className="w-full"
                        onClick={startGame}
                        disabled={starting || resetting || roomPhase !== "lobby"}
                      >
                        {roomPhase === "lobby"
                          ? starting
                            ? "Starting…"
                            : "Start game"
                          : roomPhase === "running"
                          ? "Game running"
                          : "Game finished"}
                      </Button>

                      <Link href={playUrl}>
                        <Button variant="secondary" className="w-full">
                          Open player view (for testing)
                        </Button>
                      </Link>

                      <Button variant="danger" className="w-full" onClick={resetRoom} disabled={resetting}>
                        {resetting ? "Resetting…" : "Reset room (keep code)"}
                      </Button>

                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => {
                          setRoomCode(null);
                          setRoomPhase("lobby");
                          setRoomStage("lobby");
                          setStartError(null);
                          setStartOk(null);
                          setResetError(null);
                          setResetOk(null);
                        }}
                      >
                        Create another room
                      </Button>
                    </div>

                    <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                      Open TV display first, then press Start game.
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
              <div>Press Start game when everyone has joined.</div>
              <div>If you started too early, press Reset.</div>
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
                  <div className="rounded-lg border border-red-300 bg-red-600/10 px-3 py-2 text-sm text-red-600">
                    {createError}
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-sm font-medium">How to pick questions</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Button
                        variant={selectionStrategy === "all_packs" ? "primary" : "secondary"}
                        onClick={() => setSelectionStrategy("all_packs")}
                      >
                        Total count
                      </Button>
                      <Button
                        variant={selectionStrategy === "per_pack" ? "primary" : "secondary"}
                        onClick={() => setSelectionStrategy("per_pack")}
                      >
                        Per pack
                      </Button>
                    </div>
                    <div className="mt-2 text-sm text-[var(--muted-foreground)]">
                      Total count picks a total number of questions. Per pack lets you set counts for chosen packs.
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
                      placeholder="20"
                      value={totalQuestionsStr}
                      onChange={(e) => onDigitsChange(setTotalQuestionsStr, e.target.value)}
                      onBlur={() => onDigitsBlur(setTotalQuestionsStr, totalQuestionsStr, 20, 1, 200)}
                    />
                  </div>

                  <div>
                    <div className="text-sm font-medium">Countdown (seconds)</div>
                    <Input
                      className="mt-2"
                      inputMode="numeric"
                      placeholder="5"
                      value={countdownSecondsStr}
                      onChange={(e) => onDigitsChange(setCountdownSecondsStr, e.target.value)}
                      onBlur={() => onDigitsBlur(setCountdownSecondsStr, countdownSecondsStr, 5, 0, 60)}
                    />
                  </div>

                  <div>
                    <div className="text-sm font-medium">Answer time (seconds)</div>
                    <Input
                      className="mt-2"
                      inputMode="numeric"
                      placeholder="20"
                      value={answerSecondsStr}
                      onChange={(e) => onDigitsChange(setAnswerSecondsStr, e.target.value)}
                      onBlur={() => onDigitsBlur(setAnswerSecondsStr, answerSecondsStr, 20, 5, 120)}
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
                </div>

                <div className="rounded-xl border border-[var(--border)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Packs</div>
                      <div className="text-sm text-[var(--muted-foreground)]">
                        {mustShowPackPicker
                          ? "Per pack needs you to pick packs and set counts."
                          : selectPacks
                          ? "Select the packs you want to use."
                          : "Use all active packs by default."}
                      </div>
                    </div>

                    {mustShowPackPicker ? (
                      <Button variant="secondary" disabled>
                        Select packs
                      </Button>
                    ) : (
                      <Button
                        variant={selectPacks ? "primary" : "secondary"}
                        onClick={() => setSelectPacks((v) => !v)}
                      >
                        {selectPacks ? "Selecting packs" : "Select packs"}
                      </Button>
                    )}
                  </div>
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
                <CardContent className="py-6 text-sm text-red-600">{packsError}</CardContent>
              </Card>
            ) : null}
          </div>

          {showPackPicker ? (
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Select packs</CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="text-sm text-[var(--muted-foreground)]">
                  Tap packs to include them.
                  {selectionStrategy === "per_pack" ? " Set a count for at least one selected pack." : ""}
                </div>

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
                        const selected = Boolean(selectedPacks[p.id]);

                        return (
                          <tr
                            key={p.id}
                            className="border-b border-[var(--border)] last:border-b-0 cursor-pointer"
                            onClick={() => togglePack(p.id)}
                          >
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-block h-3 w-3 rounded-sm border ${
                                    selected
                                      ? "bg-emerald-500/60 border-emerald-500/60"
                                      : "bg-transparent border-[var(--border)]"
                                  }`}
                                />
                                <div className="min-w-0">
                                  <div className="truncate font-medium">{p.display_name}</div>
                                  <div className="truncate text-xs text-[var(--muted-foreground)]">{p.round_type}</div>
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
                You can keep this closed when you use all packs.
              </CardFooter>
            </Card>
          ) : (
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Packs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-[var(--muted-foreground)]">
                <div>You are using all active packs.</div>
                <div>Press Select packs if you want to narrow it down.</div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="mt-6 text-sm text-[var(--muted-foreground)]">
        <Link href="/" className="underline">
          Back to home
        </Link>
      </div>
    </main>
  );
}