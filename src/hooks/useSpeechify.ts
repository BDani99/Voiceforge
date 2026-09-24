import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import speechifyService from '../services/speechifyService';
import { supabase } from '../services/supabase';
import { findCachedAudio, storeAudio, fetchAudioBlob, getAudioHash } from '../services/audioStorage';
import { applyFade } from '../utils/audioProcessing';
import { notify, getErrorMessage } from '../utils/notificationService';
import { addSegment, clearRange, rebaseSegments } from '../utils/emotionSegments';
import { addMark, clearMarksRange, rebaseMarks, type TextMark } from '../utils/textMarks';
import { parseStoredMarks, type SpeechMarks } from '../utils/speechMarks';
import type { Json } from '../types/database';
import { effectiveParagraphEmotion, emotionMode, parseParagraphSettings, serializeParagraphSettings } from '../utils/paragraphEmotion';
import { resolveModel, voicesForLanguage } from '../utils/voices';
import type { VoiceSettings } from './useVoiceSettings';
import type { Paragraph, SsmlOptions, Voice } from '../types/models';

const AUTOSAVE_DELAY_MS = 1500;

const newParagraph = (text = ''): Paragraph => ({
  id: crypto.randomUUID(),
  text: text.trim(),
  audioBlob: null,
  audioUrl: null,
  isGenerated: false,
  wasCached: false,
  emotion: '',
  segments: [],
  marks: [],
  speechMarks: null,
});

const STALE_AUDIO: Partial<Paragraph> = { audioBlob: null, audioUrl: null, isGenerated: false, wasCached: false, speechMarks: null };

const percent = (value: number): string => `${value >= 0 ? '+' : ''}${value}%`;

/**
 * Translates the UI settings into the option object understood by buildSSML. With a paragraph its own
 * emotion settings apply; a preview only uses the default emotion of all paragraphs.
 */
function buildSsmlOptions(settings: VoiceSettings, { preview = false, paragraph }: { preview?: boolean; paragraph?: Paragraph } = {}): SsmlOptions {
  const { globalDefaults: d } = settings;
  const emotion = paragraph && !preview ? effectiveParagraphEmotion(paragraph, settings.emotion) : settings.emotion || null;

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
    emotion: emotion ? { enabled: true, type: emotion } : { enabled: false },
    emotionSegments: paragraph && !preview ? paragraph.segments : [],
    marks: paragraph && !preview ? paragraph.marks : [],
    customReplacements: settings.parseCustomReplacements(settings.globalCustomReplacements),
    addSilencePadding: preview ? false : settings.useFadeTransitions,
    silenceDuration: 50,
  };
}

