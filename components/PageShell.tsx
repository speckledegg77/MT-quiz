import type { ReactNode } from "react"

type PageShellWidth = "narrow" | "base" | "wide" | "full"

type PageShellProps = {
  children: ReactNode
  width?: PageShellWidth
  className?: string
  contentClassName?: string
}

const widthClasses: Record<PageShellWidth, string> = {
  narrow: "max-w-md",
  base: "max-w-3xl",
  wide: "max-w-6xl",
  full: "max-w-7xl",
}

function joinClasses(...parts: Array<string | null | undefined | false>) {
  return parts.filter(Boolean).join(" ")
}

export default function PageShell({
  children,
  width = "base",
  className,
  contentClassName,
}: PageShellProps) {
  return (
    <main className={joinClasses("min-h-screen px-4 py-6 sm:px-6 sm:py-8", className)}>
      <div className={joinClasses("mx-auto w-full", widthClasses[width], contentClassName)}>{children}</div>
    </main>
  )
}
