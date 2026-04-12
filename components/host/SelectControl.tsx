"use client"

import { ChevronDown } from "lucide-react"
import type { ReactNode, SelectHTMLAttributes } from "react"

type SelectControlProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode
  compact?: boolean
}

export default function SelectControl({ children, className = "", compact = false, ...props }: SelectControlProps) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`${className} w-full appearance-none border border-border/70 bg-card text-foreground shadow-sm outline-none transition-colors hover:border-border focus:border-foreground/30 focus:bg-card focus:ring-2 focus:ring-foreground/10 disabled:cursor-not-allowed disabled:opacity-60 ${compact ? "h-9 rounded-lg pr-8 pl-3 text-sm" : "h-10 rounded-lg pr-9 pl-3 text-sm"}`}
      >
        {children}
      </select>
      <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground ${compact ? "h-4 w-4" : "h-4 w-4"}`} />
    </div>
  )
}
