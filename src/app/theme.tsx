import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  ThemeContext,
  type ResolvedTheme,
  type ThemePreference,
} from './theme-context'

export type { ThemePreference } from './theme-context'

const THEME_STORAGE_KEY = 'karta.theme'
const DARK_MODE_QUERY = '(prefers-color-scheme: dark)'

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

function readStoredPreference(): ThemePreference {
  try {
    const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(storedPreference) ? storedPreference : 'system'
  } catch {
    return 'system'
  }
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_MODE_QUERY).matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] =
    useState<ThemePreference>(readStoredPreference)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme)

  const resolvedTheme = preference === 'system' ? systemTheme : preference

  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_MODE_QUERY)
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', handleChange)

    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  const setPreference = (nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference)

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference)
    } catch {
      // The selected theme still applies for this session if storage is unavailable.
    }
  }

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
