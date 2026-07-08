try {
  const storage = typeof chrome !== 'undefined' && chrome.storage?.local;
  if (storage) {
    storage.get('settings', (result) => {
      const theme = result?.settings?.theme;
      if (theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme:dark)').matches)) {
        document.documentElement.classList.add('dark');
      }
    });
  }
} catch {
  // Theme preload is best-effort; app-level theme handling will run after mount.
}
