# VoiceForge

Text-to-speech studio built with React, TypeScript and Supabase. Users write text in paragraphs,
pick a voice, language and speech style, generate audio through the
[Speechify API](https://docs.sws.speechify.com/) and export the result. An admin area manages users,
credits and system settings.

## Stack

- React 18, React Router 7, Vite 7, TypeScript (strict)
- Supabase: auth, Postgres (RLS), storage, pg_cron and one Edge Function (Deno)
- Speechify API, called **only** from the Edge Function so the API key never reaches the browser
- Recharts for the usage charts
- Vitest + Testing Library for tests, ESLint with type-aware rules

## Getting started

```bash
npm install
cp .env.example .env      # fill in your Supabase URL and anon key
npm run dev               # http://localhost:3000
```

| Script               | Purpose                                             |
| -------------------- | --------------------------------------------------- |
| `npm run dev`        | Dev server                                          |
| `npm run build`      | Type-check, then production build into `dist/`      |
| `npm run typecheck`  | `tsc --noEmit`                                      |
| `npm run lint`       | ESLint (fails on warnings)                          |
| `npm test`           | Unit and component tests                            |
| `npm run test:watch` | Tests in watch mode                                 |
| `npm run preview`    | Serve the production build                          |

CI (`.github/workflows/ci.yml`) runs type-check, lint, tests, `npm audit` and the build, and
type-checks the Edge Function with `deno check`.

## Supabase setup

1. Apply the SQL files in [supabase/migrations](supabase/migrations) in filename order
   (SQL editor or `supabase db push`). They are required, not optional:
   - `harden_admin_and_rls`: admin rights come from `users_profile.role` only, protected profile
     columns (credits, role, ban flag, email), locked-down `usage_logs`, `audio_cache` and storage.
   - `admin_dashboard_stats`: the admin dashboard numbers, aggregated in the database.
   - `restrict_function_grants` and `least_privilege`: API roles only get the rights the app needs.
   - `credit_reservations_and_suspension`: atomic credit reservations with automatic refund of
     crashed requests (pg_cron), a per-minute rate limit and suspension enforced by RLS.
   - `system_settings_policies`: admin write policies split by command.
2. Set the Edge Function secrets and deploy it:

   ```bash
   supabase secrets set SPEECHIFY_API_KEY=<key>
   # optional: restrict browser origins (default: any)
   supabase secrets set ALLOWED_ORIGINS=https://your-app.example.com
   supabase functions deploy generate-speech
   ```

   `supabase/config.toml` keeps `verify_jwt = false` for this function: it authenticates the caller
   itself and has to answer CORS preflight requests, which carry no JWT.
3. Make sure a public storage bucket named `voiceovers` exists.
4. Give your admin account `role = 'admin'` in `users_profile`.
5. Regenerate the database types after schema changes into `src/types/database.ts`
   (`supabase gen types typescript --project-id <ref> --schema public`).

### How credits work

The Edge Function is the single place that charges credits. `reserve_credits` (SQL) checks the
account, the rate limit and the balance and charges in one statement, so parallel requests can never
overdraw an account. After a successful generation the reservation is settled; on failure it is
refunded. A scheduled job refunds reservations that stayed pending (a crashed request). Audio that
is already in the shared cache costs nothing.

## Production checklist

- **Auth settings (Dashboard → Authentication):** set the real *Site URL* and the redirect URL
  allow-list, turn on e-mail confirmation together with a real SMTP provider (the built-in mailer is
  heavily rate limited), and enable leaked-password protection if your plan includes it. The app
  already checks new passwords against the Have I Been Pwned range API in the browser.
- **Security headers:** `npm run build` writes `dist/_headers` (Netlify / Cloudflare Pages format)
  with a strict Content-Security-Policy including `frame-ancestors`, HSTS, `X-Frame-Options` and more.
  On other hosts copy those headers into the server configuration. The HTML also carries the CSP
  as a `<meta>` tag as a fallback.
- **Secrets:** rotate any token that was ever pasted into a chat, ticket or log. Only the Supabase
  URL and the anon key belong in `VITE_*` variables.

## Project structure

```
config/                    security headers (used by vite.config.ts)
src/
  main.tsx, App.tsx        entry point, routes
  context/                 AuthProvider (session + profile, loaded once)
  pages/
    Auth/                  login / register
    Dashboard/             project list
    Profile/               usage stats and account settings
    Workspace/             editor; its own widgets live in Workspace/components
    Admin/                 admin login, layout, users, logs, settings (one lazy-loaded chunk,
                           its CSS is scoped under .admin-layout)
  components/              shared UI (Modal, ConfirmModal, CustomSelect, Header, ProtectedRoute, ...)
  hooks/                   useAuth, useSpeechify, useAudioPlayer, useVoiceSettings, useDictionary, ...
  services/                supabase client, speechifyService (Edge Function client), audioStorage
  utils/                   ssml builder, audio processing, wav encoder, text chunking, password policy, ...
  types/                   generated database types and app models
  constants/               languages, emotions, defaults
  styles/                  theme tokens and global reset
  test/                    test setup and helpers
supabase/
  functions/generate-speech/   Edge Function (Deno): index.ts + pure, tested logic.ts
  migrations/                  SQL migrations
```

## Notes

- `VITE_*` variables are embedded into the browser bundle. Never put the Speechify key in one.
- Global CSS is shared between the user-facing pages (there are no CSS modules), so pick unique
  class names when adding styles. Admin styles must stay under `.admin-layout`.
- Tests never depend on a developer's `.env`: `vite.config.ts` sets a fixed test environment.
