"use client"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"

export default function ResumeHostingCard(props: any) {
  const { rehostCode, setRehostCode, cleanRoomCode, rehostError, rehostBusy, rehostRoom } = props
  return (
<Card>
  <CardHeader><CardTitle>Re-host room</CardTitle></CardHeader>
  <CardContent className="space-y-3">
    <div className="text-sm text-muted-foreground">Enter a room code to continue hosting an existing room.</div>
    <div>
      <div className="text-sm font-medium text-foreground">Room code</div>
      <Input value={rehostCode} onChange={(e) => setRehostCode(cleanRoomCode(e.target.value))} placeholder="For example 3PDSXFT5" autoCapitalize="characters" spellCheck={false} />
    </div>
    {rehostError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{rehostError}</div> : null}
    <Button onClick={rehostRoom} disabled={rehostBusy}>{rehostBusy ? "Loading..." : "Re-host"}</Button>
  </CardContent>
</Card>
  )
}
