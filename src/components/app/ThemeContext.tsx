"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  THEME_STORAGE_KEY,
  isAppTheme,
  type AppTheme as Theme,
} from "@/lib/ui/app-theme";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggle: () => {},
});

function persist(theme: Theme) {
  // The cookie is what the server reads to render the right palette on the first
  // paint. localStorage stays in step for sessions that predate the cookie.
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage access errors (private mode, etc.).
  }
}

export function AppThemeProvider({
  children,
  initialTheme = null,
}: {
  children: ReactNode;
  /** Theme from the cookie, so light-mode users never get a dark first paint. */
  initialTheme?: Theme | null;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme ?? "dark");

  useEffect(() => {
    // Only consult localStorage for visitors who have no cookie yet. Once the
    // cookie exists it is authoritative, and re-reading storage here would undo
    // the server-rendered choice on every navigation.
    if (initialTheme) return;
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (isAppTheme(stored)) {
        setTheme(stored);
        persist(stored);
      }
    } catch {
      // Ignore storage access errors (private mode, etc.).
    }
  }, [initialTheme]);

  const toggle = useCallback(() => {
    setTheme((previous) => {
      const next = previous === "dark" ? "light" : "dark";
      persist(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <div className={`app-shell min-h-[100dvh] ${theme === "light" ? "light" : ""}`}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
