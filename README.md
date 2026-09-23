# VoiceForge

Text-to-speech studio built with React and Supabase. Users write text in paragraphs, pick a
voice, language and speech style, generate audio through the [Speechify API](https://docs.sws.speechify.com/)
and export the result. An admin area manages users, credits and system settings.

## Stack

- React 18, React Router 7, Vite 7
- Supabase: auth, Postgres (RLS), storage and one Edge Function
- Speechify API, called **only** from the Edge Function so the API key never reaches the browser
- Recharts for the usage charts, Vitest for unit tests

## Getting started

```bash
npm install
cp .env.example .env      # fill in your Supabase URL and anon key
npm run dev               # http://localhost:3000
```

| Script            | Purpose                              |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Dev server                           |
| `npm run build`   | Production build into `dist/`        |
| `npm run preview` | Serve the production build           |
| `npm run lint`    | ESLint (fails on warnings)           |
| `npm test`        | Unit tests (SSML builder, chunking)  |

## Supabase setup

1. Apply the SQL files in [supabase/migrations](supabase/migrations) in filename order
   (SQL editor or `supabase db push`). They are required, not optional:
   - `harden_admin_and_rls`: admin rights come from `users_profile.role` only, profile
     columns (credits, role, ban flag, email) cannot be edited from the browser, locked-down
     `usage_logs`, `audio_cache` and `voiceovers` storage.
   - `admin_dashboard_stats`: the admin dashboard numbers, aggregated in the database.
   - `restrict_function_grants`: only the RPCs the app uses stay callable.
2. Set the Edge Function secrets and deploy it:

   ```bash
   supabase secrets set SPEECHIFY_API_KEY=<key>
   # optional: restrict browser origins (default: any)
   supabase secrets set ALLOWED_ORIGINS=https://your-app.example.com
   supabase functions deploy generate-speech
   ```

3. Make sure a public storage bucket named `voiceovers` exists.
4. Give your admin account `role = 'admin'` in `users_profile`. The client trusts the
   profile role only; enforce the same rule in your RLS policies for the admin tables.

### How credits work

The Edge Function is the single place that charges credits. It checks the session and the ban
flag, reserves the characters with an optimistic-concurrency update (parallel requests cannot
overdraw an account), calls Speechify and refunds the reservation if generation fails. Audio
that is already in the shared cache costs nothing.

## Project structure

```
src/
  main.jsx, App.jsx        entry point, routes and route guard
  context/                 AuthProvider (session + profile, loaded once)
  pages/
    Auth/                  login / register
    Dashboard/             project list
    Profile/               usage stats and account settings
    Workspace/             editor; its own widgets live in Workspace/components
    Admin/                 admin login, layout, users, logs, settings (one lazy-loaded chunk,
                           its CSS is scoped under .admin-layout)
  components/              shared UI (Accordion, Modal, ConfirmModal, CustomSelect, Header, ...)
  hooks/                   useAuth, useSpeechify, useAudioPlayer, useVoiceSettings, useConfirm
  services/                supabase client, speechifyService (Edge Function client), audioStorage
  utils/                   ssml builder, audio processing (fade, concat), wav encoder, text chunking
  constants/               languages, emotions, pause options
  styles/                  theme tokens and global reset
supabase/
  functions/generate-speech/   Edge Function (Deno)
  migrations/                  SQL migrations
```

## Notes

- `VITE_*` variables are embedded into the browser bundle. Only the Supabase URL and anon key
  belong there. Never put the Speechify key in a `VITE_*` variable.
- Global CSS is shared between the user-facing pages (there are no CSS modules), so pick unique
  class names when adding styles. Admin styles must stay under `.admin-layout`.
