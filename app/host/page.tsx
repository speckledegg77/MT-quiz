"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

import type { RoundFilter, SelectionStrategy } from "@/lib/questionSelection";

type AudioMode = "display" | "phones" | "both";

type PackInfo = {
  id: string;
  label: string;
  questionCount: number;
  audioCount: number;
};

type RoundRequest = { packId: string; count: number };

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  border: "1px solid #ccc",
  borderRadius: 8,
};

const buttonBase: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #111",
  background: "#fff",
  color: "#111",
  cursor: "pointer",
  userSelect: "none",
  font: "inherit",
  appearance: "button",
  WebkitAppearance: "button",
};

const buttonPrimary: React.CSSProperties = { ...buttonBase, background: "#111", color: "#fff" };
const buttonSecondary: React.CSSProperties = { ...buttonBase, background: "#fff", color: "#111" };

function withDisabled(style: React.CSSProperties, disabled: boolean): React.CSSProperties {
  if (!disabled) return style;
  return { ...style, opacity: 0.5, cursor: "not-allowed" };
}

function normaliseRoundFilter(raw: any): RoundFilter {
  const v = String(raw ?? "").toLowerCase();
  if (v === "no_audio") return "no_audio";
  if (v === "audio_only") return "audio_only";
  if (v === "picture_only") return "picture_only";
  return "mixed";
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

  const [selectionStrategy, setSelectionStrategy] = useState<SelectionStrategy>("per_pack");
  const [totalQuestionsAllPacks, setTotalQuestionsAllPacks] = useState<number>(20);

  const [roundFilter, setRoundFilter] = useState<RoundFilter>("mixed");

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
        if (!cancelled) setError("Could not load pack list");
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
    // Audio-only and picture-only behave best as one total across selected packs.
    if (roundFilter === "audio_only" || roundFilter === "picture_only") {
      setSelectionStrategy("all_packs");
    }
  }, [roundFilter]);

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

  function selectAllPacks() {
    setSelectedPacks(packs.map((p) => p.id));
  }

  function clearAllPacks() {
    setSelectedPacks([]);
  }

  function setCountForPack(id: string, value: number, maxForPack: number) {
    const n = Math.max(1, Math.floor(Number(value)));
    const clamped = Math.min(n, Math.max(1, Math.floor(Number(maxForPack || n))));
    setPackCounts((prev) => ({ ...prev, [id]: clamped }));
  }

  const rounds: RoundRequest[] = useMemo(() => {
    const map = new Map(packs.map((p) => [p.id, p.questionCount]));
    return selectedPacks
      .map((packId) => {
        const count = Number(packCounts[packId] ?? 0);
        const max = Number(map.get(packId) ?? count);
        const safe = Math.min(Math.max(1, Math.floor(count)), Math.max(1, Math.floor(max || count)));
        return { packId, count: safe };
      })
      .filter((r) => r.packId && r.count > 0);
  }, [selectedPacks, packCounts, packs]);

  const totalQuestionsFromPacks = useMemo(
    () => rounds.reduce((sum, r) => sum + r.count, 0),
    [rounds]
  );

  const totalQuestionsToPick = selectionStrategy === "all_packs" ? totalQuestionsAllPacks : totalQuestionsFromPacks;

  async function createRoom() {
    setError(null);

    if (selectedPacks.length === 0) {
      setError("Pick at least one pack");
      return;
    }

    if (selectionStrategy === "per_pack" && rounds.length === 0) {
      setError("Pick at least one pack");
      return;
    }

    const safeFilter = normaliseRoundFilter(roundFilter);

    const res = await fetch("/api/room/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // New
        selectionStrategy,
        roundFilter: safeFilter,
        totalQuestions: totalQuestionsToPick,

        // Keep old keys for compatibility
        rounds: selectionStrategy === "per_pack" ? rounds : [],
        selectedPacks,
        questionCount: totalQuestionsToPick,

        // Timings and audio
        countdownSeconds,
        answerSeconds,
        revealDelaySeconds,
        revealSeconds,
        audioMode,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not create room");
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

  const canCreate = !loadingPacks && selectedPacks.length > 0 && totalQuestionsToPick > 0;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1>Host</h1>

      {code && (
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button onClick={resetRoom} style={buttonSecondary}>
            Create new room
          </button>
          <button onClick={startGame} style={buttonPrimary}>
            Start game
          </button>
        </div>
      )}

      {!code && (
        <>
          <h2>Packs</h2>

          {loadingPacks && <p>Loading packs...</p>}

          {!loadingPacks && packs.length === 0 && (
            <p>No packs found in the database. Add packs and questions via the admin import page.</p>
          )}

          {!loadingPacks && packs.length > 0 && (
            <>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <button type="button" onClick={selectAllPacks} style={buttonSecondary}>
                  Select all
                </button>
                <button type="button" onClick={clearAllPacks} style={buttonSecondary}>
                  Clear
                </button>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {packs.map((p) => {
                  const checked = selectedPacks.includes(p.id);
                  const value = packCounts[p.id] ?? Math.min(10, Math.max(1, p.questionCount || 10));

                  return (
                    <div key={p.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
                      <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input type="checkbox" checked={checked} onChange={() => togglePack(p.id)} />
                        <span>
                          {p.label} ({p.questionCount} q{p.questionCount === 1 ? "" : "s"}
                          {p.audioCount > 0 ? `, ${p.audioCount} audio` : ""})
                        </span>
                      </label>

                      {checked && selectionStrategy === "per_pack" && (
                        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, marginBottom: 6 }}>Questions from this pack</div>
                            <input
                              type="number"
                              min={1}
                              max={Math.max(1, p.questionCount)}
                              value={value}
                              onChange={(e) => setCountForPack(p.id, Number(e.target.value), p.questionCount)}
                              style={inputStyle}
                            />
                          </div>
                          <div style={{ fontSize: 14, opacity: 0.8 }}>
                            max {Math.max(1, p.questionCount)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <h2 style={{ marginTop: 20 }}>Question selection</h2>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="radio"
                name="strategy"
                checked={selectionStrategy === "per_pack"}
                onChange={() => setSelectionStrategy("per_pack")}
                disabled={roundFilter === "audio_only" || roundFilter === "picture_only"}
              />
              <span>Pick counts per pack</span>
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="radio"
                name="strategy"
                checked={selectionStrategy === "all_packs"}
                onChange={() => setSelectionStrategy("all_packs")}
              />
              <span>Pick one total across selected packs</span>
            </label>
          </div>

          {selectionStrategy === "per_pack" && (
            <p style={{ marginTop: 8, opacity: 0.8 }}>
              Total questions: {totalQuestionsFromPacks}
            </p>
          )}

          {selectionStrategy === "all_packs" && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Total questions</div>
              <input
                type="number"
                min={1}
                value={totalQuestionsAllPacks}
                onChange={(e) => setTotalQuestionsAllPacks(Number(e.target.value))}
                style={inputStyle}
              />
            </div>
          )}

          <h2 style={{ marginTop: 20 }}>Question types</h2>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="radio"
                name="roundFilter"
                checked={roundFilter === "mixed"}
                onChange={() => setRoundFilter("mixed")}
              />
              <span>Mixed (general, audio, picture)</span>
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="radio"
                name="roundFilter"
                checked={roundFilter === "no_audio"}
                onChange={() => setRoundFilter("no_audio")}
              />
              <span>No audio (general and picture only)</span>
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="radio"
                name="roundFilter"
                checked={roundFilter === "audio_only"}
                onChange={() => setRoundFilter("audio_only")}
              />
              <span>Audio only</span>
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="radio"
                name="roundFilter"
                checked={roundFilter === "picture_only"}
                onChange={() => setRoundFilter("picture_only")}
              />
              <span>Picture only</span>
            </label>
          </div>

          <h2 style={{ marginTop: 20 }}>Audio playback</h2>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="radio" name="audioMode" checked={audioMode === "display"} onChange={() => setAudioMode("display")} />
              <span>Play audio on TV display</span>
            </label>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="radio" name="audioMode" checked={audioMode === "phones"} onChange={() => setAudioMode("phones")} />
              <span>Play audio on phones</span>
            </label>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="radio" name="audioMode" checked={audioMode === "both"} onChange={() => setAudioMode("both")} />
              <span>Play audio on both</span>
            </label>
          </div>

          <h2 style={{ marginTop: 20 }}>Timing</h2>

          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Countdown seconds</div>
              <input type="number" min={0} value={countdownSeconds} onChange={(e) => setCountdownSeconds(Number(e.target.value))} style={inputStyle} />
            </div>

            <div>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Max answer seconds</div>
              <input type="number" min={1} value={answerSeconds} onChange={(e) => setAnswerSeconds(Number(e.target.value))} style={inputStyle} />
            </div>

            <div>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Wait before reveal</div>
              <input type="number" min={0} value={revealDelaySeconds} onChange={(e) => setRevealDelaySeconds(Number(e.target.value))} style={inputStyle} />
            </div>

            <div>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Reveal seconds</div>
              <input type="number" min={1} value={revealSeconds} onChange={(e) => setRevealSeconds(Number(e.target.value))} style={inputStyle} />
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <button onClick={createRoom} style={withDisabled(buttonPrimary, !canCreate)} disabled={!canCreate}>
              Create room
            </button>
          </div>

          {error && (
            <p style={{ marginTop: 12, color: "#b00020" }}>
              {error}
            </p>
          )}
        </>
      )}

      {code && (
        <section style={{ marginTop: 12 }}>
          <h2>Room code: {code}</h2>

          <p>
            Players join at:
            <br />
            <a href={joinUrl}>{joinUrl}</a>
          </p>

          <p>
            TV display:
            <br />
            <a href={displayUrl}>{displayUrl}</a>
          </p>

          <p>
            Selection: {selectionStrategy}. Filter: {roundFilter}. Audio mode: {audioMode}.
          </p>

          {joinUrl && (
            <>
              <h3>Scan to join</h3>
              <QRCodeSVG value={joinUrl} size={220} />
            </>
          )}
        </section>
      )}
    </main>
  );
}