import type { ManifestV3Export } from '@crxjs/vite-plugin';

export const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: 'Bookmark Manager for X — Search, Tags & Export · BookmarkNest',
  short_name: 'BookmarkNest',
  description: 'Save, search, tag & export your X (Twitter) bookmarks. Local-first bookmark manager with folders, CSV/Markdown export & auto-sync.',
  version: '1.0.0',
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
  host_permissions: ['https://x.com/*', 'https://twitter.com/*', 'https://bookmarknest-license-worker.pp121111.workers.dev/*'],
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
