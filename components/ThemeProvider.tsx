"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type ThemePreference = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

const ThemeContext = createContext<{
  theme: ResolvedTheme;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}>({ theme: "dark", preference: "dark", setPreference: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === "system" ? getSystemTheme() : pref;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("dark");
  const [theme, setTheme] = useState<ResolvedTheme>("dark");

  const applyTheme = useCallback((resolved: ResolvedTheme) => {
    setTheme(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
  }, []);

  // Load stored preference on mount
  useEffect(() => {
    const stored = localStorage.getItem("chatos:theme") as ThemePreference | null;
    const pref: ThemePreference = stored === "light" || stored === "system" ? stored : "dark";
    setPreferenceState(pref);
    applyTheme(resolveTheme(pref));
  }, [applyTheme]);

  // Listen for OS theme changes when preference is "system"
  useEffect(() => {
    if (preference !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => applyTheme(getSystemTheme());
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [preference, applyTheme]);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    localStorage.setItem("chatos:theme", pref);
    applyTheme(resolveTheme(pref));
  }, [applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}
