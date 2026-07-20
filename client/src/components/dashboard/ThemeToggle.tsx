"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "marimail-theme";

function persist(theme: "light" | "dark") {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode / storage disabled — cookie fallback below still works */
  }
  try {
    // 1-year cookie so a cleared localStorage or an incognito browser still
    // remembers the preference across reloads.
    document.cookie = `${STORAGE_KEY}=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  } catch {
    /* ignore cookie write failures */
  }
}

function readPersisted(): "light" | "dark" | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* fall through to cookie */
  }
  try {
    const match = document.cookie.match(/(?:^|; )marimail-theme=([^;]+)/);
    if (match) {
      const value = decodeURIComponent(match[1]);
      if (value === "light" || value === "dark") return value;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    // Prefer the persisted preference over the current classList so a stray
    // class from a prior render (or a corrupted state where both classes are
    // set at once) doesn't dictate the theme.
    const persisted = readPersisted();
    const initial: "light" | "dark" = persisted
      ?? (document.documentElement.classList.contains("light") ? "light" : "dark");
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(initial);
    setTheme(initial);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(next);
    persist(next);
  }

  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white/80 text-slate-600 shadow-sm transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.08] dark:hover:text-white"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title="Toggle dark mode"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
