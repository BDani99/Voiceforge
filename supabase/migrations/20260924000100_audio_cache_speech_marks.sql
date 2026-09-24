-- Word level timings ("speech marks") of a rendered audio file, so highlighting and captions do not
-- need a new generation. They are stored next to the audio: same hash, same text and voice, same marks.

alter table public.audio_cache
  add column if not exists speech_marks jsonb;

-- The table is shared between users, so the shape and size of what clients write are limited.
-- The client validates the data again when it reads it.
alter table public.audio_cache
  drop constraint if exists audio_cache_speech_marks_shape;
alter table public.audio_cache
  add constraint audio_cache_speech_marks_shape
  check (
    speech_marks is null
    or (jsonb_typeof(speech_marks) = 'object' and pg_column_size(speech_marks) <= 262144)
  );

-- Column level rights: the API roles only got the columns that existed when they were granted.
grant select (speech_marks), insert (speech_marks) on public.audio_cache to authenticated;

-- A project that is opened again looks the marks up by the URL of its audio.
create index if not exists audio_cache_audio_url_idx on public.audio_cache (audio_url);
