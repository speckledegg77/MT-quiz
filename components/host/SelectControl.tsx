"use client"

import type { ReactNode, SelectHTMLAttributes } from "react"

export type SelectControlVariant = "default" | "soft" | "toolbar" | "advanced"

type SelectControlProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode
  compact?: boolean
  variant?: SelectControlVariant
}

export default function SelectControl({ children, className = "", compact = false, variant = "default", ...props }: SelectControlProps) {
  const resolvedVariant: SelectControlVariant = variant === "default" ? "soft" : variant

  const usesStrongQuietStyle = resolvedVariant === "soft" || resolvedVariant === "advanced"
  const isToolbar = resolvedVariant === "toolbar"

  const sizeClasses = usesStrongQuietStyle
    ? compact
      ? "h-8 rounded-md pr-7 pl-2.5 text-[13px]"
      : "h-8 rounded-md pr-7 pl-2.5 text-[13px]"
    : isToolbar
      ? compact
        ? "h-8 rounded-md pr-7 pl-2.5 text-[13px]"
        : "h-9 rounded-md pr-8 pl-3 text-sm"
      : compact
        ? "h-9 rounded-lg pr-8 pl-3 text-sm"
        : "h-10 rounded-lg pr-9 pl-3 text-sm"

  const variantClasses = usesStrongQuietStyle
    ? "border border-border/45 bg-muted/55 text-foreground shadow-none hover:border-border/70 hover:bg-muted focus:border-foreground/15 focus:bg-card focus:ring-1 focus:ring-foreground/10"
    : isToolbar
      ? "border border-border/50 bg-background text-foreground shadow-none hover:border-border focus:border-border focus:ring-1 focus:ring-border"
      : "border border-border/70 bg-card text-foreground shadow-sm hover:border-border focus:border-foreground/30 focus:bg-card focus:ring-2 focus:ring-foreground/10"

  const iconSizeClasses = usesStrongQuietStyle || isToolbar ? "h-3.5 w-3.5" : "h-4 w-4"
  const iconRightClass = usesStrongQuietStyle ? "right-2.5" : "right-3"

  return (
    <div className="relative">
      <select
        {...props}
        className={`${className} w-full appearance-none outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses} ${sizeClasses}`}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className={`pointer-events-none absolute ${iconRightClass} top-1/2 -translate-y-1/2 text-muted-foreground ${iconSizeClasses}`}
      >
        <path d="M5 7.5L10 12.5L15 7.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
