import { useState, useEffect, useCallback } from 'react';

export const useVoiceSettings = () => {
  const loadState = (key, defaultValue) => {
    try {
      const saved = localStorage.getItem(`voiceforge_${key}`);
      return saved !== null ? JSON.parse(saved) : defaultValue;
    } catch (err) {
      return defaultValue;
    }
  };

  const [globalDefaults, setGlobalDefaults] = useState(() => loadState('globalDefaults', {
    pitch: 'medium',
    pitchCustom: 0,
    usePitchCustom: false,
    rate: 'medium',
    rateCustom: 0,
    useRateCustom: false,
    volume: 'medium',
    volumeCustom: 0,
    useVolumeCustom: false,
  }));

  const [pauseStrength, setPauseStrength] = useState(() => loadState('pauseStrength', "medium"));
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
        localStorage.setItem(`voiceforge_${key}`, JSON.stringify(value));
      });
    } catch {
      // Storage can be full or blocked (private mode); settings then simply are not persisted.
    }
  }, [globalDefaults, pauseStrength, pauseCustomTime, usePauseCustom, paragraphGapPause, useParagraphGap, useFadeTransitions, fadeInDuration, fadeOutDuration, emotion, globalEmphasis]);

  const updateGlobalDefaults = useCallback((field, value) => {
    setGlobalDefaults(prev => {
      if (prev[field] !== value) {
        return {
          ...prev,
          [field]: value
        };
      }
      return prev;
    });
  }, []);

  const handleEmphasisChange = useCallback((value) => {
    if (globalEmphasis !== value) {
      setGlobalEmphasis(value);
    }
  }, [globalEmphasis]);

  const applyDictionary = useCallback((replacementText) => {
    setGlobalCustomReplacements(replacementText);
    setDictionaryLoaded(true);
  }, []);

  const parseCustomReplacements = useCallback((replacements) => {
    if (!replacements.trim()) return {};

    const pairs = {};
    try {
      const lines = replacements.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const [original, replacement] = line.split('->').map(s => s.trim());
        if (original && replacement) {
          pairs[original] = replacement;
        }
      }
    } catch {
      // A malformed line is skipped, the rest of the dictionary still applies.
    }
    return pairs;
  }, []);

  const resetSettings = useCallback(() => {
    setGlobalDefaults({
      pitch: 'medium',
      pitchCustom: 0,
      usePitchCustom: false,
      rate: 'medium',
      rateCustom: 0,
      useRateCustom: false,
      volume: 'medium',
      volumeCustom: 0,
      useVolumeCustom: false,
    });
    setPauseStrength("medium");
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
    resetSettings
  };
};
