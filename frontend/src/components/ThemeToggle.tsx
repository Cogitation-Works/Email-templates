import { MoonStar, SunMedium } from "lucide-react";

import { useThemeMode } from "../context/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useThemeMode();

  return (
    <button
      className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-line)] bg-[var(--glass)] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--muted)] backdrop-blur-xl transition hover:border-[rgba(var(--accent-rgb),0.22)] hover:text-[var(--text)]"
      onClick={toggleTheme}
      type="button"
    >
      {theme === "dark" ? (
        <SunMedium className="h-4 w-4 text-[var(--secondary)]" />
      ) : (
        <MoonStar className="h-4 w-4 text-[var(--accent)]" />
      )}
      <span className="hidden sm:inline">Switch Theme</span>
    </button>
  );
}
