"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ThemeContext,
  type Theme,
  getStoredTheme,
  setStoredTheme,
  resolveTheme,
  applyThemeToDOM,
  useSystemTheme,
} from "@/hooks/use-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const systemTheme = useSystemTheme();

  // Initialize from localStorage on mount
  useEffect(() => {
    setThemeState(getStoredTheme());
  }, []);

  // When theme is "system", use live system preference
  const resolvedTheme: "light" | "dark" =
    theme === "system" ? systemTheme : theme;

  // Apply to DOM whenever resolved theme changes
  useEffect(() => {
    applyThemeToDOM(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    setStoredTheme(t);
    applyThemeToDOM(resolveTheme(t));
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
