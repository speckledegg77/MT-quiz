"use client";

import { useEffect, useState } from "react";
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

  // String inputs so you can clear the field while typing
  const [totalQuestionsStr, setTotalQuestionsStr] = useState<string>("20");
  const [countdownSecondsStr, setCountdownSecondsStr] = useState<string>("5");
  const [answerSecondsStr, setAnswerSecondsStr] = useState<string>("20");

  // Per-pack counts (string so blank is allowed while typing)
  const [perPackCounts, setPerPackCounts] = useState<Record<string, string>>({});

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [roomCode, setRoomCode] = useState<string | null>(null);

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
        setPacksLoading(false);
        return;
      }

      setPacks((data ?? []) as PackRow[]);
      setPacksLoading(false);
    }

    loadPacks();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!packs || packs.length === 0) return;

    setSelectedPacks((prev) => {
      const next = { ...prev };
      for (const p of packs) {
        if (next[p.id] === undefined) next[p.id] = false;
      }
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

  function setAllSelected(value: boolean) {
    const next: Record<string, boolean> = {};
    for (const p of packs) next[p.id] = value;
    setSelectedPacks(next);
  }

  function togglePack(id: string) {
    setSelectedPacks((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function selectedPackIds() {
    return packs.filter((p) => selectedPacks[p.id]).map((p) => p.id);
  }

  function effectiveSelectionStrategy(): SelectionStrategy {
    if (!selectPacks) return "all_packs";
    return selectionStrategy;
  }

  function buildPerPackCountsObject() {
    const obj: Record<string, number> = {};
    for (const p of packs) {
      if (!selectedPacks[p.id]) continue;
      const raw = perPackCounts[p.id] ?? "";
      const n = parseIntOr(raw, 0);
      if (n > 0) obj[p.id] = n;
    }
    return obj;
  }

  async function createRoom() {
    setCreating(true);
    setCreateError(null);

    try {
      const totalQuestions = clampInt(parseIntOr(totalQuestionsStr, 20), 1, 200);
      const countdownSeconds = clampInt(parseIntOr(countdownSecondsStr, 5), 0, 30);
      const answerSeconds = clampInt(parseIntOr(answerSecondsStr, 20), 5, 120);

      const strategy = effectiveSelectionStrategy();
      const packIds =
        strategy === "all_packs" ? [] : strategy === "per_pack" ? selectedPackIds() : selectedPackIds();

      if (selectPacks && packIds.length === 0) {
        setCreateError("Select at least one pack, or switch to using all packs.");
        setCreating(false);
        return;
      }

      const payload: any = {
        total_questions: totalQuestions,
        countdown_seconds: countdownSeconds,
        answer_seconds: answerSeconds,
        round_filter: roundFilter,
        audio_mode: audioMode,
        selection_strategy: strategy,
        selected_pack_ids: packIds,
      };

      if (strategy === "per_pack") {
        payload.per_pack_counts = buildPerPackCountsObject();
      }

      const res = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setCreateError(json?.error ?? "Failed to create room");
        setCreating(false);
        return;
      }

      setRoomCode(json.code);
      setCreating(false);
    } catch (e: any) {
      setCreateError(e?.message ?? "Failed to create room");
      setCreating(false);
    }
  }

  const joinUrl = roomCode
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/join?code=${roomCode}`
    : "";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Host</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Create a room, share the code, and start the quiz.
          </p>
        </div>

        <Link href="/" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          Back to home
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create a room</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-sm font-medium">Total questions</div>
                <Input
                  value={totalQuestionsStr}
                  onChange={(e) => setTotalQuestionsStr(e.target.value)}
                  inputMode="numeric"
                />
              </div>

              <div>
                <div className="text-sm font-medium">Countdown seconds</div>
                <Input
                  value={countdownSecondsStr}
                  onChange={(e) => setCountdownSecondsStr(e.target.value)}
                  inputMode="numeric"
                />
              </div>

              <div>
                <div className="text-sm font-medium">Answer seconds</div>
                <Input
                  value={answerSecondsStr}
                  onChange={(e) => setAnswerSecondsStr(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-sm font-medium">Round filter</div>
                <select
                  value={roundFilter}
                  onChange={(e) => setRoundFilter(e.target.value as RoundFilter)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <option value="mixed">Mixed</option>
                  <option value="no_audio">No audio</option>
                  <option value="no_image">No pictures</option>
                  <option value="audio_only">Audio only</option>
                  <option value="picture_only">Pictures only</option>
                  <option value="audio_and_image">Audio and pictures</option>
                </select>
              </div>

              <div>
                <div className="text-sm font-medium">Audio mode</div>
                <select
                  value={audioMode}
                  onChange={(e) => setAudioMode(e.target.value as AudioMode)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <option value="display">Display only</option>
                  <option value="phones">Phones only</option>
                  <option value="both">Both</option>
                </select>
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectPacks}
                    onChange={(e) => setSelectPacks(e.target.checked)}
                  />
                  Select packs
                </label>
              </div>
            </div>

            {selectPacks ? (
              <div className="rounded-2xl border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">Packs</div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                      onClick={() => setAllSelected(true)}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                      onClick={() => setAllSelected(false)}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="selectionStrategy"
                      value="all_packs"
                      checked={selectionStrategy === "all_packs"}
                      onChange={() => setSelectionStrategy("all_packs")}
                    />
                    Use all selected packs
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="selectionStrategy"
                      value="per_pack"
                      checked={selectionStrategy === "per_pack"}
                      onChange={() => setSelectionStrategy("per_pack")}
                    />
                    Allocate per pack
                  </label>
                </div>

                {packsLoading ? (
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">Loading packs…</div>
                ) : packsError ? (
                  <div className="text-sm text-red-600">{packsError}</div>
                ) : (
                  <div className="space-y-2">
                    {packs.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={!!selectedPacks[p.id]}
                            onChange={() => togglePack(p.id)}
                          />
                          <span className="truncate">{p.display_name}</span>
                        </label>

                        {selectionStrategy === "per_pack" ? (
                          <input
                            className="w-24 rounded-xl border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                            inputMode="numeric"
                            placeholder="Count"
                            value={perPackCounts[p.id] ?? ""}
                            onChange={(e) =>
                              setPerPackCounts((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {createError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                {createError}
              </div>
            ) : null}
          </CardContent>

          <CardFooter>
            <Button onClick={createRoom} disabled={creating}>
              {creating ? "Creating…" : "Create room"}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Room</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {roomCode ? (
              <>
                <div className="grid gap-2">
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">Room code</div>
                  <div className="text-2xl font-semibold tracking-widest">{roomCode}</div>
                </div>

                <div className="grid gap-2">
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">Join link</div>
                  <div className="break-all rounded-xl border border-zinc-200 bg-white p-2 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                    {joinUrl}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <QRCodeSVG value={joinUrl} size={156} />
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">
                    Teams can join on their phones at <span className="font-medium">/join</span>.
                  </div>
                </div>

                <HostJoinedTeamsPanel code={roomCode} />
              </>
            ) : (
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                Create a room to see the join code and QR.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}