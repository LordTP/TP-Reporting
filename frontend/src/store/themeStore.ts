import { create } from 'zustand'

type Theme = 'dark' | 'light'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

const getInitialTheme = (): Theme => {
  const stored = localStorage.getItem('teliporter-theme')
  if (stored === 'light' || stored === 'dark') return stored
  return 'dark'
}

const applyTheme = (theme: Theme) => {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  localStorage.setItem('teliporter-theme', theme)
}

// Apply initial theme immediately
applyTheme(getInitialTheme())

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  toggle: () => {
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      return { theme: next }
    })
  },
}))
