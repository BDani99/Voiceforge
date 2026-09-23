import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Adds a Content-Security-Policy to the production HTML. Only the app itself and the
 * configured Supabase project may be contacted; nothing is loaded from third parties.
 * (Not applied in dev: the dev server needs inline scripts for hot reloading.)
 */
function contentSecurityPolicy(supabaseUrl) {
  const supabase = new URL(supabaseUrl)
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // React style props and injected toast/chart styles
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `media-src 'self' blob: ${supabase.origin}`,
    `connect-src 'self' ${supabase.origin} wss://${supabase.host}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) => html.replace(
      '</head>',
      `  <meta http-equiv="Content-Security-Policy" content="${policy}" />\n  </head>`,
    ),
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [react(), ...(env.VITE_SUPABASE_URL ? [contentSecurityPolicy(env.VITE_SUPABASE_URL)] : [])],
    server: {
      port: 3000,
      open: true,
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
