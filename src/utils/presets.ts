import type { Json } from '../types/database';
import type { PresetSettings, Voice } from '../types/models';
import { DEFAULT_GLOBAL_DEFAULTS } from '../constants/voiceConstants';
import { hasSameShape } from './shape';
import { AUTO_MODEL, localeLabel, modelLabel, voiceName } from './voices';

const STRING_KEYS = ['language', 'voice', 'model', 'pauseStrength', 'emotion', 'globalEmphasis'] as const;
const NUMBER_KEYS = ['pauseCustomTime', 'paragraphGapPause', 'fadeInDuration', 'fadeOutDuration'] as const;
const BOOLEAN_KEYS = ['usePauseCustom', 'useParagraphGap', 'useFadeTransitions'] as const;

export const MAX_PRESET_NAME_LENGTH = 60;

/**
 * Presets are stored as free-form JSON. Only well-typed, known fields are taken over, so a
 * malformed or hand-edited preset can never put wrong types into the settings state.
 */
export function parsePresetSettings(value: Json | undefined): PresetSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const source = value as Record<string, Json | undefined>;
  const result: PresetSettings = {};

  for (const key of STRING_KEYS) {
    const v = source[key];
    if (typeof v === 'string') result[key] = v;
  }
  for (const key of NUMBER_KEYS) {
    const v = source[key];
    if (typeof v === 'number' && Number.isFinite(v)) result[key] = v;
  }
  for (const key of BOOLEAN_KEYS) {
    const v = source[key];
    if (typeof v === 'boolean') result[key] = v;
  }
  if (hasSameShape(source.globalDefaults, DEFAULT_GLOBAL_DEFAULTS)) {
    result.globalDefaults = { ...DEFAULT_GLOBAL_DEFAULTS, ...(source.globalDefaults as object) };
  }

  return result;
}

/** Fills the fields an older preset does not have, so old and new presets can be compared. */
function withDefaults(settings: PresetSettings): Required<PresetSettings> {
  return {
    language: settings.language ?? '',
    voice: settings.voice ?? '',
    model: settings.model ?? AUTO_MODEL,
    globalDefaults: settings.globalDefaults ?? DEFAULT_GLOBAL_DEFAULTS,
    pauseStrength: settings.pauseStrength ?? 'medium',
    usePauseCustom: settings.usePauseCustom ?? false,
    pauseCustomTime: settings.pauseCustomTime ?? 750,
    paragraphGapPause: settings.paragraphGapPause ?? 500,
    useParagraphGap: settings.useParagraphGap ?? true,
    useFadeTransitions: settings.useFadeTransitions ?? true,
    fadeInDuration: settings.fadeInDuration ?? 100,
    fadeOutDuration: settings.fadeOutDuration ?? 100,
    emotion: settings.emotion ?? '',
    globalEmphasis: settings.globalEmphasis ?? '',
  };
}

const stable = (settings: PresetSettings): string => {
  const full = withDefaults(settings);
  return JSON.stringify(Object.keys(full).sort().map((key) => [key, full[key as keyof typeof full]]));
};

/** Whether two settings describe the same voice setup (fields a preset lacks count as their defaults). */
export function presetSettingsEqual(a: PresetSettings, b: PresetSettings): boolean {
  return stable(a) === stable(b);
}

/** Case- and whitespace-insensitive key used for the "name already taken" check. */
export const presetNameKey = (name: string): string => name.trim().toLowerCase();

/** Error message for an unusable preset name, or null. `taken` are the other names of the user. */
export function validatePresetName(name: string, taken: string[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Give the preset a name.';
  if (trimmed.length > MAX_PRESET_NAME_LENGTH) return `The name can be at most ${MAX_PRESET_NAME_LENGTH} characters.`;
  if (taken.some((t) => presetNameKey(t) === presetNameKey(trimmed))) return 'You already have a preset with this name.';
  return null;
}

/** "Basic" to "Basic copy", "Basic copy 2", ... the first free name. */
export function copyName(name: string, taken: string[]): string {
  const base = name.trim().slice(0, MAX_PRESET_NAME_LENGTH - 8);
  const used = new Set(taken.map(presetNameKey));
  let candidate = `${base} copy`;
  for (let n = 2; used.has(presetNameKey(candidate)); n++) candidate = `${base} copy ${n}`;
  return candidate;
}

export interface PresetSummary {
  voice: string;
  language: string;
  model: string;
  /** e.g. ["Pitch high", "Speed +10%"], only what differs from the neutral defaults. */
  tuning: string[];
  /** e.g. ["Emotion calm", "Emphasis strong", "Fade 100/100 ms"] */
  style: string[];
}

const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value}%`;

export function summarizePreset(settings: PresetSettings, voices: Voice[]): PresetSummary {
  const s = withDefaults(settings);
  const voice = voices.find((v) => v.id === s.voice);
  const g = s.globalDefaults;

  const tuning: string[] = [];
  const pitch = g.usePitchCustom ? signed(g.pitchCustom) : g.pitch;
  const rate = g.useRateCustom ? signed(g.rateCustom) : g.rate;
  const volume = g.useVolumeCustom ? signed(g.volumeCustom) : g.volume;
  if (pitch !== 'medium' && pitch !== '+0%') tuning.push(`Pitch ${pitch}`);
  if (rate !== 'medium' && rate !== '+0%') tuning.push(`Speed ${rate}`);
  if (volume !== 'medium' && volume !== '+0%') tuning.push(`Volume ${volume}`);

  const style: string[] = [];
  if (s.emotion) style.push(`Emotion ${s.emotion}`);
  if (s.globalEmphasis) style.push(`Emphasis ${s.globalEmphasis}`);
  style.push(s.usePauseCustom ? `Pauses ${s.pauseCustomTime} ms` : `Pauses ${s.pauseStrength}`);
  if (s.useFadeTransitions) style.push(`Fade ${s.fadeInDuration}/${s.fadeOutDuration} ms`);

  return {
    voice: voice ? voiceName(voice) : s.voice || 'No voice saved',
    language: s.language ? localeLabel(s.language) : '',
    model: s.model === AUTO_MODEL ? 'Auto model' : modelLabel(s.model),
    tuning: tuning.length > 0 ? tuning : ['Neutral pitch, speed and volume'],
    style,
  };
}
