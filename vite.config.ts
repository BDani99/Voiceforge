/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { buildContentSecurityPolicy, renderHeadersFile } from './config/securityHeaders'

/**
 * Production hardening: a CSP <meta> tag in the HTML plus a `_headers` file with the full set
 * of security headers (Netlify / Cloudflare Pages read it; for other hosts copy the headers into
 * the server config). Not applied in dev: the dev server needs inline scripts for hot reloading.
 */
function securityHeaders(supabaseUrl: string): Plugin {
  return {
    name: 'security-headers',
    apply: 'build',
    transformIndexHtml: (html: string) => html.replace(
      '</head>',
      `  <meta http-equiv="Content-Security-Policy" content="${buildContentSecurityPolicy(supabaseUrl, { forHeader: false })}" />
  </head>`,
    ),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: renderHeadersFile(supabaseUrl) })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [react(), ...(env.VITE_SUPABASE_URL ? [securityHeaders(env.VITE_SUPABASE_URL)] : [])],
    server: {
      port: 3000,
      open: true,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'supabase/**/*.test.ts', 'config/**/*.test.ts'],
      css: false,
      // Deterministic environment: tests never depend on a developer's local .env.
      env: {
        VITE_SUPABASE_URL: 'https://test-project.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Rarely changing libraries go into their own long-cacheable chunks.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },
  }
})
