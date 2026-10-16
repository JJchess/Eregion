import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
type Mode = 'light' | 'dark';
const Theme = createContext<{ mode: Mode; toggleMode: () => void }>({ mode: 'light', toggleMode() {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => {
    try { return localStorage.getItem('portfolio-galaxy-theme') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
    try { localStorage.setItem('portfolio-galaxy-theme', mode); } catch { /* Session-only preference. */ }
  }, [mode]);
  return <Theme.Provider value={{ mode, toggleMode: () => setMode(current => current === 'dark' ? 'light' : 'dark') }}>{children}</Theme.Provider>;
}
export const useNightMode = () => useContext(Theme);
