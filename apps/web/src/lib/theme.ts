import { useState } from 'react';

/**
 * Light or dark mode, chosen per device. The script in index.html applies it
 * before the first paint and follows the device while the choice is `system`;
 * this changes it from Settings.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'openrun-theme';

export function themeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice) {
  const dark =
    choice === 'dark' ||
    (choice === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function useTheme() {
  const [choice, setChoice] = useState(themeChoice);
  const choose = (next: ThemeChoice) => {
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Private browsing, say: it still applies until the page is closed.
    }
    apply(next);
    setChoice(next);
  };
  return [choice, choose] as const;
}