export const useSpeechify = (settings: VoiceSettings, projectId: string | undefined) => {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [error, setError] = useState('');
  const [paragraphs, setParagraphs] = useState<Paragraph[]>(() => [newParagraph()]);
  const [generatingIndex, setGeneratingIndex] = useState(-1);

  // Auto-save must never run before the stored paragraphs were loaded, otherwise the
  // placeholder paragraph would overwrite (and delete) the real content.
  const [isLoaded, setIsLoaded] = useState(false);
  const isLoadedRef = useRef(false);
  const isInitializedRef = useRef(false);
  const inFlightRef = useRef(new Map<string, Promise<Blob | null>>()); // paragraph id -> pending generation
  const latestParagraphsRef = useRef(paragraphs);
  const hasUnsavedChangesRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  const generatedParagraphs = useMemo(() => {
    const generated = new Set<number>();
    paragraphs.forEach((p, index) => {
      if (p.isGenerated) generated.add(index);
    });
    return generated;
  }, [paragraphs]);

  const patchParagraph = useCallback((id: string, patch: Partial<Paragraph>) => {
    setParagraphs((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  // ---------------------------------------------------------------- loading

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    isLoadedRef.current = false;
    setIsLoaded(false);

    void (async () => {
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
        // The word timings of the stored audio live next to it in the shared cache table.
        const urls = data.flatMap((p) => (p.audio_url ? [p.audio_url] : []));
        const timings = new Map<string, unknown>();
        if (urls.length > 0) {
          const { data: cached } = await supabase.from('audio_cache').select('audio_url, speech_marks').in('audio_url', urls);
          for (const row of cached ?? []) timings.set(row.audio_url, row.speech_marks);
        }
        if (cancelled) return;

        setParagraphs(data.map((p) => ({
          id: p.id,
          text: p.content,
          audioUrl: p.audio_url,
          audioBlob: null,
          isGenerated: !!p.audio_url,
          wasCached: !!p.audio_url,
          speechMarks: p.audio_url ? parseStoredMarks(timings.get(p.audio_url) as Json | undefined, p.content.length) : null,
          ...parseParagraphSettings(p.settings, p.content.length),
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
      // Start with an English voice when there is one, the list itself is not ordered by language.
      const initial = voiceList.find((v) => v.locale === 'en-US') ?? voiceList[0];
      if (initial) {
        setSelectedVoice(initial.id);
        if (initial.locale) setSelectedLanguage(initial.locale);
      }
    } catch (err) {
      setError(`Failed to load voices: ${getErrorMessage(err)}`);
    } finally {
      setIsLoadingVoices(false);
    }
  }, []);

  useEffect(() => {
    void loadVoices();
  }, [loadVoices]);

  // -------------------------------------------------------------- auto-save

  const saveParagraphs = useCallback((list: Paragraph[]) => {
    // Saves run one after another so an older snapshot can never overwrite a newer one.
    if (!projectId) return saveChainRef.current;

    saveChainRef.current = saveChainRef.current.then(async () => {
      try {
        const rows = list.map((p, index) => ({
          id: p.id,
          project_id: projectId,
          content: p.text,
          order_index: index,
          audio_url: p.audioUrl || null,
          settings: serializeParagraphSettings(p),
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
    const timeoutId = setTimeout(() => void saveParagraphs(paragraphs), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [paragraphs, projectId, isLoaded, saveParagraphs]);

  // Flush pending edits when leaving the workspace.
  useEffect(() => () => {
    if (isLoadedRef.current && hasUnsavedChangesRef.current) {
      void saveParagraphs(latestParagraphsRef.current);
    }
  }, [saveParagraphs]);

  // ---------------------------------------------------- settings invalidation

  const selectedVoiceInfo = useMemo(() => voices.find((v) => v.id === selectedVoice), [voices, selectedVoice]);
  // The model that is really used. Only the user's choice (not this derived value) invalidates audio,
  // because changing voice or language already does that explicitly.
  const model = useMemo(
    () => resolveModel(selectedVoiceInfo, selectedLanguage, settings.modelChoice),
    [selectedVoiceInfo, selectedLanguage, settings.modelChoice],
  );

  const invalidateAllAudio = useCallback(() => {
    if (!isInitializedRef.current || !isLoadedRef.current) return;

    speechifyService.clearCache();
    setParagraphs((prev) => prev.map((p) => ({ ...p, ...STALE_AUDIO })));
  }, []);

  const handleVoiceChange = useCallback((voiceId: string) => {
    setSelectedVoice(voiceId);
    const locale = voices.find((v) => v.id === voiceId)?.locale;
    if (locale) {
      // Hungarian uses English fallback voices, so do not switch the language away from it.
      setSelectedLanguage((current) => (current === 'hu-HU' ? current : locale));
    }
    invalidateAllAudio();
  }, [voices, invalidateAllAudio]);

  const handleLanguageChange = useCallback((langCode: string) => {
    setSelectedLanguage(langCode);
    const [voiceForLang] = voicesForLanguage(voices, langCode).filter((v) => v.locale === langCode);
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
    settings.modelChoice,
    settings.useFadeTransitions,
    settings.fadeInDuration,
    settings.fadeOutDuration,
    invalidateAllAudio,
  ]);

  // Dictionary changes invalidate audio too, but the first load is only the baseline:
  // audio generated earlier with the same dictionary must stay valid.
  const dictionaryBaselineRef = useRef<string | null>(null);
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
  const handleSplitText = useCallback((text: string) => {
    let parts = text.split(/\n\s*\n/).filter((p) => p.trim());
    if (parts.length <= 1) {
      const lines = text.split('\n').filter((p) => p.trim());
      if (lines.length > 1) parts = lines;
    }
    const replacement = parts.length > 0 ? parts.map(newParagraph) : [newParagraph(text)];
    setParagraphs((prev) => [...replacement, ...prev.slice(1)]);
  }, []);

  const updateParagraphText = useCallback((index: number, text: string) => {
    // Editing the text makes any stored audio stale; highlighted emotions move along with the words.
    setParagraphs((prev) => prev.map((p, i) => (
      i === index ? { ...p, text, segments: rebaseSegments(p.segments, p.text, text), marks: rebaseMarks(p.marks, p.text, text), ...STALE_AUDIO } : p
    )));
  }, []);

  const editParagraph = useCallback((index: number, edit: (paragraph: Paragraph) => Paragraph) => {
    setParagraphs((prev) => prev.map((p, i) => (i === index ? { ...edit(p), ...STALE_AUDIO } : p)));
  }, []);

  /** Emotion of the whole paragraph. Ignored while highlighted parts exist (the two exclude each other). */
  const setParagraphEmotion = useCallback((index: number, emotion: string) => {
    setParagraphs((prev) => prev.map((p, i) => (
      i === index && emotionMode(p) !== 'highlights' ? { ...p, emotion, ...STALE_AUDIO } : p
    )));
  }, []);

  /** Emotion for a highlighted part. Ignored while the paragraph has its own emotion. */
  const applyEmotionToRange = useCallback((index: number, start: number, end: number, emotion: string) => {
    setParagraphs((prev) => prev.map((p, i) => {
      if (i !== index || emotionMode(p) === 'paragraph') return p;
      return { ...p, emotion: '', segments: addSegment(p.segments, { start, end, emotion }, p.text.length), ...STALE_AUDIO };
    }));
  }, []);

  const clearEmotionRange = useCallback((index: number, start: number, end: number) => {
    editParagraph(index, (p) => ({ ...p, segments: clearRange(p.segments, start, end, p.text.length) }));
  }, [editParagraph]);

  const clearHighlights = useCallback((index: number) => {
    editParagraph(index, (p) => ({ ...p, segments: [] }));
  }, [editParagraph]);

  /** Adds emphasis, a pronunciation or a pause. They combine with emotions, so nothing is refused here. */
  const applyMark = useCallback((index: number, mark: TextMark) => {
    editParagraph(index, (p) => ({ ...p, marks: addMark(p.marks, mark, p.text.length) }));
  }, [editParagraph]);

  const clearMarks = useCallback((index: number, start: number, end: number) => {
    editParagraph(index, (p) => ({ ...p, marks: clearMarksRange(p.marks, start, end, p.text.length) }));
  }, [editParagraph]);

  const clearAllMarks = useCallback((index: number) => {
    editParagraph(index, (p) => ({ ...p, marks: [] }));
  }, [editParagraph]);

  const deleteParagraph = useCallback((index: number) => {
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

  /** Timings of audio that was generated a moment ago, before the state has caught up. */
  const marksByIdRef = useRef(new Map<string, SpeechMarks | null>());

  const getSpeechMarks = useCallback(
    (id: string): SpeechMarks | null => paragraphs.find((p) => p.id === id)?.speechMarks ?? marksByIdRef.current.get(id) ?? null,
    [paragraphs],
  );

  const runGeneration = useCallback(async (index: number, forceRegenerate: boolean): Promise<Blob> => {
    // Generating before the dictionary is known would ignore the user's pronunciations.
    if (!settings.dictionaryLoaded) {
      throw new Error('Your dictionary has not loaded yet. Please wait a moment or reload the page.');
    }
    const paragraph = paragraphs[index];
    if (!paragraph) throw new Error('Paragraph not found');
    const { id } = paragraph;

    const ssmlOptions = buildSsmlOptions(settings, { paragraph });
    const hashKey = await getAudioHash({
      text: paragraph.text,
      voice: selectedVoice,
      language: selectedLanguage,
      model,
      ssmlOptions,
      fade: settings.useFadeTransitions
        ? [settings.fadeInDuration, settings.fadeOutDuration]
        : null,
    });

    if (!forceRegenerate) {
      const cached = await findCachedAudio(hashKey, paragraph.text.length);
      if (cached) {
        patchParagraph(id, {
          audioUrl: cached.url,
          audioBlob: cached.blob,
          isGenerated: true,
          wasCached: true,
          speechMarks: cached.marks,
        });
        marksByIdRef.current.set(id, cached.marks);
        return cached.blob;
      }
    }

    // Credits are checked, charged and refunded on failure by the Edge Function.
    const synthesis = await speechifyService.synthesizeDetailed(
      paragraph.text,
      selectedVoice,
      selectedLanguage,
      ssmlOptions,
      { forceRegenerate, action: 'generation', projectId, model },
    );
    let audioBlob = synthesis.blob;
    const speechMarks = synthesis.marks;

    if (settings.useFadeTransitions) {
      try {
        audioBlob = await applyFade(audioBlob, settings.fadeInDuration / 1000, settings.fadeOutDuration / 1000);
      } catch (fadeError) {
        console.error('Applying fade failed, using the unprocessed audio:', fadeError);
      }
    }

    marksByIdRef.current.set(id, speechMarks);
    const audioUrl = await storeAudio(hashKey, audioBlob, speechMarks);
    patchParagraph(id, { audioBlob, audioUrl, isGenerated: true, wasCached: false, speechMarks });
    return audioBlob;
  }, [paragraphs, selectedVoice, selectedLanguage, model, settings, projectId, patchParagraph]);

  const generateParagraphAudio = useCallback(async (index: number, forceRegenerate = false): Promise<Blob | null> => {
    const paragraph = paragraphs[index];
    if (!paragraph?.text.trim()) return null;

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

  const generatePreviewAudio = useCallback(async (text: string) => {
    let url: string | null = null;
    try {
      const audioBlob = await speechifyService.synthesize(
        text,
        selectedVoice,
        selectedLanguage,
        buildSsmlOptions(settings, { preview: true }),
        { action: 'preview', projectId, model },
      );

      const objectUrl = URL.createObjectURL(audioBlob);
      url = objectUrl;
      const audio = new Audio(objectUrl);
      audio.onended = () => URL.revokeObjectURL(objectUrl);
      await audio.play();
    } catch (err) {
      if (url) URL.revokeObjectURL(url);
      console.error('Preview error:', err);
      notify.error(err, 'Preview failed');
    }
  }, [selectedVoice, selectedLanguage, model, settings, projectId]);

  return {
    voices,
    selectedVoice,
    selectedVoiceInfo,
    selectedLanguage,
    model,
    isLoaded,
    isLoadingVoices,
    error,
    setError,
    paragraphs,
    generatedParagraphs,
    generatingIndex,
    handleVoiceChange,
    handleLanguageChange,
    handleSplitText,
    updateParagraphText,
    setParagraphEmotion,
    applyEmotionToRange,
    clearEmotionRange,
    clearHighlights,
    applyMark,
    clearMarks,
    clearAllMarks,
    deleteParagraph,
    addParagraphAtStart,
    generateParagraphAudio,
    generatePreviewAudio,
    getSpeechMarks,
    resetSpeechify,
  };
};
export type SpeechifyApi = ReturnType<typeof useSpeechify>;
