"use client"

import { ChevronDown } from "lucide-react"
import type { ReactNode, SelectHTMLAttributes } from "react"

type SelectVariant = "default" | "soft" | "toolbar"

type SelectControlProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode
  compact?: boolean
  variant?: SelectVariant
}

const variantFieldClassNames: Record<SelectVariant, string> = {
  default:
    "border border-border/70 bg-card text-foreground shadow-sm hover:border-border focus:border-foreground/30 focus:bg-card focus:ring-2 focus:ring-foreground/10",
  soft:
    "border border-border/50 bg-background/90 text-foreground shadow-sm shadow-black/5 hover:border-border hover:bg-background focus:border-sky-300 focus:ring-2 focus:ring-sky-500/10 dark:border-border/60 dark:bg-card/90 dark:focus:border-sky-500/50",
  toolbar:
    "border border-border/60 bg-background text-foreground shadow-none hover:border-border hover:bg-muted/40 focus:border-foreground/20 focus:ring-2 focus:ring-foreground/5",
}

const variantIconClassNames: Record<SelectVariant, string> = {
  default: "text-muted-foreground",
  soft: "rounded-full border border-border/50 bg-muted/50 p-1 text-muted-foreground",
  toolbar: "text-muted-foreground/90",
}

export default function SelectControl({ children, className = "", compact = false, variant = "default", ...props }: SelectControlProps) {
  const sizeClassName = compact ? "h-9 rounded-lg pr-10 pl-3 text-sm" : "h-10 rounded-xl pr-11 pl-3.5 text-sm"
  return (
    <div className="relative">
      <select
        {...props}
        className={`${className} w-full appearance-none outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${sizeClassName} ${variantFieldClassNames[variant]}`}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center justify-center">
        <ChevronDown className={`h-4 w-4 ${variantIconClassNames[variant]}`} />
      </span>
    </div>
  )
}
