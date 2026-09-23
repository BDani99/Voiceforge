import { useState, useCallback, useEffect, useRef } from 'react';
import { concatenateAudio } from '../utils/audioProcessing';
import { fetchAudioBlob } from '../services/audioStorage';

export const useAudioPlayer = (speechify, settings, setIsLoading, showConfirm) => {
  const { 
    paragraphs, 
    generateParagraphAudio, 
    setError 
  } = speechify;

  const {
    useParagraphGap,
    paragraphGapPause,
    useFadeTransitions
  } = settings;

  const [activeIndex, setActiveIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGlobalMode, setIsGlobalMode] = useState(false);

  const audioQueueRef = useRef([]);
  const currentAudioRef = useRef(null);
  const isStoppingRef = useRef(false);
  const paragraphGapTimeoutRef = useRef(null);

  // Playback callbacks chain themselves from audio events, so they must always see the
  // latest paragraphs and functions instead of the render they were created in.
  const latest = useRef({});
  useEffect(() => {
    latest.current = { paragraphs, generateParagraphAudio, setError, useParagraphGap, paragraphGapPause };
  });

  const getGlobalAudio = useCallback(() => currentAudioRef.current, []);

  const playNextInQueue = useCallback(async (startIndex = null) => {
    if (isStoppingRef.current) return;
    
    let nextIndex;
    if (startIndex !== null) {
      nextIndex = startIndex;
    } else {
      if (audioQueueRef.current.length === 0) {
        setIsPlaying(false);
        return;
      }
      nextIndex = audioQueueRef.current.shift();
    }

    setActiveIndex(nextIndex);
    setIsPlaying(true);

    let audioBlob = latest.current.paragraphs[nextIndex]?.audioBlob;
    const paragraph = latest.current.paragraphs[nextIndex];

    // If already generated but blob not in memory, fetch it from the stored URL directly
    if (!audioBlob && paragraph?.isGenerated && paragraph?.audioUrl) {
      try {
        audioBlob = await fetchAudioBlob(paragraph.audioUrl);
      } catch (e) {
        console.error('Failed to fetch audio from URL, regenerating...', e);
        audioBlob = await latest.current.generateParagraphAudio(nextIndex, false);
      }
    } else if (!audioBlob) {
      audioBlob = await latest.current.generateParagraphAudio(nextIndex, false);
    }

    if (audioBlob && !isStoppingRef.current) {
      try {
        // Fades are already baked into the stored audio at generation time.
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        audio._blobUrl = url;

        currentAudioRef.current = audio;

        audio.onended = () => {
          if (audio._blobUrl) URL.revokeObjectURL(audio._blobUrl);
          if (!isStoppingRef.current) {
            if (audioQueueRef.current.length > 0) {
              if (latest.current.useParagraphGap && latest.current.paragraphGapPause > 0) {
                paragraphGapTimeoutRef.current = setTimeout(() => {
                  playNextInQueue();
                }, latest.current.paragraphGapPause);
              } else {
                playNextInQueue();
              }
            } else {
              setIsPlaying(false);
            }
          }
        };

        audio.onerror = () => {
          if (audio._blobUrl) URL.revokeObjectURL(audio._blobUrl);
          latest.current.setError(`Error playing paragraph ${nextIndex + 1}`);
          if (!isStoppingRef.current) playNextInQueue();
        };

        // Pre-generate next (only if truly not generated and not in storage)
        if (audioQueueRef.current.length > 0 && !isStoppingRef.current) {
          const upcomingIndex = audioQueueRef.current[0];
          const upcomingParagraph = latest.current.paragraphs[upcomingIndex];
          const needsPreGen = !upcomingParagraph?.isGenerated && !upcomingParagraph?.audioUrl;
          if (needsPreGen) {
            latest.current.generateParagraphAudio(upcomingIndex, false);
          }
        }

        await audio.play();
      } catch (err) {
        latest.current.setError(`Failed to play audio: ${err.message}`);
        if (currentAudioRef.current && currentAudioRef.current._blobUrl) {
          URL.revokeObjectURL(currentAudioRef.current._blobUrl);
        }
        if (!isStoppingRef.current) playNextInQueue();
      }
    } else if (!isStoppingRef.current) {
      playNextInQueue();
    }
  }, []);

  const handlePlayParagraph = useCallback(async (index) => {
    if (activeIndex === index) {
      if (isPlaying) {
        // Pause current
        if (currentAudioRef.current) currentAudioRef.current.pause();
        setIsPlaying(false);
        isStoppingRef.current = true;
      } else {
        // Resume current
        isStoppingRef.current = false;
        if (currentAudioRef.current) {
          await currentAudioRef.current.play();
          setIsPlaying(true);
        } else {
          // Play fresh
          setIsGlobalMode(false);
          audioQueueRef.current = [];
          playNextInQueue(index);
        }
      }
    } else {
      // Play a different paragraph locally
      isStoppingRef.current = false;
      if (currentAudioRef.current) currentAudioRef.current.pause();
      if (paragraphGapTimeoutRef.current) clearTimeout(paragraphGapTimeoutRef.current);
      setIsGlobalMode(false);
      audioQueueRef.current = [];
      playNextInQueue(index);
    }
  }, [activeIndex, isPlaying, playNextInQueue]);

  const handlePlayAll = useCallback(() => {
    if (isGlobalMode && isPlaying) {
      // Pause Play All
      if (currentAudioRef.current) currentAudioRef.current.pause();
      setIsPlaying(false);
      isStoppingRef.current = true;
    } else if (isGlobalMode && !isPlaying && activeIndex !== -1) {
      // Resume Play All
      isStoppingRef.current = false;
      if (currentAudioRef.current) {
        currentAudioRef.current.play();
        setIsPlaying(true);
      } else {
        playNextInQueue(activeIndex);
      }
    } else {
      // Start Play All from beginning
      isStoppingRef.current = false;
      if (currentAudioRef.current) currentAudioRef.current.pause();
      if (paragraphGapTimeoutRef.current) clearTimeout(paragraphGapTimeoutRef.current);

      const validParagraphs = paragraphs
        .map((p, i) => p.text.trim() ? i : null)
        .filter(i => i !== null);

      if (validParagraphs.length === 0) {
        setError('No paragraphs to play!');
        return;
      }

      setIsGlobalMode(true);
      audioQueueRef.current = validParagraphs.slice(1);
      playNextInQueue(validParagraphs[0]);
    }
  }, [isGlobalMode, isPlaying, activeIndex, paragraphs, playNextInQueue, setError]);

  const skipToParagraph = useCallback((index) => {
    const validParagraphs = paragraphs
      .map((p, i) => p.text.trim() ? i : null)
      .filter(i => i !== null);

    if (validParagraphs.length === 0) return;
    
    const newQueue = validParagraphs.filter(i => i >= index);
    if (newQueue.length === 0) return;

    isStoppingRef.current = false;
    if (currentAudioRef.current) currentAudioRef.current.pause();
    if (paragraphGapTimeoutRef.current) clearTimeout(paragraphGapTimeoutRef.current);
    
    setIsGlobalMode(true);
    audioQueueRef.current = newQueue.slice(1);
    playNextInQueue(newQueue[0]);
  }, [paragraphs, playNextInQueue]);

  const handleExportAll = useCallback(async () => {
    if (paragraphs.length === 0) {
      setError('No paragraphs to export!');
      return;
    }

    const validParagraphs = paragraphs.filter(p => p.text.trim());
    const totalChars = validParagraphs.reduce((sum, p) => sum + p.text.length, 0);
    const generatedCount = validParagraphs.filter(p => p.isGenerated).length;
    const toGenerateCount = validParagraphs.length - generatedCount;

    const confirmed = await showConfirm({
      title: 'Export Audio',
      details: [
        { icon: '📝', text: `Total characters: ${totalChars.toLocaleString()}` },
        { icon: '✅', text: `Already generated: ${generatedCount} paragraph${generatedCount !== 1 ? 's' : ''}` },
        { icon: '🔄', text: `Need to generate: ${toGenerateCount} paragraph${toGenerateCount !== 1 ? 's' : ''}` },
        { icon: '🎨', text: `Fade transitions: ${useFadeTransitions ? 'Enabled' : 'Disabled'}` },
      ],
      message: 'Do you want to proceed with the export?',
      confirmLabel: 'Export',
      cancelLabel: 'Cancel',
    });

    if (!confirmed) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const audioBlobs = [];

      for (let i = 0; i < paragraphs.length; i++) {
        if (!paragraphs[i].text.trim()) continue;

        let audioBlob = paragraphs[i].audioBlob;
        const p = paragraphs[i];

        // If generated and stored but blob not in memory, fetch directly from URL
        if (!audioBlob && p.isGenerated && p.audioUrl) {
          try {
            audioBlob = await fetchAudioBlob(p.audioUrl);
          } catch (e) {
            console.error('Failed to fetch from URL, regenerating...', e);
            audioBlob = await generateParagraphAudio(i, false);
          }
        } else if (!audioBlob) {
          audioBlob = await generateParagraphAudio(i, false);
        }

        if (audioBlob) {
          audioBlobs.push(audioBlob);
        }
      }

      if (audioBlobs.length === 0) {
        throw new Error('No audio generated');
      }

      const finalBlob = await concatenateAudio(
        audioBlobs,
        useParagraphGap ? paragraphGapPause : 0
      );

      const extension = finalBlob.type === 'audio/wav' ? 'wav' : 'mp3';
      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `voiceforge-${Date.now()}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (err) {
      setError('Export failed: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [paragraphs, generateParagraphAudio, setError, setIsLoading, showConfirm, useFadeTransitions, useParagraphGap, paragraphGapPause]);

  const resetAudioPlayer = useCallback(() => {
    isStoppingRef.current = true;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      if (currentAudioRef.current._blobUrl) {
        URL.revokeObjectURL(currentAudioRef.current._blobUrl);
      }
      currentAudioRef.current = null;
    }
    if (paragraphGapTimeoutRef.current) clearTimeout(paragraphGapTimeoutRef.current);
    audioQueueRef.current = [];
    setActiveIndex(-1);
    setIsPlaying(false);
    setIsGlobalMode(false);
  }, []);

  return {
    isPlayingAll: isGlobalMode && isPlaying,
    currentPlayingIndex: activeIndex,
    isPlaying,
    handlePlayParagraph,
    handlePlayAll,
    skipToParagraph,
    handleExportAll,
    resetAudioPlayer,
    getGlobalAudio
  };
};
