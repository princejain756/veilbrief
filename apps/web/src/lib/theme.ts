"use client";

export type ThemeName = "light" | "dark";

export function getCurrentTheme(): ThemeName {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyThemeWithoutFreeze(next: ThemeName) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.classList.toggle("dark", next === "dark");
  void root.offsetHeight;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove("theme-switching");
    });
  });
  try {
    localStorage.setItem("veilbrief-theme", next);
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }
}
