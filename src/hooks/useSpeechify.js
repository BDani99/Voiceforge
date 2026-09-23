import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import speechifyService from '../services/speechifyService';
import { supabase } from '../services/supabase';
import { findCachedAudio, storeAudio, fetchAudioBlob, getAudioHash } from '../services/audioStorage';
import { applyFade } from '../utils/audioProcessing';
import { notify, getErrorMessage } from '../utils/notificationService';

const AUTOSAVE_DELAY_MS = 1500;

const newParagraph = (text = '') => ({
  id: crypto.randomUUID(),
  text: text.trim(),
  audioBlob: null,
  audioUrl: null,
  isGenerated: false,
  wasCached: false,
});

const STALE_AUDIO = { audioBlob: null, audioUrl: null, isGenerated: false, wasCached: false };

const percent = (value) => `${value >= 0 ? '+' : ''}${value}%`;

/** Translates the UI settings into the option object understood by buildSSML. */
function buildSsmlOptions(settings, { preview = false } = {}) {
  const { globalDefaults: d } = settings;

  return {
    prosody: {
      pitch: d.usePitchCustom ? percent(d.pitchCustom) : d.pitch,
      rate: d.useRateCustom ? percent(d.rateCustom) : d.rate,
      volume: d.useVolumeCustom ? percent(d.volumeCustom) : d.volume,
    },
    breaks: preview
      ? { enabled: false }
      : {
        enabled: settings.pauseStrength !== 'none' || settings.usePauseCustom,
        pauseType: settings.usePauseCustom ? 'time' : 'strength',
        pauseStrength: settings.pauseStrength,
        pauseTime: settings.pauseCustomTime,
      },
    emphasis: settings.globalEmphasis
      ? { enabled: true, level: settings.globalEmphasis }
      : { enabled: false },
    emotion: settings.emotion
      ? { enabled: true, type: settings.emotion }
      : { enabled: false },
    customReplacements: settings.parseCustomReplacements(settings.globalCustomReplacements),
    addSilencePadding: preview ? false : settings.useFadeTransitions,
    silenceDuration: 50,
  };
}

