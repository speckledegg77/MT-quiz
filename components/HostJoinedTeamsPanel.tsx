"use client";

import { useEffect, useState } from "react";
import JoinedTeamsPanel from "@/components/JoinedTeamsPanel";

type RoomState = any;

export default function HostJoinedTeamsPanel({ code }: { code: string }) {
  const [roomId, setRoomId] = useState<string | null>(null);

  useEffect(() => {
    const roomCode = String(code ?? "").toUpperCase();
    if (!roomCode) return;

    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/room/state?code=${roomCode}`, { cache: "no-store" });
        const data: RoomState = await res.json();

        const id =
          data?.roomId ?? data?.room_id ?? data?.room?.id ?? data?.room?.room_id ?? null;

        if (!cancelled) setRoomId(id);
      } catch {
        if (!cancelled) setRoomId(null);
      }
    }

    tick();
    const id = setInterval(tick, 1000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [code]);

  if (!roomId) return null;

  return <JoinedTeamsPanel roomId={roomId} />;
}