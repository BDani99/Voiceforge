import type { Json } from '../types/database';
import type { PresetSettings } from '../types/models';
import { DEFAULT_GLOBAL_DEFAULTS } from '../constants/voiceConstants';
import { hasSameShape } from './shape';

const STRING_KEYS = ['language', 'voice', 'pauseStrength', 'emotion', 'globalEmphasis'] as const;
const NUMBER_KEYS = ['pauseCustomTime', 'paragraphGapPause', 'fadeInDuration', 'fadeOutDuration'] as const;
const BOOLEAN_KEYS = ['usePauseCustom', 'useParagraphGap', 'useFadeTransitions'] as const;

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