export const useSpeechify = (settings, projectId) => {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [error, setError] = useState('');
  const [paragraphs, setParagraphs] = useState(() => [newParagraph()]);
  const [generatingIndex, setGeneratingIndex] = useState(-1);

  // Auto-save must never run before the stored paragraphs were loaded, otherwise the
  // placeholder paragraph would overwrite (and delete) the real content.
  const [isLoaded, setIsLoaded] = useState(false);
  const isLoadedRef = useRef(false);
  const isInitializedRef = useRef(false);
  const inFlightRef = useRef(new Map()); // paragraph id -> pending generation promise
  const latestParagraphsRef = useRef(paragraphs);
  const hasUnsavedChangesRef = useRef(false);
  const saveChainRef = useRef(Promise.resolve());

  const generatedParagraphs = useMemo(() => {
    const generated = new Set();
    paragraphs.forEach((p, index) => {
      if (p.isGenerated) generated.add(index);
    });
    return generated;
  }, [paragraphs]);

  const patchParagraph = useCallback((id, patch) => {
    setParagraphs((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  // ---------------------------------------------------------------- loading

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    isLoadedRef.current = false;
    setIsLoaded(false);

    (async () => {
      const { data, error: loadError } = await supabase
        .from('paragraphs')
        .select('*')
        .eq('project_id', projectId)
        .order('order_index', { ascending: true });
      if (cancelled) return;

      if (loadError) {
        console.error('Error fetching paragraphs:', loadError);
        notify.error(loadError, 'Failed to load the project text. Changes will not be saved.');
        return; // stay "not loaded" so auto-save cannot overwrite the stored content
      }

      if (data.length > 0) {
        setParagraphs(data.map((p) => ({
          id: p.id,
          text: p.content,
          audioUrl: p.audio_url,
          audioBlob: null,
          isGenerated: !!p.audio_url,
          wasCached: !!p.audio_url,
        })));
      }
      hasUnsavedChangesRef.current = false;
      isLoadedRef.current = true;
      setIsLoaded(true);
    })();

    return () => { cancelled = true; };
  }, [projectId]);

  const loadVoices = useCallback(async () => {
    setIsLoadingVoices(true);
    try {
      const voiceList = await speechifyService.getVoices();
      setVoices(voiceList);
      if (voiceList.length > 0) {
        setSelectedVoice(voiceList[0].id);
        if (voiceList[0].locale) setSelectedLanguage(voiceList[0].locale);
      }
    } catch (err) {
      setError(`Failed to load voices: ${err.message}`);
    } finally {
      setIsLoadingVoices(false);
    }
  }, []);

  useEffect(() => {
    loadVoices();
  }, [loadVoices]);

  // -------------------------------------------------------------- auto-save

  const saveParagraphs = useCallback((list) => {
    // Saves run one after another so an older snapshot can never overwrite a newer one.
    saveChainRef.current = saveChainRef.current.then(async () => {
      try {
        const rows = list.map((p, index) => ({
          id: p.id,
          project_id: projectId,
          content: p.text,
          order_index: index,
          audio_url: p.audioUrl || null,
          settings: {},
        }));

        const { error: upsertError } = await supabase.from('paragraphs').upsert(rows);
        if (upsertError) throw upsertError;

        const { error: deleteError } = await supabase
          .from('paragraphs')
          .delete()
          .eq('project_id', projectId)
          .not('id', 'in', `(${rows.map((r) => r.id).join(',')})`);
        if (deleteError) throw deleteError;

        if (latestParagraphsRef.current === list) hasUnsavedChangesRef.current = false;
      } catch (err) {
        console.error('Failed to auto-save paragraphs:', err);
      }
    });
    return saveChainRef.current;
  }, [projectId]);

  useEffect(() => {
    latestParagraphsRef.current = paragraphs;
    if (!projectId || !isLoaded) return undefined;

    hasUnsavedChangesRef.current = true;
    const timeoutId = setTimeout(() => saveParagraphs(paragraphs), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [paragraphs, projectId, isLoaded, saveParagraphs]);

  // Flush pending edits when leaving the workspace.
  useEffect(() => () => {
    if (isLoadedRef.current && hasUnsavedChangesRef.current) {
      saveParagraphs(latestParagraphsRef.current);
    }
  }, [saveParagraphs]);

  // ---------------------------------------------------- settings invalidation

  const invalidateAllAudio = useCallback(() => {
    if (!isInitializedRef.current || !isLoadedRef.current) return;

    speechifyService.clearCache();
    setParagraphs((prev) => prev.map((p) => ({ ...p, ...STALE_AUDIO })));
  }, []);

  const handleVoiceChange = useCallback((voiceId) => {
    setSelectedVoice(voiceId);
    const voice = voices.find((v) => v.id === voiceId);
    if (voice?.locale) {
      // Hungarian uses English fallback voices, so do not switch the language away from it.
      setSelectedLanguage((current) => (current === 'hu-HU' ? current : voice.locale));
    }
    invalidateAllAudio();
  }, [voices, invalidateAllAudio]);

  const handleLanguageChange = useCallback((langCode) => {
    setSelectedLanguage(langCode);
    const voiceForLang = voices.find((v) => v.locale === langCode);
    if (voiceForLang) setSelectedVoice(voiceForLang.id);
    invalidateAllAudio();
  }, [voices, invalidateAllAudio]);

  // Voice and language are handled explicitly above, because loadVoices() sets them
  // initially and that must not wipe the generated state.
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      return;
    }
    invalidateAllAudio();
  }, [
    settings.globalDefaults.pitch,
    settings.globalDefaults.pitchCustom,
    settings.globalDefaults.usePitchCustom,
    settings.globalDefaults.rate,
    settings.globalDefaults.rateCustom,
    settings.globalDefaults.useRateCustom,
    settings.globalDefaults.volume,
    settings.globalDefaults.volumeCustom,
    settings.globalDefaults.useVolumeCustom,
    settings.pauseStrength,
    settings.usePauseCustom,
    settings.pauseCustomTime,
    settings.emotion,
    settings.globalEmphasis,
    settings.useFadeTransitions,
    settings.fadeInDuration,
    settings.fadeOutDuration,
    invalidateAllAudio,
  ]);

  // Dictionary changes invalidate audio too, but the first load is only the baseline:
  // audio generated earlier with the same dictionary must stay valid.
  const dictionaryBaselineRef = useRef(null);
  useEffect(() => {
    if (!settings.dictionaryLoaded) return;
    if (dictionaryBaselineRef.current === null) {
      dictionaryBaselineRef.current = settings.globalCustomReplacements;
      return;
    }
    if (dictionaryBaselineRef.current !== settings.globalCustomReplacements) {
      dictionaryBaselineRef.current = settings.globalCustomReplacements;
      invalidateAllAudio();
    }
  }, [settings.dictionaryLoaded, settings.globalCustomReplacements, invalidateAllAudio]);

  // ------------------------------------------------------- paragraph editing

  // Only the first paragraph splits (pasting a long text there); all other paragraphs are kept.
  const handleSplitText = useCallback((text) => {
    let parts = text.split(/\n\s*\n/).filter((p) => p.trim());
    if (parts.length <= 1) {
      const lines = text.split('\n').filter((p) => p.trim());
      if (lines.length > 1) parts = lines;
    }
    const replacement = parts.length > 0 ? parts.map(newParagraph) : [newParagraph(text)];
    setParagraphs((prev) => [...replacement, ...prev.slice(1)]);
  }, []);

  const updateParagraph = useCallback((index, field, value) => {
    setParagraphs((prev) => prev.map((p, i) => {
      if (i !== index) return p;
      // Editing the text makes any stored audio stale.
      return field === 'text' ? { ...p, text: value, ...STALE_AUDIO } : { ...p, [field]: value };
    }));
  }, []);

  const deleteParagraph = useCallback((index) => {
    setParagraphs((prev) => {
      const remaining = prev.filter((_, i) => i !== index);
      return remaining.length > 0 ? remaining : [newParagraph()];
    });
  }, []);

  const addParagraphAtStart = useCallback(() => {
    setParagraphs((prev) => [newParagraph(), ...prev]);
  }, []);

  const resetSpeechify = useCallback(() => {
    setParagraphs([newParagraph()]);
    setError('');
    isInitializedRef.current = false;
  }, []);

  // -------------------------------------------------------------- generation

  const runGeneration = useCallback(async (index, forceRegenerate) => {
    // Generating before the dictionary is known would ignore the user's pronunciations.
    if (!settings.dictionaryLoaded) {
      throw new Error('Your dictionary has not loaded yet. Please wait a moment or reload the page.');
    }
    const paragraph = paragraphs[index];
    const { id } = paragraph;

    const ssmlOptions = buildSsmlOptions(settings);
    const hashKey = await getAudioHash({
      text: paragraph.text,
      voice: selectedVoice,
      language: selectedLanguage,
      ssmlOptions,
      fade: settings.useFadeTransitions
        ? [settings.fadeInDuration, settings.fadeOutDuration]
        : null,
    });

    if (!forceRegenerate) {
      const cached = await findCachedAudio(hashKey);
      if (cached) {
        patchParagraph(id, {
          audioUrl: cached.url,
          audioBlob: cached.blob,
          isGenerated: true,
          wasCached: true,
        });
        return cached.blob;
      }
    }

    // Credits are checked, charged and refunded on failure by the Edge Function.
    let audioBlob = await speechifyService.synthesize(
      paragraph.text,
      selectedVoice,
      selectedLanguage,
      ssmlOptions,
      { forceRegenerate, action: 'generation', projectId },
    );

    if (settings.useFadeTransitions) {
      try {
        audioBlob = await applyFade(audioBlob, settings.fadeInDuration / 1000, settings.fadeOutDuration / 1000);
      } catch (fadeError) {
        console.error('Applying fade failed, using the unprocessed audio:', fadeError);
      }
    }

    const audioUrl = await storeAudio(hashKey, audioBlob);
    patchParagraph(id, { audioBlob, audioUrl, isGenerated: true, wasCached: false });
    return audioBlob;
  }, [paragraphs, selectedVoice, selectedLanguage, settings, projectId, patchParagraph]);

  const generateParagraphAudio = useCallback(async (index, forceRegenerate = false) => {
    const paragraph = paragraphs[index];
    if (!paragraph || !paragraph.text.trim()) return null;

    if (paragraph.isGenerated && !forceRegenerate) {
      if (paragraph.audioBlob) return paragraph.audioBlob;
      if (paragraph.audioUrl) {
        try {
          return await fetchAudioBlob(paragraph.audioUrl);
        } catch (err) {
          console.error('Stored audio could not be loaded, regenerating:', err);
        }
      }
    }

    // A second request for the same paragraph joins the running one instead of being charged twice.
    const running = inFlightRef.current.get(paragraph.id);
    if (running) return running;

    setGeneratingIndex(index);
    setError('');
    if (forceRegenerate) patchParagraph(paragraph.id, STALE_AUDIO);

    const promise = runGeneration(index, forceRegenerate)
      .catch((err) => {
        console.error(`Error generating paragraph ${index + 1}:`, err);
        setError(`Error generating paragraph ${index + 1}: ${getErrorMessage(err)}`);
        patchParagraph(paragraph.id, STALE_AUDIO);
        return null;
      })
      .finally(() => {
        inFlightRef.current.delete(paragraph.id);
        setGeneratingIndex(-1);
      });

    inFlightRef.current.set(paragraph.id, promise);
    return promise;
  }, [paragraphs, runGeneration, patchParagraph]);

  const generatePreviewAudio = useCallback(async (text) => {
    let url = null;
    try {
      const audioBlob = await speechifyService.synthesize(
        text,
        selectedVoice,
        selectedLanguage,
        buildSsmlOptions(settings, { preview: true }),
        { action: 'preview', projectId },
      );

      url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (err) {
      if (url) URL.revokeObjectURL(url);
      console.error('Preview error:', err);
      notify.error(err, 'Preview failed');
    }
  }, [selectedVoice, selectedLanguage, settings, projectId]);

  return {
    voices,
    selectedVoice,
    selectedLanguage,
    isLoadingVoices,
    error,
    setError,
    paragraphs,
    generatedParagraphs,
    generatingIndex,
    handleVoiceChange,
    handleLanguageChange,
    handleSplitText,
    updateParagraph,
    deleteParagraph,
    addParagraphAtStart,
    generateParagraphAudio,
    generatePreviewAudio,
    resetSpeechify,
  };
};
