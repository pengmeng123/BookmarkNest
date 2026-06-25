import { useEffect, useRef, useState } from 'react';

import { applyTheme } from '../lib/theme/applyTheme';
import { getSettings, saveSettings } from '../lib/storage/localStorage';
import type { ThemePreference } from '../shared/types';

export function useTheme() {
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const cleanupRef = useRef<() => void>(() => {});

  useEffect(() => {
    void getSettings().then((settings) => {
      setThemeState(settings.theme);
      cleanupRef.current = applyTheme(settings.theme);
    });
    return () => cleanupRef.current();
  }, []);

  async function setTheme(next: ThemePreference) {
    setThemeState(next);
    cleanupRef.current();
    cleanupRef.current = applyTheme(next);
    await saveSettings({ theme: next });
  }

  return { theme, setTheme } as const;
}
