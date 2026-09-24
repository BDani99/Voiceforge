/**
 * Security headers of the production build. The Content-Security-Policy only allows the app
 * itself, the configured Supabase project and the breached-password check.
 */

const SPEECHIFY_CDN = 'https://vms.cdn.speechify.com';

export function buildContentSecurityPolicy(supabaseUrl: string, { forHeader = true } = {}): string {
  const supabase = new URL(supabaseUrl);

  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    // React style props and the styles injected by the toast/chart libraries need inline styles.
    "style-src 'self' 'unsafe-inline'",
    // Voice pictures and sample recordings come from Speechify's CDN.
    `img-src 'self' data: blob: ${SPEECHIFY_CDN}`,
    "font-src 'self' data:",
    `media-src 'self' blob: ${supabase.origin} ${SPEECHIFY_CDN}`,
    // https://api.pwnedpasswords.com: breached-password check (k-anonymity, no password leaves the browser)
    `connect-src 'self' ${supabase.origin} wss://${supabase.host} https://api.pwnedpasswords.com`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  // frame-ancestors is ignored in a <meta> tag, it only works as an HTTP header.
  if (forHeader) directives.push("frame-ancestors 'none'");

  return directives.join('; ');
}

/** Headers to send with every response (rendered as a Netlify / Cloudflare Pages `_headers` file). */
export function buildSecurityHeaders(supabaseUrl: string): Record<string, string> {
  return {
    'Content-Security-Policy': buildContentSecurityPolicy(supabaseUrl),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  };
}

export function renderHeadersFile(supabaseUrl: string): string {
  const lines = Object.entries(buildSecurityHeaders(supabaseUrl)).map(([name, value]) => `  ${name}: ${value}`);
  const immutable = '  Cache-Control: public, max-age=31536000, immutable';
  return ['/*', ...lines, '', '/assets/*', immutable, ''].join('\n');
}
