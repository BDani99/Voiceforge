import { describe, it, expect } from 'vitest';
import { buildContentSecurityPolicy, buildSecurityHeaders, renderHeadersFile } from './securityHeaders';

const URL = 'https://abc123.supabase.co';

describe('buildContentSecurityPolicy', () => {
  const policy = buildContentSecurityPolicy(URL);
  const directive = (name: string) => policy.split('; ').find((d) => d.startsWith(`${name} `));

  it('only allows the app itself as script source', () => {
    expect(directive('script-src')).toBe("script-src 'self'");
    expect(policy).not.toContain('unsafe-eval');
  });

  it('allows exactly the Supabase project and the breach check for network access', () => {
    expect(directive('connect-src')).toBe(
      "connect-src 'self' https://abc123.supabase.co wss://abc123.supabase.co https://api.pwnedpasswords.com",
    );
  });

  it('allows audio from blob URLs and the project storage only', () => {
    expect(directive('media-src')).toBe("media-src 'self' blob: https://abc123.supabase.co https://vms.cdn.speechify.com");
    expect(directive('img-src')).toBe("img-src 'self' data: blob: https://vms.cdn.speechify.com");
  });

  it('forbids plugins, foreign base URIs and framing', () => {
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('base-uri')).toBe("base-uri 'self'");
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
  });

  it('leaves out frame-ancestors for the meta tag variant (browsers ignore it there)', () => {
    expect(buildContentSecurityPolicy(URL, { forHeader: false })).not.toContain('frame-ancestors');
  });

  it('rejects an invalid Supabase URL instead of producing a broken policy', () => {
    expect(() => buildContentSecurityPolicy('not a url')).toThrow();
  });
});

describe('security headers', () => {
  it('contains the standard hardening headers', () => {
    const headers = buildSecurityHeaders(URL);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Strict-Transport-Security']).toMatch(/max-age=\d+/);
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toContain('microphone=()');
  });

  it('renders a _headers file with long-lived caching only for hashed assets', () => {
    const file = renderHeadersFile(URL);
    expect(file.startsWith('/*\n  Content-Security-Policy: ')).toBe(true);
    expect(file).toContain('/assets/*\n  Cache-Control: public, max-age=31536000, immutable');
    expect(file.split('/*')[1]).not.toContain('immutable');
  });
});
