"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"

export type SimpleSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export type SimpleSelectProps = {
  value: string
  options: SimpleSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  buttonClassName?: string
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

function ChevronDown() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4 opacity-70"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function SimpleSelect({
  value,
  options,
  onChange,
  placeholder,
  disabled,
  className,
  buttonClassName,
}: SimpleSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value])

  useEffect(() => {
    if (!open) return

    function onDown(e: MouseEvent) {
      const root = rootRef.current
      if (!root) return
      if (!root.contains(e.target as Node)) setOpen(false)
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setActiveIndex(-1)
      return
    }

    const idx = Math.max(
      0,
      options.findIndex((o) => o.value === value)
    )
    setActiveIndex(idx)
  }, [open, options, value])

  function pick(idx: number) {
    const opt = options[idx]
    if (!opt || opt.disabled) return
    onChange(opt.value)
    setOpen(false)
    buttonRef.current?.focus()
  }

  function onButtonKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      setOpen((v) => !v)
      return
    }

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
    }
  }

  function onListKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!open) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      for (let i = activeIndex + 1; i < options.length; i++) {
        if (!options[i]?.disabled) {
          setActiveIndex(i)
          return
        }
      }
      return
    }

    if (e.key === "ArrowUp") {
      e.preventDefault()
      for (let i = activeIndex - 1; i >= 0; i--) {
        if (!options[i]?.disabled) {
          setActiveIndex(i)
          return
        }
      }
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      if (activeIndex >= 0) pick(activeIndex)
    }
  }

  const buttonBase =
    "inline-flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--border)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
  const buttonSize = "h-10"
  const menuBase =
    "absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg"

  return (
    <div ref={rootRef} className={cx("relative w-full", className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onButtonKeyDown}
        className={cx(buttonBase, buttonSize, disabled && "opacity-50 cursor-not-allowed", buttonClassName)}
      >
        <span className="min-w-0 truncate">{selected ? selected.label : placeholder ?? "Select"}</span>
        <ChevronDown />
      </button>

      {open ? (
        <div role="listbox" tabIndex={-1} onKeyDown={onListKeyDown} className={menuBase}>
          {options.map((opt, idx) => {
            const isActive = idx === activeIndex
            const isSelected = opt.value === value
            const disabledOpt = Boolean(opt.disabled)

            const row = "w-full px-3 py-2 text-left text-sm text-[var(--foreground)]"
            const active = isActive ? "bg-[var(--muted)]" : ""
            const selectedCls = isSelected ? "font-medium" : ""
            const disabledCls = disabledOpt ? "opacity-50 cursor-not-allowed" : "hover:bg-[var(--muted)]"

            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={disabledOpt}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => pick(idx)}
                className={cx(row, active, selectedCls, disabledCls)}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}