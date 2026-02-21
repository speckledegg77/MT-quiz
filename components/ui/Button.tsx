import * as React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-lg border text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--border)] focus:ring-offset-2 focus:ring-offset-[var(--background)] disabled:opacity-50 disabled:cursor-not-allowed";

  const sizes: Record<Size, string> = {
    sm: "h-9 px-3",
    md: "h-10 px-4",
  };

  const variants: Record<Variant, string> = {
    primary:
      "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)] hover:opacity-90",
    secondary:
      "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]",
    ghost:
      "border-transparent bg-transparent text-[var(--foreground)] hover:bg-[var(--muted)]",
    danger:
      "border-red-600 bg-red-600 text-white hover:opacity-90",
  };

  return (
    <button
      type={type}
      className={cx(base, sizes[size], variants[variant], className)}
      disabled={disabled}
      {...props}
    />
  );
}