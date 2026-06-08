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
  const [globalCustomReplacements, setGlobalCustomReplacements] = useState(() => loadState('globalCustomReplacements', ''));

  // Sync to LocalStorage on change
  useEffect(() => {
    localStorage.setItem('voiceforge_globalDefaults', JSON.stringify(globalDefaults));
    localStorage.setItem('voiceforge_pauseStrength', JSON.stringify(pauseStrength));
    localStorage.setItem('voiceforge_pauseCustomTime', JSON.stringify(pauseCustomTime));
    localStorage.setItem('voiceforge_usePauseCustom', JSON.stringify(usePauseCustom));
    localStorage.setItem('voiceforge_paragraphGapPause', JSON.stringify(paragraphGapPause));
    localStorage.setItem('voiceforge_useParagraphGap', JSON.stringify(useParagraphGap));
    localStorage.setItem('voiceforge_useFadeTransitions', JSON.stringify(useFadeTransitions));
    localStorage.setItem('voiceforge_fadeInDuration', JSON.stringify(fadeInDuration));
    localStorage.setItem('voiceforge_fadeOutDuration', JSON.stringify(fadeOutDuration));
    localStorage.setItem('voiceforge_emotion', JSON.stringify(emotion));
    localStorage.setItem('voiceforge_globalEmphasis', JSON.stringify(globalEmphasis));
    localStorage.setItem('voiceforge_globalCustomReplacements', JSON.stringify(globalCustomReplacements));
  }, [globalDefaults, pauseStrength, pauseCustomTime, usePauseCustom, paragraphGapPause, useParagraphGap, useFadeTransitions, fadeInDuration, fadeOutDuration, emotion, globalEmphasis, globalCustomReplacements]);

  const updateGlobalDefaults = useCallback((field, value) => {
    console.log(`⚙️ Updating global setting: ${field} = ${value}`);
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
    console.log(`📢 Updating emphasis: ${value}`);
    if (globalEmphasis !== value) {
      setGlobalEmphasis(value);
    }
  }, [globalEmphasis]);

  const handleCustomReplacementsChange = useCallback((value) => {
    console.log(`🔄 Updating custom replacements`);
    if (globalCustomReplacements !== value) {
      setGlobalCustomReplacements(value);
    }
  }, [globalCustomReplacements]);

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
    } catch (err) {
      console.warn('Invalid custom replacements format:', err);
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
    setGlobalCustomReplacements('');
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
    handleCustomReplacementsChange,
    parseCustomReplacements,
    resetSettings
  };
};
