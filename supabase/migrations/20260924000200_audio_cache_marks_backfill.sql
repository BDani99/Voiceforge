-- Audio that was generated before word timings were kept has a cache row without them. A client that
-- generates the same audio again may add the timings once. Nothing else in a cache row can be changed
-- and a timing that is already there can never be replaced (rows stay immutable otherwise).

grant update (speech_marks) on public.audio_cache to authenticated;

drop policy if exists "Add missing speech marks" on public.audio_cache;
create policy "Add missing speech marks"
  on public.audio_cache
  for update
  to authenticated
  using (speech_marks is null and not public.is_banned())
  with check (speech_marks is not null and not public.is_banned());
