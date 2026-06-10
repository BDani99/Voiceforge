import { useState, useEffect, useCallback, useRef } from 'react';
import speechifyService from '../services/speechifyService';
import audioCrossfader from '../utils/audioCrossfader';
import { supabase } from '../services/supabase';
import { notify } from '../utils/notificationService';

export const useSpeechify = (settings, projectId) => {
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [error, setError] = useState('');

  const [paragraphs, setParagraphs] = useState([{ id: crypto.randomUUID(), text: '', audioBlob: null, isGenerated: false }]);

  useEffect(() => {
    if (!projectId) return;
    const fetchParagraphs = async () => {
      try {
        const { data, error } = await supabase
          .from('paragraphs')
          .select('*')
          .eq('project_id', projectId)
          .order('order_index', { ascending: true });
        
        if (error) throw error;
        if (data && data.length > 0) {
          setParagraphs(data.map(p => ({
            id: p.id,
            text: p.content,
            audioUrl: p.audio_url,
            audioBlob: null,
            isGenerated: !!p.audio_url,
            wasCached: !!p.audio_url
          })));
          
          const generated = new Set();
          data.forEach((p, index) => {
            if (p.audio_url) generated.add(index);
          });
          setGeneratedParagraphs(generated);
          paragraphsLoadedRef.current = true; // mark paragraphs as loaded
        }
      } catch (err) {
        console.error('Error fetching paragraphs:', err);
      }
    };
    fetchParagraphs();
  }, [projectId]);
  const [generatedParagraphs, setGeneratedParagraphs] = useState(new Set());
  const [generatingIndex, setGeneratingIndex] = useState(-1);

  const isInitializedRef = useRef(false);
  const paragraphsLoadedRef = useRef(false); // tracks if paragraphs were loaded from Supabase

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
      setError('Failed to load voices: ' + err.message);
    } finally {
      setIsLoadingVoices(false);
    }
  }, []);

  useEffect(() => {
    loadVoices();
  }, [loadVoices]);

  const invalidateAllAudio = useCallback(() => {
    // Don't invalidate if paragraphs haven't been loaded yet (prevents race condition with voice loading)
    if (!isInitializedRef.current || !paragraphsLoadedRef.current) {
      return;
    }

    console.log('🔄 Invalidating all generated audio due to settings change');

    speechifyService.clearCache();

    setParagraphs(prev => prev.map(p => ({
      ...p,
      isGenerated: false,
      audioBlob: null
    })));
    setGeneratedParagraphs(new Set());
  }, []);

  const handleVoiceChange = useCallback((voiceId) => {
    console.log('🎤 Voice changed to (user):', voiceId);
    setSelectedVoice(voiceId);
    const voice = voices.find(v => v.id === voiceId);
    if (voice?.locale) {
      setSelectedLanguage(currentLang => {
        // Prevent auto-switching language if we are currently on Hungarian (which uses fallback English voices)
        if (currentLang === 'hu-HU') return currentLang;
        return voice.locale;
      });
    }
    // Explicitly invalidate audio on user-triggered voice change
    // (loadVoices sets selectedVoice directly, so it bypasses this and won't invalidate)
    if (paragraphsLoadedRef.current) {
      invalidateAllAudio();
    }
  }, [voices, invalidateAllAudio]);

  const handleLanguageChange = useCallback((langCode) => {
    console.log('🌍 Language changed to (user):', langCode);
    setSelectedLanguage(langCode);
    const voiceForLang = voices.find(v => v.locale === langCode);
    if (voiceForLang) {
      setSelectedVoice(voiceForLang.id);
    }
    // Explicitly invalidate audio on user-triggered language change
    if (paragraphsLoadedRef.current) {
      invalidateAllAudio();
    }
  }, [voices, invalidateAllAudio]);

  // Sync paragraphs to Supabase (Auto-save)
  useEffect(() => {
    if (!projectId || !paragraphs || paragraphs.length === 0) return;
    const timeoutId = setTimeout(async () => {
      try {
        const dataToSave = paragraphs.map((p, index) => ({
          id: p.id || crypto.randomUUID(),
          project_id: projectId,
          content: p.text,
          order_index: index,
          audio_url: p.audioUrl || null,
          settings: {}
        }));
        
        const { error } = await supabase.from('paragraphs').upsert(dataToSave);
        if (error) throw error;
        
        const currentIds = dataToSave.map(p => p.id);
        if (currentIds.length > 0) {
          await supabase
            .from('paragraphs')
            .delete()
            .eq('project_id', projectId)
            .not('id', 'in', `(${currentIds.join(',')})`);
        }
      } catch (err) {
        console.error('Failed to auto-save to Supabase:', err);
      }
    }, 1500);
    return () => clearTimeout(timeoutId);
  }, [paragraphs, projectId]);

  // Invalidate audio when non-voice settings change (voice/language handled explicitly in their handlers)
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      return;
    }

    invalidateAllAudio();
  }, [
    // NOTE: selectedVoice and selectedLanguage are intentionally EXCLUDED here.
    // They are handled explicitly in handleVoiceChange / handleLanguageChange
    // to avoid wiping isGenerated when loadVoices() sets the initial voice.
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
    settings.globalCustomReplacements,
    invalidateAllAudio
  ]);

  const createParagraph = useCallback((text) => ({
    id: crypto.randomUUID(),
    text: text.trim(),
    audioBlob: null,
    audioUrl: null,
    isGenerated: false
  }), []);

  const splitTextIntoParagraphs = useCallback((text) => {
    if (!text.trim()) return [createParagraph('')];

    const rawParagraphs = text.split(/\n\s*\n/).filter(p => p.trim());

    if (rawParagraphs.length === 1) {
      const singleLineSplit = text.split('\n').filter(p => p.trim());
      if (singleLineSplit.length > 1) {
        return singleLineSplit.map(p => createParagraph(p));
      }
    }

    return rawParagraphs.length > 0
      ? rawParagraphs.map(p => createParagraph(p))
      : [createParagraph(text)];
  }, [createParagraph]);

  const handleSplitText = useCallback((text) => {
    const newParagraphs = splitTextIntoParagraphs(text);
    setParagraphs(newParagraphs);
    setGeneratedParagraphs(new Set());
  }, [splitTextIntoParagraphs]);

  const updateParagraph = useCallback((index, field, value) => {
    setParagraphs(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'text') {
        updated[index].isGenerated = false;
        updated[index].audioBlob = null;
        setGeneratedParagraphs(prevSet => {
          const newSet = new Set(prevSet);
          newSet.delete(index);
          return newSet;
        });
      }
      return updated;
    });
  }, []);

  const generateParagraphAudio = useCallback(async (index, forceRegenerate = false) => {
    const paragraph = paragraphs[index];
    if (!paragraph || !paragraph.text.trim()) return null;

    if (paragraph.isGenerated && !forceRegenerate && (paragraph.audioBlob || paragraph.audioUrl)) {
      console.log(`✅ Paragraph ${index + 1} already generated (blob or url exists), skipping`);
      return paragraph.audioBlob;
    }

    console.log(`🎵 Generating audio for paragraph ${index + 1}${forceRegenerate ? ' (forced)' : ''}`);
    setGeneratingIndex(index);
    setError('');

    try {
      if (forceRegenerate) {
        setParagraphs(prev => {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            audioBlob: null,
            isGenerated: false
          };
          return updated;
        });
        setGeneratedParagraphs(prev => {
          const newSet = new Set(prev);
          newSet.delete(index);
          return newSet;
        });
      }

      let effectivePitch, effectiveRate, effectiveVolume;

      if (settings.globalDefaults.usePitchCustom) {
        effectivePitch = `${settings.globalDefaults.pitchCustom >= 0 ? '+' : ''}${settings.globalDefaults.pitchCustom}%`;
      } else {
        effectivePitch = settings.globalDefaults.pitch;
      }

      if (settings.globalDefaults.useRateCustom) {
        effectiveRate = `${settings.globalDefaults.rateCustom >= 0 ? '+' : ''}${settings.globalDefaults.rateCustom}%`;
      } else {
        effectiveRate = settings.globalDefaults.rate;
      }

      if (settings.globalDefaults.useVolumeCustom) {
        effectiveVolume = `${settings.globalDefaults.volumeCustom >= 0 ? '+' : ''}${settings.globalDefaults.volumeCustom}%`;
      } else {
        effectiveVolume = settings.globalDefaults.volume;
      }

      const ssmlOptions = {
        prosody: {
          pitch: effectivePitch,
          rate: effectiveRate,
          volume: effectiveVolume,
        },
        breaks: {
          enabled: settings.pauseStrength !== 'none' || settings.usePauseCustom,
          pauseType: settings.usePauseCustom ? 'time' : 'strength',
          pauseStrength: settings.pauseStrength,
          pauseTime: settings.pauseCustomTime,
        },
        emphasis: settings.globalEmphasis ? {
          enabled: true,
          level: settings.globalEmphasis,
        } : { enabled: false },
        emotion: settings.emotion ? {
          enabled: true,
          type: settings.emotion,
        } : { enabled: false },
        customReplacements: settings.parseCustomReplacements(settings.globalCustomReplacements),
        addSilencePadding: settings.useFadeTransitions,
        silenceDuration: 50 // ms of silence at start and end
      };

      console.log('🎛️ SSML Options:', ssmlOptions);

      // --- CACHE & RPC LOGIC ---
      const hashInput = JSON.stringify({
        text: paragraph.text,
        voice: selectedVoice,
        language: selectedLanguage,
        ssmlOptions
      });
      const { generateHash } = await import('../utils/hash');
      const hashKey = await generateHash(hashInput);

      if (!forceRegenerate) {
        const { data: cacheData } = await supabase
          .from('audio_cache')
          .select('audio_url')
          .eq('hash_key', hashKey)
          .maybeSingle();

        if (cacheData && cacheData.audio_url) {
          console.log('💾 Found in Smart Cache! No credits deducted.');
          try {
            const response = await fetch(cacheData.audio_url);
            const blob = await response.blob();
            setParagraphs(prev => {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                audioUrl: cacheData.audio_url,
                audioBlob: blob,
                isGenerated: true,
                wasCached: true
              };
              return updated;
            });
            setGeneratedParagraphs(prev => new Set([...prev, index]));
            setGeneratingIndex(-1);
            return blob;
          } catch(e) {
            console.error('Failed to fetch cached audio blob', e);
          }
        }
      }

      // Deduct characters BEFORE generation
      const charCount = paragraph.text.length;
      try {
        const { error: rpcError } = await supabase.rpc('deduct_characters', {
          char_count: charCount,
          action: 'generation',
          p_language: selectedLanguage,
          p_project_id: projectId
        });
        if (rpcError) throw rpcError;
      } catch (e) {
        throw new Error('Not enough credits: ' + e.message);
      }

      let audioBlob;

      // Smart Chunking logic
      if (!speechifyService.isWithinLimit(paragraph.text)) {
        console.log(`⚠️ Paragraph ${index + 1} exceeds length limit. Applying smart chunking...`);
        // Split by sentence boundaries (.!?) keeping the punctuation
        const sentences = paragraph.text.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [paragraph.text];
        const chunks = [];
        let currentChunk = '';

        for (const sentence of sentences) {
          if ((currentChunk + sentence).length <= 2000) {
            currentChunk += sentence;
          } else {
            if (currentChunk) chunks.push(currentChunk.trim());
            
            // If a single sentence is > 2000 chars, force split it blindly
            if (sentence.length > 2000) {
                let s = sentence;
                while (s.length > 2000) {
                    chunks.push(s.substring(0, 2000));
                    s = s.substring(2000);
                }
                currentChunk = s;
            } else {
                currentChunk = sentence;
            }
          }
        }
        if (currentChunk) chunks.push(currentChunk.trim());

        console.log(`✂️ Split into ${chunks.length} chunks. Queueing requests...`);

        const blobPromises = chunks.map(chunk => 
          speechifyService.generateSpeech(chunk, selectedVoice, selectedLanguage, ssmlOptions, forceRegenerate)
        );

        // Wait for all chunks to be generated (throttleRequest handles concurrency)
        const chunkBlobs = await Promise.all(blobPromises);

        // Concatenate them seamlessly using AudioContext
        console.log(`🔗 Concatenating ${chunkBlobs.length} blobs for paragraph ${index + 1}...`);
        audioBlob = await speechifyService.concatenateAudioBlobs(chunkBlobs, 0);
      } else {
        audioBlob = await speechifyService.generateSpeech(
          paragraph.text,
          selectedVoice,
          selectedLanguage,
          ssmlOptions,
          forceRegenerate
        );
      }

      // Apply fade-in and fade-out if enabled
      if (settings.useFadeTransitions) {
        console.log('🎨 Applying fade transitions to audio');
        audioBlob = await audioCrossfader.createFadedAudio(
          audioBlob,
          settings.fadeInDuration / 1000,
          settings.fadeOutDuration / 1000
        );
      }

      // Upload to Storage
      let finalAudioUrl = null;
      try {
        const { error: uploadError } = await supabase.storage
          .from('voiceovers')
          .upload(`${hashKey}.wav`, audioBlob, { upsert: true });

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('voiceovers')
            .getPublicUrl(`${hashKey}.wav`);
          finalAudioUrl = urlData.publicUrl;

          // Save to cache table
          await supabase.from('audio_cache').upsert({
            hash_key: hashKey,
            audio_url: finalAudioUrl
          });
        }
      } catch(e) {
        console.error('Failed to upload to storage', e);
      }

      setParagraphs(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          audioBlob,
          audioUrl: finalAudioUrl,
          isGenerated: true,
          wasCached: false
        };
        return updated;
      });

      setGeneratedParagraphs(prev => new Set([...prev, index]));
      console.log(`✅ Successfully generated audio for paragraph ${index + 1}`);
      return audioBlob;

    } catch (err) {
      console.error(`❌ Error generating paragraph ${index + 1}:`, err);
      setError(`Error generating paragraph ${index + 1}: ${err.message}`);

      setParagraphs(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          audioBlob: null,
          isGenerated: false
        };
        return updated;
      });

      return null;
    } finally {
      setGeneratingIndex(-1);
    }
  }, [paragraphs, selectedVoice, selectedLanguage, settings]);

  const deleteParagraph = useCallback((index) => {
    setParagraphs(prev => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.length > 0 ? updated : [createParagraph('')];
    });
    setGeneratedParagraphs(prev => {
      const newSet = new Set();
      prev.forEach(i => {
        if (i < index) newSet.add(i);
        else if (i > index) newSet.add(i - 1);
      });
      return newSet;
    });
  }, [createParagraph]);

  const addParagraphAtStart = useCallback(() => {
    setParagraphs(prev => [createParagraph(''), ...prev]);
    setGeneratedParagraphs(prev => {
      const newSet = new Set();
      prev.forEach(i => newSet.add(i + 1));
      return newSet;
    });
  }, [createParagraph]);

  const resetSpeechify = useCallback(() => {
    setParagraphs([createParagraph('')]);
    setGeneratedParagraphs(new Set());
    setError('');
    isInitializedRef.current = false;
  }, [createParagraph]);

  const generatePreviewAudio = useCallback(async (text) => {
    try {
      // Deduct characters for preview length
      const charCount = text.length;
      const { error: rpcError } = await supabase.rpc('deduct_characters', {
        char_count: charCount,
        action: 'preview',
        p_language: selectedLanguage,
        p_project_id: projectId
      });
      if (rpcError) throw rpcError;

      const ssmlOptions = {
        prosody: {
          pitch: settings.globalDefaults.usePitchCustom ? `${settings.globalDefaults.pitchCustom >= 0 ? '+' : ''}${settings.globalDefaults.pitchCustom}%` : settings.globalDefaults.pitch,
          rate: settings.globalDefaults.useRateCustom ? `${settings.globalDefaults.rateCustom >= 0 ? '+' : ''}${settings.globalDefaults.rateCustom}%` : settings.globalDefaults.rate,
          volume: settings.globalDefaults.useVolumeCustom ? `${settings.globalDefaults.volumeCustom >= 0 ? '+' : ''}${settings.globalDefaults.volumeCustom}%` : settings.globalDefaults.volume,
        },
        breaks: { enabled: false },
        emphasis: settings.globalEmphasis ? { enabled: true, level: settings.globalEmphasis } : { enabled: false },
        emotion: settings.emotion ? { enabled: true, type: settings.emotion } : { enabled: false },
        customReplacements: settings.parseCustomReplacements(settings.globalCustomReplacements),
        addSilencePadding: false
      };

      const audioBlob = await speechifyService.generateSpeech(
        text,
        selectedVoice,
        selectedLanguage,
        ssmlOptions,
        true
      );
      
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (err) {
      console.error('Preview error:', err);
      notify.error(err, 'Preview failed');
    }
  }, [selectedVoice, selectedLanguage, settings]);

  return {
    voices,
    selectedVoice,
    selectedLanguage,
    isLoadingVoices,
    error,
    setError,
    paragraphs,
    setParagraphs, // exposed for export or advanced manipulation
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
    createParagraph
  };
};
