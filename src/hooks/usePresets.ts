import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { notify } from '../utils/notificationService';
import { copyName, parsePresetSettings, presetSettingsEqual, validatePresetName } from '../utils/presets';
import type { Json } from '../types/database';
import type { Tables } from '../types/aliases';
import type { PresetSettings } from '../types/models';

const ACTIVE_KEY = 'voiceforge_activePresetId';

export interface PresetItem {
  id: string;
  name: string;
  settings: PresetSettings;
  isDefault: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

const toItem = (row: Tables<'presets'>): PresetItem => ({
  id: row.id,
  name: row.name,
  settings: parsePresetSettings(row.settings),
  isDefault: row.is_default,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const sortItems = (items: PresetItem[]): PresetItem[] =>
  [...items].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));

function readActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeActiveId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Storage may be blocked; the active preset is then simply not remembered.
  }
}

/** A database error to a message the user understands. */
function failure(error: unknown, fallback: string): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;
  if (code === '23505') return 'You already have a preset with this name.';
  notify.error(error, fallback);
  return fallback;
}

interface UsePresetsOptions {
  /** The voice setup as it is right now. */
  current: PresetSettings;
  /** Puts a preset's settings into the workspace. */
  onApply: (settings: PresetSettings) => void;
  /**
   * When true, the user's default preset is applied once as soon as the presets are loaded. The
   * workspace only allows this while nothing is generated yet, so no audio is thrown away.
   */
  autoApplyDefault: boolean;
}

/** The user's voice presets: load, save, overwrite, rename, duplicate, delete and default. */
export function usePresets({ current, onApply, autoApplyDefault }: UsePresetsOptions) {
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveIdState] = useState<string | null>(readActiveId);
  const [busy, setBusy] = useState(false);

  const currentRef = useRef(current);
  const onApplyRef = useRef(onApply);
  useEffect(() => {
    currentRef.current = current;
    onApplyRef.current = onApply;
  });

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    writeActiveId(id);
  }, []);

  // ------------------------------------------------------------------- loading

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data, error } = await supabase.from('presets').select('*').eq('user_id', user.id);
      if (cancelled) return;

      if (error) {
        notify.error(error, 'Could not load your presets');
      } else {
        const items = sortItems(data.map(toItem));
        setPresets(items);
        // A remembered active preset that was deleted elsewhere is forgotten.
        setActiveIdState((id) => (id && items.some((p) => p.id === id) ? id : null));
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  const applyPreset = useCallback((id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    onApplyRef.current(preset.settings);
    setActiveId(id);
  }, [presets, setActiveId]);

  // The default preset is applied once, when the workspace is still "empty".
  const autoAppliedRef = useRef(false);
  useEffect(() => {
    if (autoAppliedRef.current || loading || !autoApplyDefault) return;
    autoAppliedRef.current = true;
    const preset = presets.find((p) => p.isDefault);
    if (preset) applyPreset(preset.id);
  }, [autoApplyDefault, loading, presets, applyPreset]);

  // --------------------------------------------------------------------- actions

  const namesExcept = useCallback((id?: string) => presets.filter((p) => p.id !== id).map((p) => p.name), [presets]);

  /** Runs a database action with the busy flag. Returns the value, or null when it failed. */
  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    try {
      return await action();
    } catch (error) {
      failure(error, 'The preset could not be saved');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  /** Saves the current setup as a new preset. Returns an error message or null on success. */
  const create = useCallback(async (name: string): Promise<string | null> => {
    const problem = validatePresetName(name, namesExcept());
    if (problem) return problem;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'You are not signed in.';

    const created = await run(async () => {
      const { data, error } = await supabase
        .from('presets')
        .insert({ user_id: user.id, name: name.trim(), settings: currentRef.current as Json })
        .select()
        .single();
      if (error) throw error;
      return toItem(data);
    });
    if (!created) return 'The preset could not be saved.';

    setPresets((prev) => sortItems([...prev, created]));
    setActiveId(created.id);
    notify.success(`Saved preset "${created.name}"`);
    return null;
  }, [namesExcept, run, setActiveId]);

  /** Replaces the settings of a preset with the current setup. */
  const overwrite = useCallback(async (id: string): Promise<void> => {
    const updated = await run(async () => {
      const { data, error } = await supabase
        .from('presets')
        .update({ settings: currentRef.current as Json })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return toItem(data);
    });
    if (!updated) return;
    setPresets((prev) => sortItems(prev.map((p) => (p.id === id ? updated : p))));
    notify.success(`Updated preset "${updated.name}"`);
  }, [run]);

  const rename = useCallback(async (id: string, name: string): Promise<string | null> => {
    const problem = validatePresetName(name, namesExcept(id));
    if (problem) return problem;

    const updated = await run(async () => {
      const { data, error } = await supabase.from('presets').update({ name: name.trim() }).eq('id', id).select().single();
      if (error) throw error;
      return toItem(data);
    });
    if (!updated) return 'The preset could not be renamed.';
    setPresets((prev) => sortItems(prev.map((p) => (p.id === id ? updated : p))));
    return null;
  }, [namesExcept, run]);

  const duplicate = useCallback(async (id: string): Promise<void> => {
    const source = presets.find((p) => p.id === id);
    if (!source) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const created = await run(async () => {
      const { data, error } = await supabase
        .from('presets')
        .insert({ user_id: user.id, name: copyName(source.name, namesExcept()), settings: source.settings as Json })
        .select()
        .single();
      if (error) throw error;
      return toItem(data);
    });
    if (!created) return;
    setPresets((prev) => sortItems([...prev, created]));
    notify.success(`Created "${created.name}"`);
  }, [presets, namesExcept, run]);

  const remove = useCallback(async (id: string): Promise<void> => {
    const ok = await run(async () => {
      const { error } = await supabase.from('presets').delete().eq('id', id);
      if (error) throw error;
      return true;
    });
    if (!ok) return;
    setPresets((prev) => prev.filter((p) => p.id !== id));
    setActiveIdState((current) => {
      if (current !== id) return current;
      writeActiveId(null);
      return null;
    });
    notify.success('Preset deleted');
  }, [run]);

  /** Makes a preset the default (or removes the default with null). Only one preset can be the default. */
  const setDefault = useCallback(async (id: string | null): Promise<void> => {
    const ok = await run(async () => {
      const { error } = await supabase.rpc('set_default_preset', { p_preset_id: id! });
      if (error) throw error;
      return true;
    });
    if (!ok) return;
    setPresets((prev) => sortItems(prev.map((p) => ({ ...p, isDefault: p.id === id }))));
  }, [run]);

  // ---------------------------------------------------------------------- derived

  const activePreset = useMemo(() => presets.find((p) => p.id === activeId) ?? null, [presets, activeId]);
  const isModified = useMemo(
    () => (activePreset ? !presetSettingsEqual(activePreset.settings, current) : false),
    [activePreset, current],
  );

  return {
    presets,
    loading,
    busy,
    activeId,
    activePreset,
    isModified,
    apply: applyPreset,
    create,
    overwrite,
    rename,
    duplicate,
    remove,
    setDefault,
  };
}

export type PresetsApi = ReturnType<typeof usePresets>;
