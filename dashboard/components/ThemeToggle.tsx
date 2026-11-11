"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

type Theme = "dark" | "light" | "system";

function apply(t: Theme) {
  const resolved =
    t === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : t;
  document.documentElement.dataset.theme = resolved;
}

export default function ThemeToggle() {
  // Same rule as Splash: the server renders "dark" (no storage available), so
  // the client's FIRST render must also be "dark". Reading localStorage in the
  // initializer instead produced a different aria-label/icon than the HTML and
  // contributed to the React #418 hydration mismatch. The stored preference is
  // applied in the effect below, after hydration.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = (localStorage.getItem("lz_theme") as Theme) || "system";
    setTheme(stored);
    apply(stored);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const t = (localStorage.getItem("lz_theme") as Theme) || "system";
      if (t === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const cycle = () => {
    const order: Theme[] = ["dark", "light", "system"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
    localStorage.setItem("lz_theme", next);
    apply(next);
  };

  return (
    <button
      onClick={cycle}
      aria-label={`Theme: ${theme}`}
      title={`Theme: ${theme}`}
      className="w-8 h-8 rounded-lg bg-input flex items-center justify-center text-muted hover:text-fg transition"
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4" />
      ) : theme === "light" ? (
        <Moon className="w-4 h-4" />
      ) : (
        <Monitor className="w-4 h-4" />
      )}
    </button>
  );
}
