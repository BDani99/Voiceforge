-- Least privilege for the API roles.
--
-- Supabase grants every privilege on every public table to anon and authenticated and relies
-- on RLS alone. RLS does not cover TRUNCATE, and it is one forgotten policy away from a leak,
-- so the roles only get what the app really needs. usage_logs is append-only for clients.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- The login page shows the system announcement to signed-out visitors.
GRANT SELECT ON public.system_settings TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;  -- writes: admin policy
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects, public.paragraphs,
                                        public.presets, public.dictionaries TO authenticated;
GRANT SELECT, UPDATE ON public.users_profile TO authenticated;  -- protected columns: trigger
GRANT SELECT, INSERT ON public.usage_logs TO authenticated;     -- INSERT: admin policy only
GRANT SELECT, INSERT ON public.audio_cache TO authenticated;

-- ---------------------------------------------------------------- storage

-- Files are content addressed: <sha256 hex>.<ext>. Nothing else can be uploaded.
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
CREATE POLICY "Authenticated users can upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'voiceovers' AND name ~ '^[0-9a-f]{64}\.(mp3|wav|ogg|aac)$');

DROP POLICY IF EXISTS "Owners can overwrite own audio" ON storage.objects;
CREATE POLICY "Owners can overwrite own audio" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'voiceovers' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'voiceovers' AND owner = auth.uid() AND name ~ '^[0-9a-f]{64}\.(mp3|wav|ogg|aac)$');

-- The bucket is public, so playback through the public URL keeps working. Listing the
-- bucket (which reveals every user's file names) is limited to signed-in users.
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
CREATE POLICY "Authenticated users can read audio" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'voiceovers');
