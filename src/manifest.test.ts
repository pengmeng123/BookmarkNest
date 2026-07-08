import { describe, expect, it } from 'vitest';

import { manifest } from './manifest';

describe('manifest compliance', () => {
  it('uses constrained permissions for X import and sync', () => {
    expect(manifest.permissions).not.toContain('<all_urls>');
    expect(manifest.permissions).not.toContain('activeTab');
    expect(manifest.permissions).not.toContain('scripting');
    expect(manifest.permissions).toEqual(expect.arrayContaining([
      'storage',
      'downloads',
      'webRequest',
      'declarativeNetRequest',
      'declarativeNetRequestWithHostAccess',
      'cookies',
      'alarms'
    ]));
  });

  it('limits host permissions to X/Twitter and the license worker', () => {
    expect(manifest.host_permissions).toEqual(['https://x.com/*', 'https://twitter.com/*', 'https://bookmarknest-license-worker.pp121111.workers.dev/*']);
  });

  it('uses packaged extension entry points', () => {
    expect(manifest.content_scripts?.[0].js).toEqual(['src/content/x/network-hook.ts']);
    expect(manifest.content_scripts?.[0].run_at).toBe('document_start');
    expect(manifest.content_scripts?.[0].world).toBe('MAIN');
    expect(manifest.content_scripts?.[1].js).toEqual(['src/content/x/content-script.ts']);
    expect(manifest.background?.service_worker).toBe('src/background/service-worker.ts');
  });
});
