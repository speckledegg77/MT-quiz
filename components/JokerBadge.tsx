"use client"

type Props = {
  className?: string
  showLabel?: boolean
  label?: string
}

const JOKER_SYMBOL = String.fromCodePoint(0x1f0cf)

export default function JokerBadge({ className = "", showLabel = false, label = "Joker" }: Props) {
  const classes = ["inline-flex items-center", className].filter(Boolean).join(" ")

  return (
    <span className={classes} aria-label={label} title={label}>
      <span aria-hidden="true">{JOKER_SYMBOL}</span>
      {showLabel ? <span className="ml-1">{label}</span> : null}
    </span>
  )
}
