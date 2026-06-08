import { useState, useCallback, useRef } from 'react';
import audioCrossfader from '../utils/audioCrossfader';
import speechifyService from '../services/speechifyService';

export const useAudioPlayer = (speechify, settings, setIsLoading) => {
  const { 
    paragraphs, 
    generateParagraphAudio, 
    setError 
  } = speechify;

  const {
    useParagraphGap,
    paragraphGapPause,
    useFadeTransitions,
    fadeInDuration,
    fadeOutDuration
  } = settings;

  const [activeIndex, setActiveIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGlobalMode, setIsGlobalMode] = useState(false);

  const audioQueueRef = useRef([]);
  const currentAudioRef = useRef(null);
  const isStoppingRef = useRef(false);
  const paragraphGapTimeoutRef = useRef(null);

  const [bgmVolume, setBgmVolume] = useState(0.2);
  const [bgmFileName, setBgmFileName] = useState('');
  const bgmAudioRef = useRef(null);

  const handleBgmUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      if (bgmAudioRef.current) {
        bgmAudioRef.current.pause();
        URL.revokeObjectURL(bgmAudioRef.current.src);
      }
      setBgmFileName(file.name);
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      audio.loop = true;
      audio.volume = bgmVolume;
      bgmAudioRef.current = audio;
    }
  }, [bgmVolume]);

  const handleBgmVolumeChange = useCallback((e) => {
    const newVol = parseFloat(e.target.value);
    setBgmVolume(newVol);
    if (bgmAudioRef.current) {
      bgmAudioRef.current.volume = newVol;
    }
  }, []);

  const getGlobalAudio = useCallback(() => currentAudioRef.current, []);

  const playNextInQueue = useCallback(async (startIndex = null) => {
    if (isStoppingRef.current) return;
    
    let nextIndex;
    if (startIndex !== null) {
      nextIndex = startIndex;
    } else {
      if (audioQueueRef.current.length === 0) {
        setIsPlaying(false);
        if (bgmAudioRef.current && isGlobalMode) {
          bgmAudioRef.current.pause();
        }
        return;
      }
      nextIndex = audioQueueRef.current.shift();
    }

    setActiveIndex(nextIndex);
    setIsPlaying(true);

    let audioBlob = paragraphs[nextIndex]?.audioBlob;
    const paragraph = paragraphs[nextIndex];

    // If already generated but blob not in memory, fetch it from the stored URL directly
    if (!audioBlob && paragraph?.isGenerated && paragraph?.audioUrl) {
      console.log(`📥 Fetching cached audio blob from URL for paragraph ${nextIndex + 1}`);
      try {
        const response = await fetch(paragraph.audioUrl);
        audioBlob = await response.blob();
      } catch (e) {
        console.error('Failed to fetch audio from URL, regenerating...', e);
        audioBlob = await generateParagraphAudio(nextIndex, false);
      }
    } else if (!audioBlob) {
      console.log(`🔄 Generating paragraph ${nextIndex + 1} for playback`);
      audioBlob = await generateParagraphAudio(nextIndex, false);
    }

    if (audioBlob && !isStoppingRef.current) {
      try {
        let audio;
        if (useFadeTransitions) {
          audio = await audioCrossfader.playWithFade(
            audioBlob,
            fadeInDuration / 1000,
            fadeOutDuration / 1000
          );
        } else {
          const url = URL.createObjectURL(audioBlob);
          audio = new Audio(url);
          audio._blobUrl = url;
        }

        currentAudioRef.current = audio;

        audio.onended = () => {
          if (audio._blobUrl) URL.revokeObjectURL(audio._blobUrl);
          if (!isStoppingRef.current) {
            if (audioQueueRef.current.length > 0) {
              if (useParagraphGap && paragraphGapPause > 0) {
                paragraphGapTimeoutRef.current = setTimeout(() => {
                  playNextInQueue();
                }, paragraphGapPause);
              } else {
                playNextInQueue();
              }
            } else {
              setIsPlaying(false);
              if (bgmAudioRef.current && isGlobalMode) {
                bgmAudioRef.current.pause();
              }
            }
          }
        };

        audio.onerror = () => {
          if (audio._blobUrl) URL.revokeObjectURL(audio._blobUrl);
          setError(`Error playing paragraph ${nextIndex + 1}`);
          if (!isStoppingRef.current) playNextInQueue();
        };

        // Pre-generate next (only if truly not generated and not in storage)
        if (audioQueueRef.current.length > 0 && !isStoppingRef.current) {
          const upcomingIndex = audioQueueRef.current[0];
          const upcomingParagraph = paragraphs[upcomingIndex];
          const needsPreGen = !upcomingParagraph?.isGenerated && !upcomingParagraph?.audioUrl;
          if (needsPreGen) {
            generateParagraphAudio(upcomingIndex, false);
          }
        }

        await audio.play();
      } catch (err) {
        setError(`Failed to play audio: ${err.message}`);
        if (currentAudioRef.current && currentAudioRef.current._blobUrl) {
          URL.revokeObjectURL(currentAudioRef.current._blobUrl);
        }
        if (!isStoppingRef.current) playNextInQueue();
      }
    } else if (!isStoppingRef.current) {
      playNextInQueue();
    }
  }, [paragraphs, generateParagraphAudio, setError, useParagraphGap, paragraphGapPause, useFadeTransitions, fadeInDuration, fadeOutDuration, isGlobalMode]);

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
      if (bgmAudioRef.current) bgmAudioRef.current.pause(); // stop BGM on local play
      
      setIsGlobalMode(false);
      audioQueueRef.current = [];
      playNextInQueue(index);
    }
  }, [activeIndex, isPlaying, playNextInQueue]);

  const handlePlayAll = useCallback(() => {
    if (isGlobalMode && isPlaying) {
      // Pause Play All
      if (currentAudioRef.current) currentAudioRef.current.pause();
      if (bgmAudioRef.current) bgmAudioRef.current.pause();
      setIsPlaying(false);
      isStoppingRef.current = true;
    } else if (isGlobalMode && !isPlaying && activeIndex !== -1) {
      // Resume Play All
      isStoppingRef.current = false;
      if (currentAudioRef.current) {
        currentAudioRef.current.play();
        if (bgmAudioRef.current) bgmAudioRef.current.play();
        setIsPlaying(true);
      } else {
        if (bgmAudioRef.current) bgmAudioRef.current.play();
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
      if (bgmAudioRef.current) {
        bgmAudioRef.current.currentTime = 0;
        bgmAudioRef.current.play().catch(e => console.error("BGM Play failed:", e));
      }
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
    if (bgmAudioRef.current && !isPlaying) {
        bgmAudioRef.current.play().catch(e => console.error("BGM Play failed:", e));
    }
    audioQueueRef.current = newQueue.slice(1);
    playNextInQueue(newQueue[0]);
  }, [paragraphs, playNextInQueue, isPlaying]);

  const handleExportAll = useCallback(async () => {
    if (paragraphs.length === 0) {
      setError('No paragraphs to export!');
      return;
    }

    const validParagraphs = paragraphs.filter(p => p.text.trim());
    const totalChars = validParagraphs.reduce((sum, p) => sum + p.text.length, 0);
    const generatedCount = validParagraphs.filter(p => p.isGenerated).length;
    const toGenerateCount = validParagraphs.length - generatedCount;

    const confirmMessage = `Export Audio Confirmation:\n\n` +
      `📝 Total characters: ${totalChars.toLocaleString()}\n` +
      `✅ Already generated: ${generatedCount} paragraph${generatedCount !== 1 ? 's' : ''}\n` +
      `🔄 Need to generate: ${toGenerateCount} paragraph${toGenerateCount !== 1 ? 's' : ''}\n` +
      `🎨 Fade transitions: ${useFadeTransitions ? 'Enabled' : 'Disabled'}\n\n` +
      `Do you want to proceed with the export?`;

    if (!window.confirm(confirmMessage)) {
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
          console.log(`📥 Fetching stored audio for paragraph ${i + 1}`);
          try {
            const response = await fetch(p.audioUrl);
            audioBlob = await response.blob();
          } catch (e) {
            console.error('Failed to fetch from URL, regenerating...', e);
            audioBlob = await generateParagraphAudio(i, false);
          }
        } else if (!audioBlob) {
          console.log(`🔄 Generating paragraph ${i + 1} for export`);
          audioBlob = await generateParagraphAudio(i, false);
        } else {
          console.log(`✅ Using in-memory audio for paragraph ${i + 1}`);
        }

        if (audioBlob) {
          audioBlobs.push(audioBlob);
        }
      }

      if (audioBlobs.length === 0) {
        throw new Error('No audio generated');
      }

      const finalBlob = await speechifyService.concatenateAudioBlobs(
        audioBlobs,
        useParagraphGap ? paragraphGapPause : 0
      );

      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `voiceforge-${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (err) {
      setError('Export failed: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [paragraphs, generateParagraphAudio, setError, setIsLoading, useFadeTransitions, useParagraphGap, paragraphGapPause]);

  const resetAudioPlayer = useCallback(() => {
    isStoppingRef.current = true;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      if (currentAudioRef.current._blobUrl) {
        URL.revokeObjectURL(currentAudioRef.current._blobUrl);
      }
      currentAudioRef.current = null;
    }
    if (bgmAudioRef.current) {
      bgmAudioRef.current.pause();
      URL.revokeObjectURL(bgmAudioRef.current.src);
      bgmAudioRef.current = null;
    }
    if (paragraphGapTimeoutRef.current) clearTimeout(paragraphGapTimeoutRef.current);
    audioQueueRef.current = [];
    setActiveIndex(-1);
    setIsPlaying(false);
    setIsGlobalMode(false);
    setBgmFileName('');
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
    getGlobalAudio,
    bgmFileName,
    bgmVolume,
    handleBgmUpload,
    handleBgmVolumeChange
  };
};
