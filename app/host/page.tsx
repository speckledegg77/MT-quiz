"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

import type { RoundFilter, SelectionStrategy } from "@/lib/questionSelection";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type AudioMode = "display" | "phones" | "both";

type PackInfo = {
  id: string;
  label: string;
  questionCount: number;
  audioCount: number;
};

type RoundRequest = { packId: string; count: number };

function normaliseRoundFilter(raw: any): RoundFilter {
  const v = String(raw ?? "").toLowerCase();

  if (v === "no_audio") return "no_audio";
  if (v === "no_image") return "no_image";
  if (v === "audio_only") return "audio_only";
  if (v === "picture_only") return "picture_only";
  if (v === "audio_and_image") return "audio_and_image";

  return "mixed";
}

function formatFilterLabel(f: RoundFilter) {
  if (f === "no_audio") return "No audio";
  if (f === "no_image") return "No image";
  if (f === "audio_only") return "Audio only";
  if (f === "picture_only") return "Picture only";
  if (f === "audio_and_image") return "Audio and image only";
  return "Mixed";
}

function formatAudioMode(m: AudioMode) {
  if (m === "phones") return "Phones";
  if (m === "both") return "TV and phones";
  return "TV display";
}

export default function HostCreatePage() {
  const router = useRouter();

  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const [answerSeconds, setAnswerSeconds] = useState(60);
  const [revealDelaySeconds, setRevealDelaySeconds] = useState(2);
  const [revealSeconds, setRevealSeconds] = useState(5);

  const [audioMode, setAudioMode] = useState<AudioMode>("display");

  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [selectedPacks, setSelectedPacks] = useState<string[]>([]);
  const [packCounts, setPackCounts] = useState<Record<string, number>>({});

  const [choosePacks, setChoosePacks] = useState(false);

  const [selectionStrategy, setSelectionStrategy] = useState<SelectionStrategy>("per_pack");
  const [totalQuestionsAllPacks, setTotalQuestionsAllPacks] = useState<number>(20);
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("mixed");

  const [packSearch, setPackSearch] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [showAudioOnly, setShowAudioOnly] = useState(false);

  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPacks, setLoadingPacks] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingPacks(true);
      setError(null);

      try {
        const res = await fetch("/api/packs", { cache: "no-store" });
        const data = await res.json();

        if (cancelled) return;

        const list: PackInfo[] = Array.isArray(data?.packs) ? data.packs : [];
        setPacks(list);

        if (list.length > 0) {
          setSelectedPacks((prev) => {
            if (prev.length > 0) return prev;
            return [list[0].id];
          });

          setPackCounts((prev) => {
            const next = { ...prev };
            for (const p of list) {
              if (next[p.id] == null) {
                const def = Math.min(10, Math.max(1, Number(p.questionCount || 10)));
                next[p.id] = def;
              }
            }
            return next;
          });
        }
      } catch {
        if (!cancelled) setError("Could not load pack list.");
      } finally {
        if (!cancelled) setLoadingPacks(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (roundFilter === "audio_only" || roundFilter === "picture_only") {
      setSelectionStrategy("all_packs");
    }
  }, [roundFilter]);

  const effectiveSelectedPacks = useMemo(() => {
    return choosePacks ? selectedPacks : packs.map((p) => p.id);
  }, [choosePacks, selectedPacks, packs]);

  const effectiveStrategy: SelectionStrategy = useMemo(() => {
    return choosePacks ? selectionStrategy : "all_packs";
  }, [choosePacks, selectionStrategy]);

  function togglePack(id: string) {
    setSelectedPacks((prev) => {
      const on = prev.includes(id);
      if (on) return prev.filter((x) => x !== id);
      return [...prev, id];
    });

    setPackCounts((prev) => {
      if (prev[id] != null) return prev;
      return { ...prev, [id]: 10 };
    });
  }

  const filteredPacks = useMemo(() => {
    const q = packSearch.trim().toLowerCase();

    const base = packs.filter((p) => {
      if (showSelectedOnly && !selectedPacks.includes(p.id)) return false;
      if (showAudioOnly && (p.audioCount ?? 0) <= 0) return false;

      if (!q) return true;

      const hay = `${p.label} ${p.id}`.toLowerCase();
      return hay.includes(q);
    });

    base.sort((a, b) => {
      const aSel = selectedPacks.includes(a.id) ? 0 : 1;
      const bSel = selectedPacks.includes(b.id) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return a.label.localeCompare(b.label);
    });

    return base;
  }, [packs, packSearch, selectedPacks, showSelectedOnly, showAudioOnly]);

  function selectAllVisible() {
    const visibleIds = filteredPacks.map((p) => p.id);
    setSelectedPacks((prev) => {
      const set = new Set(prev);
      for (const id of visibleIds) set.add(id);
      return Array.from(set);
    });
  }

  function clearAll() {
    setSelectedPacks([]);
  }

  function setCountForPack(id: string, value: number, maxForPack: number) {
    const n = Math.max(1, Math.floor(Number(value)));
    const clamped = Math.min(n, Math.max(1, Math.floor(Number(maxForPack || n))));
    setPackCounts((prev) => ({ ...prev, [id]: clamped }));
  }

  const rounds: RoundRequest[] = useMemo(() => {
    if (effectiveStrategy !== "per_pack") return [];
    if (!choosePacks) return [];

    const map = new Map(packs.map((p) => [p.id, p.questionCount]));
    return selectedPacks
      .map((packId) => {
        const count = Number(packCounts[packId] ?? 0);
        const max = Number(map.get(packId) ?? count);
        const safe = Math.min(Math.max(1, Math.floor(count)), Math.max(1, Math.floor(max || count)));
        return { packId, count: safe };
      })
      .filter((r) => r.packId && r.count > 0);
  }, [effectiveStrategy, choosePacks, selectedPacks, packCounts, packs]);

  const totalQuestionsFromPacks = useMemo(() => rounds.reduce((sum, r) => sum + r.count, 0), [rounds]);

  const totalQuestionsToPick =
    effectiveStrategy === "all_packs" ? totalQuestionsAllPacks : totalQuestionsFromPacks;

  const selectedCount = choosePacks ? selectedPacks.length : packs.length;

  async function createRoom() {
    setError(null);

    if (loadingPacks) {
      setError("Pack list is still loading.");
      return;
    }

    if (packs.length === 0) {
      setError("No packs found.");
      return;
    }

    if (choosePacks && selectedPacks.length === 0) {
      setError("Pick at least one pack, or turn off pack selection to use all packs.");
      return;
    }

    if (effectiveStrategy === "per_pack" && rounds.length === 0) {
      setError("Set a question count for at least one selected pack.");
      return;
    }

    if (!Number.isFinite(totalQuestionsToPick) || totalQuestionsToPick <= 0) {
      setError("Set a question count greater than 0.");
      return;
    }

    const safeFilter = normaliseRoundFilter(roundFilter);

    const res = await fetch("/api/room/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectionStrategy: effectiveStrategy,
        roundFilter: safeFilter,
        totalQuestions: totalQuestionsToPick,

        rounds: effectiveStrategy === "per_pack" ? rounds : [],
        selectedPacks: effectiveSelectedPacks,
        questionCount: totalQuestionsToPick,

        countdownSeconds,
        answerSeconds,
        revealDelaySeconds,
        revealSeconds,
        audioMode,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not create room.");
      return;
    }

    setCode(data.code);
  }

  async function startGame() {
    if (!code) return;

    await fetch("/api/room/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    router.push(`/display/${code}`);
  }

  function resetRoom() {
    setCode(null);
    setError(null);
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const joinUrl = useMemo(() => (code && origin ? `${origin}/join?code=${code}` : ""), [code, origin]);
  const displayUrl = useMemo(() => (code && origin ? `${origin}/display/${code}` : ""), [code, origin]);

  const canCreate =
    !loadingPacks &&
    packs.length > 0 &&
    totalQuestionsToPick > 0 &&
    (!choosePacks || selectedPacks.length > 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Host</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Pick packs and settings, then create a room.</p>
        </div>

        {code ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={resetRoom}>
              Create new room
            </Button>
            <Button onClick={startGame}>Start game</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.push("/join")}>
              Join
            </Button>
          </div>
        )}
      </div>

      {code ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Room</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-2">
                <div className="text-xs text-[var(--muted-foreground)]">Room code</div>
                <div className="text-2xl font-semibold tracking-wide">{code}</div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-[var(--muted-foreground)]">Players join</div>
                <a className="break-all text-sm underline" href={joinUrl}>
                  {joinUrl}
                </a>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-[var(--muted-foreground)]">TV display</div>
                <a className="break-all text-sm underline" href={displayUrl}>
                  {displayUrl}
                </a>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs text-[var(--muted-foreground)]">Packs</div>
                    <div>{choosePacks ? `Custom (${selectedCount})` : `All (${selectedCount})`}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--muted-foreground)]">Questions</div>
                    <div>{totalQuestionsToPick}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--muted-foreground)]">Type</div>
                    <div>{formatFilterLabel(roundFilter)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--muted-foreground)]">Audio</div>
                    <div>{formatAudioMode(audioMode)}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Scan to join</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center py-8">
              {joinUrl ? <QRCodeSVG value={joinUrl} size={240} /> : null}
            </CardContent>
            <CardFooter className="text-sm text-[var(--muted-foreground)]">
              Open the join link on a phone if the QR code does not scan.
            </CardFooter>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={choosePacks ? "grid gap-4 lg:order-1" : "grid gap-4 lg:col-span-2 lg:max-w-2xl lg:mx-auto"}>
            <Card>
              <CardHeader>
                <CardTitle>Setup</CardTitle>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="grid gap-2">
                  <div className="text-sm font-medium">Pack selection</div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="packMode" checked={!choosePacks} onChange={() => setChoosePacks(false)} />
                      <span>Use all packs ({packs.length})</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="packMode" checked={choosePacks} onChange={() => setChoosePacks(true)} />
                      <span>Choose packs</span>
                    </label>
                  </div>

                  {!choosePacks ? (
                    <div className="text-xs text-[var(--muted-foreground)]">
                      The game will pick questions at random from every pack in your database.
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <div className="text-sm font-medium">Question selection</div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="strategy"
                        checked={effectiveStrategy === "per_pack"}
                        onChange={() => setSelectionStrategy("per_pack")}
                        disabled={!choosePacks || roundFilter === "audio_only" || roundFilter === "picture_only"}
                      />
                      <span>Pick counts per pack</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="strategy"
                        checked={effectiveStrategy === "all_packs"}
                        onChange={() => setSelectionStrategy("all_packs")}
                      />
                      <span>Pick one total across the chosen set</span>
                    </label>
                  </div>

                  {effectiveStrategy === "per_pack" ? (
                    <div className="text-sm text-[var(--muted-foreground)]">Total questions: {totalQuestionsFromPacks}</div>
                  ) : (
                    <div className="grid gap-2 sm:max-w-xs">
                      <div className="text-sm text-[var(--muted-foreground)]">Total questions</div>
                      <Input
                        type="number"
                        min={1}
                        value={totalQuestionsAllPacks}
                        onChange={(e) => setTotalQuestionsAllPacks(Number(e.target.value))}
                      />
                    </div>
                  )}
                </div>

                <div className="grid gap-2">
                  <div className="text-sm font-medium">Question types</div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="roundFilter" checked={roundFilter === "mixed"} onChange={() => setRoundFilter("mixed")} />
                      <span>Mixed</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="roundFilter" checked={roundFilter === "no_audio"} onChange={() => setRoundFilter("no_audio")} />
                      <span>No audio</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="roundFilter" checked={roundFilter === "no_image"} onChange={() => setRoundFilter("no_image")} />
                      <span>No image</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="roundFilter"
                        checked={roundFilter === "audio_and_image"}
                        onChange={() => setRoundFilter("audio_and_image")}
                      />
                      <span>Audio and image only</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="roundFilter" checked={roundFilter === "audio_only"} onChange={() => setRoundFilter("audio_only")} />
                      <span>Audio only</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="roundFilter" checked={roundFilter === "picture_only"} onChange={() => setRoundFilter("picture_only")} />
                      <span>Picture only</span>
                    </label>
                  </div>

                  <div className="text-xs text-[var(--muted-foreground)]">
                    Audio only and picture only use one total across the chosen set.
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="text-sm font-medium">Audio playback</div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="audioMode" checked={audioMode === "display"} onChange={() => setAudioMode("display")} />
                      <span>TV display</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="audioMode" checked={audioMode === "phones"} onChange={() => setAudioMode("phones")} />
                      <span>Phones</span>
                    </label>

                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input type="radio" name="audioMode" checked={audioMode === "both"} onChange={() => setAudioMode("both")} />
                      <span>TV and phones</span>
                    </label>
                  </div>
                </div>

                <details className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">Advanced timing</summary>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <div className="text-xs text-[var(--muted-foreground)]">Countdown</div>
                      <Input type="number" min={0} value={countdownSeconds} onChange={(e) => setCountdownSeconds(Number(e.target.value))} />
                    </div>

                    <div className="grid gap-1">
                      <div className="text-xs text-[var(--muted-foreground)]">Answer time</div>
                      <Input type="number" min={1} value={answerSeconds} onChange={(e) => setAnswerSeconds(Number(e.target.value))} />
                    </div>

                    <div className="grid gap-1">
                      <div className="text-xs text-[var(--muted-foreground)]">Wait before reveal</div>
                      <Input type="number" min={0} value={revealDelaySeconds} onChange={(e) => setRevealDelaySeconds(Number(e.target.value))} />
                    </div>

                    <div className="grid gap-1">
                      <div className="text-xs text-[var(--muted-foreground)]">Reveal time</div>
                      <Input type="number" min={1} value={revealSeconds} onChange={(e) => setRevealSeconds(Number(e.target.value))} />
                    </div>
                  </div>
                </details>
              </CardContent>

              <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-[var(--muted-foreground)]">
                  <span className="font-medium text-[var(--foreground)]">
                    {choosePacks ? `Custom (${selectedCount})` : `All (${selectedCount})`}
                  </span>{" "}
                  packs, <span className="font-medium text-[var(--foreground)]">{totalQuestionsToPick}</span> questions,{" "}
                  {formatFilterLabel(roundFilter)}
                </div>

                <Button onClick={createRoom} disabled={!canCreate}>
                  Create room
                </Button>
              </CardFooter>
            </Card>

            {error ? (
              <Card className="border-red-300">
                <CardContent className="text-sm text-red-600">{error}</CardContent>
              </Card>
            ) : null}
          </div>

          {choosePacks ? (
            <Card className="lg:order-2">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Packs</CardTitle>
                  <div className="text-sm text-[var(--muted-foreground)]">{selectedCount} selected</div>
                </div>

                <div className="mt-3 grid gap-2">
                  <Input value={packSearch} onChange={(e) => setPackSearch(e.target.value)} placeholder="Search packs" />

                  <div className="flex gap-2">
                    <Button variant="secondary" className="w-full" onClick={selectAllVisible} disabled={filteredPacks.length === 0}>
                      Select visible
                    </Button>
                    <Button variant="secondary" className="w-full" onClick={clearAll} disabled={selectedPacks.length === 0}>
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={showSelectedOnly} onChange={(e) => setShowSelectedOnly(e.target.checked)} />
                    <span>Selected only</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={showAudioOnly} onChange={(e) => setShowAudioOnly(e.target.checked)} />
                    <span>Audio packs only</span>
                  </label>
                </div>
              </CardHeader>

              <CardContent>
                {loadingPacks ? (
                  <p className="text-sm text-[var(--muted-foreground)]">Loading packs…</p>
                ) : packs.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    No packs found. Add packs and questions via the admin import page.
                  </p>
                ) : filteredPacks.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)]">No packs match your filters.</p>
                ) : (
                  <div className="max-h-[540px] overflow-auto rounded-lg border border-[var(--border)]">
                    <table className="w-full table-fixed text-sm">
                      <thead className="sticky top-0 bg-[var(--card)]">
                        <tr className="border-b border-[var(--border)]">
                          <th className="w-10 px-3 py-2 text-left font-medium"></th>
                          <th className="px-3 py-2 text-left font-medium">Pack</th>
                          <th className="w-24 px-3 py-2 text-right font-medium">Questions</th>
                          <th className="w-20 px-3 py-2 text-right font-medium">Audio</th>
                          <th className="w-24 px-3 py-2 text-right font-medium">
                            {effectiveStrategy === "per_pack" ? "Pick" : ""}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPacks.map((p) => {
                          const checked = selectedPacks.includes(p.id);
                          const value = packCounts[p.id] ?? Math.min(10, Math.max(1, p.questionCount || 10));

                          return (
                            <tr key={p.id} className="border-b border-[var(--border)] last:border-b-0">
                              <td className="px-3 py-2">
                                <input type="checkbox" checked={checked} onChange={() => togglePack(p.id)} />
                              </td>
                              <td className="px-3 py-2">
                                <div
                                  className="truncate font-medium"
                                  title={`${p.label} (${p.id})`}
                                >
                                  {p.label}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">{p.questionCount}</td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">{p.audioCount ?? 0}</td>
                              <td className="px-3 py-2 text-right">
                                {checked && effectiveStrategy === "per_pack" ? (
                                  <div className="flex justify-end">
                                    <Input
                                      type="number"
                                      min={1}
                                      max={Math.max(1, p.questionCount)}
                                      value={value}
                                      onChange={(e) => setCountForPack(p.id, Number(e.target.value), p.questionCount)}
                                      className="h-9 w-20 text-right"
                                    />
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </main>
  );
}