import Link from "next/link"

export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Musical Theatre Quiz</h1>
      <p style={{ marginTop: 0 }}>
        Host creates a room, then teams join on their phones.
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
        <Link
          href="/host"
          style={{
            display: "block",
            padding: 14,
            border: "1px solid #ccc",
            borderRadius: 12,
            textDecoration: "none",
            textAlign: "center"
          }}
        >
          Host
        </Link>

        <Link
          href="/join"
          style={{
            display: "block",
            padding: 14,
            border: "1px solid #ccc",
            borderRadius: 12,
            textDecoration: "none",
            textAlign: "center"
          }}
        >
          Join a room
        </Link>
      </div>

      <p style={{ marginTop: 18, color: "#555" }}>
        Tip: the host screen will show a join link after you create a room.
      </p>
    </main>
  )
}
