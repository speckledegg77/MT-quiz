import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";

import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Musical Theatre Quiz",
  description: "Host a quiz with general, audio, and picture rounds.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
          <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--card)]">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Link href="/" className="text-base font-semibold">
                  MT Quiz
                </Link>

                <nav className="hidden items-center gap-3 sm:flex">
                  <Link
                    href="/host"
                    className="rounded-md px-2 py-1 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
                  >
                    Host
                  </Link>
                  <Link
                    href="/join"
                    className="rounded-md px-2 py-1 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
                  >
                    Join
                  </Link>
                </nav>
              </div>

              <ThemeToggle />
            </div>
          </header>

          {children}
        </div>
      </body>
    </html>
  );
}