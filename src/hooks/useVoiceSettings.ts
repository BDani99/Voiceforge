import { useState, useEffect, useCallback } from 'react';
import type { GlobalDefaults } from '../types/models';
import { DEFAULT_GLOBAL_DEFAULTS } from '../constants/voiceConstants';
import { hasSameShape } from '../utils/shape';

const STORAGE_PREFIX = 'voiceforge_';

/** Reads a stored setting; corrupt or foreign values fall back to the default. */
function loadState<T>(key: string, defaultValue: T): T {
  try {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (saved === null) return defaultValue;
    const parsed: unknown = JSON.parse(saved);
    return hasSameShape(parsed, defaultValue) ? (parsed as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

/** "word -> pronunciation" lines to a lookup table. Malformed lines are skipped. */
export function parseCustomReplacements(replacements: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  if (!replacements.trim()) return pairs;

  for (const line of replacements.split('\n')) {
    const [original, replacement] = line.split('->').map((s) => s.trim());
    if (original && replacement) pairs[original] = replacement;
  }
  return pairs;
}

export const useVoiceSettings = () => {
  const [globalDefaults, setGlobalDefaults] = useState(() => loadState('globalDefaults', DEFAULT_GLOBAL_DEFAULTS));

  const [pauseStrength, setPauseStrength] = useState(() => loadState('pauseStrength', 'medium'));
  const [pauseCustomTime, setPauseCustomTime] = useState(() => loadState('pauseCustomTime', 750));
  const [usePauseCustom, setUsePauseCustom] = useState(() => loadState('usePauseCustom', false));

  // Paragraph gap pause settings
  const [paragraphGapPause, setParagraphGapPause] = useState(() => loadState('paragraphGapPause', 500));
  const [useParagraphGap, setUseParagraphGap] = useState(() => loadState('useParagraphGap', true));

  // Fade transitions setting
  const [useFadeTransitions, setUseFadeTransitions] = useState(() => loadState('useFadeTransitions', true));
  const [fadeInDuration, setFadeInDuration] = useState(() => loadState('fadeInDuration', 100));
  const [fadeOutDuration, setFadeOutDuration] = useState(() => loadState('fadeOutDuration', 100));

  const [emotion, setEmotion] = useState(() => loadState('emotion', ''));
  const [globalEmphasis, setGlobalEmphasis] = useState(() => loadState('globalEmphasis', ''));

  // The pronunciation dictionary lives in the database, not in localStorage: see useDictionary.
  const [globalCustomReplacements, setGlobalCustomReplacements] = useState('');
  const [dictionaryLoaded, setDictionaryLoaded] = useState(false);

  // Sync to LocalStorage on change
  useEffect(() => {
    const values = {
      globalDefaults, pauseStrength, pauseCustomTime, usePauseCustom, paragraphGapPause,
      useParagraphGap, useFadeTransitions, fadeInDuration, fadeOutDuration, emotion,
      globalEmphasis,
    };
    try {
      Object.entries(values).forEach(([key, value]) => {
        localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
      });
    } catch {
      // Storage can be full or blocked (private mode); settings then simply are not persisted.
    }
  }, [globalDefaults, pauseStrength, pauseCustomTime, usePauseCustom, paragraphGapPause, useParagraphGap, useFadeTransitions, fadeInDuration, fadeOutDuration, emotion, globalEmphasis]);

  const updateGlobalDefaults = useCallback(<K extends keyof GlobalDefaults>(field: K, value: GlobalDefaults[K]) => {
    setGlobalDefaults((prev) => (prev[field] === value ? prev : { ...prev, [field]: value }));
  }, []);

  const replaceGlobalDefaults = useCallback((next: GlobalDefaults) => {
    setGlobalDefaults(next);
  }, []);

  const handleEmphasisChange = useCallback((value: string) => {
    setGlobalEmphasis(value);
  }, []);

  const applyDictionary = useCallback((replacementText: string) => {
    setGlobalCustomReplacements(replacementText);
    setDictionaryLoaded(true);
  }, []);

  const resetSettings = useCallback(() => {
    setGlobalDefaults(DEFAULT_GLOBAL_DEFAULTS);
    setPauseStrength('medium');
    setUsePauseCustom(false);
    setPauseCustomTime(750);
    setParagraphGapPause(500);
    setUseParagraphGap(true);
    setUseFadeTransitions(true);
    setFadeInDuration(100);
    setFadeOutDuration(100);
    setEmotion('');
    setGlobalEmphasis('');
  }, []);

  return {
    globalDefaults,
    updateGlobalDefaults,
    replaceGlobalDefaults,
    pauseStrength,
    setPauseStrength,
    pauseCustomTime,
    setPauseCustomTime,
    usePauseCustom,
    setUsePauseCustom,
    paragraphGapPause,
    setParagraphGapPause,
    useParagraphGap,
    setUseParagraphGap,
    useFadeTransitions,
    setUseFadeTransitions,
    fadeInDuration,
    setFadeInDuration,
    fadeOutDuration,
    setFadeOutDuration,
    emotion,
    setEmotion,
    globalEmphasis,
    handleEmphasisChange,
    globalCustomReplacements,
    dictionaryLoaded,
    applyDictionary,
    parseCustomReplacements,
    resetSettings,
  };
};

export type VoiceSettings = ReturnType<typeof useVoiceSettings>;
