"use client"

export default function JokerBadge({ className = "" }: { className?: string }) {
  return (
    <span className={className} aria-label="Joker" title="Joker">
      🃏
    </span>
  )
}