# VoiceForge

Text-to-speech studio built with React, TypeScript and Supabase. Users write text in paragraphs,
pick a voice, language and speech style, generate audio through the
[Speechify API](https://docs.speechify.ai/) and export the result. An admin area manages users,
credits and system settings.

## Stack

- React 18, React Router 7, Vite 7, TypeScript (strict)
- Supabase: auth, Postgres (RLS), storage, pg_cron and two Edge Functions (Deno):
  `generate-speech` (voices, speech, streaming) and `clone-voice` (Instant Voice Cloning)
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

## Features in the workspace

- **Voice picker**: the selected voice is a card (avatar, gender, language, model). Clicking it opens a
  searchable list of all Speechify voices, filterable by language, model, use case and gender, with
  a sample player for every voice.
- **Model**: chosen automatically for the voice and language (Simba 3.2 for English, Simba 3.0 for the
  other supported languages) and changeable by hand. Legacy models are marked as such.
- **Emotion**: set for a whole paragraph, for all paragraphs at once, or for highlighted parts of the
  text. A paragraph uses either a whole-paragraph emotion or highlights, never both. Emotions are
  sent as `<speechify:style>` SSML and are only available with models that support them.
- **Emphasis, pronunciation and pauses**: select text and choose Emphasis (reduced, moderate, strong),
  Pronounce (read it as another text, e.g. 3/4 → "three quarters") or Pause (a pause behind the
  selection, or at the cursor). They combine with emotions. Speechify has no `<say-as>` tag; the
  documented `<sub alias>` is what is used for numbers, dates, units and abbreviations.
- **Word timings**: Speechify's speech marks are kept with every generated audio (in `audio_cache`).
  While a paragraph plays, the spoken word is highlighted. **Export** offers the audio and
  subtitles (`.srt`, `.vtt`) that line up with it, including the pause between paragraphs.
  Audio generated before timings were kept gets estimated timing (regenerate it for exact timing).
- **Play while generating**: a paragraph that is not generated yet starts playing as soon as the
  first audio arrives (streamed over server-sent events, raw PCM through Web Audio). The finished
  audio is stored as usual. Can be switched off in the advanced settings.
- **Pitch, speed and volume** sit under the voice card; **Voice presets** save the whole setup
  (voice, model, tuning, pauses, emotion) with rename, duplicate, overwrite and a default preset that
  is applied to new projects.

## Voice cloning

Under **Profile → Voices** a user can clone a voice (Speechify Instant Voice Cloning): a 10-30 second
sample, then the speaker reads a consent phrase that Speechify issues (it is verified against the
sample, so the person being cloned has to record it themselves). A clone costs credits (set by an
admin under **Admin → Settings**, default 5000) that are refunded when the creation fails. Cloned
voices show a "Cloned" badge in the voice picker.

Cloned voices of all users live in the one Speechify account, so ownership is kept in
`cloned_voices` (RLS: a user reads only their own rows; only the Edge Function writes). The
voices list only contains the cloned voices of the requesting user, and `generate-speech` refuses
(403) a voice that belongs to somebody else. Voice cloning needs a Speechify plan that includes it
(otherwise creating a voice answers 402).

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
   - `presets_default_and_names`: one default preset per user, unique names, `set_default_preset()`.
   - `audio_cache_speech_marks` and `audio_cache_marks_backfill`: word timings stored with the audio
     (added once, only while empty).
   - `voice_cloning`: the `cloned_voices` ownership table.
2. Set the Edge Function secrets and deploy the functions:

   ```bash
   supabase secrets set SPEECHIFY_API_KEY=<key>
   # optional: restrict browser origins (default: any)
   supabase secrets set ALLOWED_ORIGINS=https://your-app.example.com
   supabase functions deploy generate-speech
   supabase functions deploy clone-voice
   ```

   `supabase/config.toml` keeps `verify_jwt = false` for both: they authenticate the caller
   themselves and have to answer CORS preflight requests, which carry no JWT. The API key is sent to
   Speechify directly (`https://api.speechify.ai/v1`, server side only); the old access-token
   exchange is deprecated by Speechify and no longer used.
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
