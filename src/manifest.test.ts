import { describe, expect, it } from 'vitest';

import { manifest } from './manifest';

describe('manifest compliance', () => {
  it('uses constrained permissions for MVP', () => {
    expect(manifest.permissions).not.toContain('<all_urls>');
    expect(manifest.permissions).not.toContain('activeTab');
    expect(manifest.permissions).not.toContain('scripting');
    expect(manifest.permissions).toEqual(expect.arrayContaining(['storage', 'downloads']));
  });

  it('limits host permissions to X/Twitter', () => {
    expect(manifest.host_permissions).toEqual(['https://x.com/*', 'https://twitter.com/*']);
  });

  it('uses packaged extension entry points', () => {
    expect(manifest.content_scripts?.[0].js).toEqual(['src/content/x/content-script.ts']);
    expect(manifest.background?.service_worker).toBe('src/background/service-worker.ts');
  });
});
