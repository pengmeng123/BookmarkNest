const SUPPORTED_HOSTS = new Set(['x.com', 'twitter.com']);

export function isXBookmarkPage(url: string) {
  try {
    const parsed = new URL(url);
    return SUPPORTED_HOSTS.has(parsed.hostname) && parsed.pathname === '/i/bookmarks';
  } catch {
    return false;
  }
}
