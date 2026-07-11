import type { ManifestV3Export } from '@crxjs/vite-plugin';

export const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: 'X Bookmark Manager - Search, Tags & Export',
  short_name: 'BookmarkNest',
  description: 'Search, organize, export, and back up X/Twitter bookmarks with tags, folders, notes, saved views, and encrypted Cloud Sync.',
  version: '1.0.0',
  icons: {
    16: 'src/assets/icons/icon16.png',
    32: 'src/assets/icons/icon32.png',
    48: 'src/assets/icons/icon48.png',
    128: 'src/assets/icons/icon128.png'
  },
  action: {
    default_title: 'BookmarkNest',
    default_popup: 'src/popup/index.html'
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module'
  },
  options_page: 'src/options/index.html',
  permissions: [
    'storage',
    'downloads',
    'clipboardWrite',
    'webRequest',
    'declarativeNetRequest',
    'declarativeNetRequestWithHostAccess',
    'cookies',
    'alarms'
  ],
  host_permissions: ['https://x.com/*', 'https://twitter.com/*', 'https://bookmarknest-license.usetoolmint.com/*'],
  content_scripts: [
    {
      matches: ['https://x.com/*', 'https://twitter.com/*'],
      js: ['src/content/x/network-hook.ts'],
      run_at: 'document_start',
      world: 'MAIN'
    },
    {
      matches: ['https://x.com/*', 'https://twitter.com/*'],
      js: ['src/content/x/content-script.ts'],
      run_at: 'document_idle'
    }
  ]
};
