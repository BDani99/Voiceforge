-- Instant Voice Cloning: who owns which cloned Speechify voice.
--
-- All VoiceForge users share one Speechify account (one API key), so Speechify's
-- GET /v1/voices returns every cloned voice of every user pooled together. This table is the
-- only place that knows which user a cloned voice belongs to; the Edge Function uses it to show
-- each user only their own cloned voices and to authorize deletion. Everything here is written
-- by the Edge Function (service role) only — clients may read their own rows, nothing else.

CREATE TABLE IF NOT EXISTS public.cloned_voices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  speechify_voice_id    text NOT NULL UNIQUE,
  display_name          text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 200),
  gender                text NOT NULL CHECK (gender IN ('male', 'female', 'not_specified')),
  locale                text,
  -- The challenge that proved consent for this voice, kept for support/dispute audit trails.
  consent_challenge_id  text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cloned_voices_user_idx ON public.cloned_voices (user_id, created_at DESC);

ALTER TABLE public.cloned_voices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloned_voices FROM PUBLIC, anon;
GRANT SELECT ON public.cloned_voices TO authenticated;

DROP POLICY IF EXISTS "Users can read their own cloned voices" ON public.cloned_voices;
CREATE POLICY "Users can read their own cloned voices"
  ON public.cloned_voices
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- No INSERT/UPDATE/DELETE policy for authenticated: only the Edge Function (service role, which
-- bypasses RLS) creates or removes rows, after it has verified consent and, for deletion,
-- ownership and a successful call to Speechify.

COMMENT ON TABLE public.cloned_voices IS
  'Ownership of Instant Voice Cloning voices. Written only by the clone-voice Edge Function (service role).';
