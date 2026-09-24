-- Voice presets: a per-user default preset, unique names and a modification time.

ALTER TABLE public.presets
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.presets ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.presets
  ADD CONSTRAINT presets_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 60);

-- A user cannot have two presets with the same name (case-insensitive) or two defaults.
CREATE UNIQUE INDEX IF NOT EXISTS presets_user_name_key ON public.presets (user_id, lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS presets_one_default_per_user ON public.presets (user_id) WHERE is_default;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS presets_touch_updated_at ON public.presets;
CREATE TRIGGER presets_touch_updated_at
  BEFORE UPDATE ON public.presets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Makes one preset the default (or clears the default with NULL) in a single transaction.
-- SECURITY INVOKER: it only ever touches the caller's own presets, RLS applies as usual.
CREATE OR REPLACE FUNCTION public.set_default_preset(p_preset_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.presets
  SET is_default = false
  WHERE user_id = auth.uid() AND is_default AND id IS DISTINCT FROM p_preset_id;

  IF p_preset_id IS NOT NULL THEN
    UPDATE public.presets SET is_default = true WHERE id = p_preset_id AND user_id = auth.uid();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'preset_not_found' USING ERRCODE = 'P0404';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_default_preset(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_preset(uuid) TO authenticated;
