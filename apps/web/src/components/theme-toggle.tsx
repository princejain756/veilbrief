"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
  applyThemeWithoutFreeze,
  getCurrentTheme,
  type ThemeName,
} from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeName>("light");

  useEffect(() => {
    setTheme(getCurrentTheme());
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyThemeWithoutFreeze(next);
  }

  return (
    <button
      type="button"
      className="button-secondary h-8 w-8 !min-h-8 !p-0"
      onClick={toggleTheme}
      aria-label={
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
      title={
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
