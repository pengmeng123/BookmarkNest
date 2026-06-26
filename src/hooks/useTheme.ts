import { useEffect, useRef, useState } from 'react';

import { applyTheme } from '../lib/theme/applyTheme';
import { getSettings, saveSettings } from '../lib/storage/localStorage';
import type { ThemePreference } from '../shared/types';

export function useTheme() {
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const cleanupRef = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    void getSettings().then((settings) => {
      if (!active) return;
      setThemeState(settings.theme);
      cleanupRef.current = applyTheme(settings.theme);
    });
    return () => {
      active = false;
      cleanupRef.current();
    };
  }, []);

  async function setTheme(next: ThemePreference) {
    setThemeState(next);
    cleanupRef.current();
    cleanupRef.current = applyTheme(next);
    await saveSettings({ theme: next });
  }

  return { theme, setTheme } as const;
}
