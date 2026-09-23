import { useState, useCallback, useEffect, useRef } from 'react';
import { concatenateAudio } from '../utils/audioProcessing';
import { fetchAudioBlob } from '../services/audioStorage';
import { getErrorMessage } from '../utils/notificationService';
import type { ConfirmFn } from './useConfirm';
import type { SpeechifyApi } from './useSpeechify';
import type { VoiceSettings } from './useVoiceSettings';

type Timer = ReturnType<typeof setTimeout>;

// Object URLs created for playback, released when the element ends, fails or is replaced.
const objectUrls = new WeakMap<HTMLAudioElement, string>();

function releaseObjectUrl(audio: HTMLAudioElement | null): void {
  const url = audio ? objectUrls.get(audio) : undefined;
  if (audio && url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(audio);
  }
}

/** Indexes of the paragraphs that contain text. */
const playableIndexes = (paragraphs: { text: string }[]): number[] =>
  paragraphs.flatMap((p, i) => (p.text.trim() ? [i] : []));

export const useAudioPlayer = (
  speechify: Pick<SpeechifyApi, 'paragraphs' | 'generateParagraphAudio' | 'setError'>,
  settings: Pick<VoiceSettings, 'useParagraphGap' | 'paragraphGapPause' | 'useFadeTransitions'>,
  setIsLoading: (loading: boolean) => void,
  showConfirm: ConfirmFn,
) => {
  const { paragraphs, generateParagraphAudio, setError } = speechify;
  const { useParagraphGap, paragraphGapPause, useFadeTransitions } = settings;

  const [activeIndex, setActiveIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGlobalMode, setIsGlobalMode] = useState(false);

  const audioQueueRef = useRef<number[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isStoppingRef = useRef(false);
  const paragraphGapTimeoutRef = useRef<Timer | null>(null);

  // Playback callbacks chain themselves from audio events, so they must always see the
  // latest paragraphs and functions instead of the render they were created in.
  const latest = useRef({ paragraphs, generateParagraphAudio, setError, useParagraphGap, paragraphGapPause });
  useEffect(() => {
    latest.current = { paragraphs, generateParagraphAudio, setError, useParagraphGap, paragraphGapPause };
  });

  const getGlobalAudio = useCallback(() => currentAudioRef.current, []);

  const clearGapTimer = useCallback(() => {
    if (paragraphGapTimeoutRef.current) clearTimeout(paragraphGapTimeoutRef.current);
    paragraphGapTimeoutRef.current = null;
  }, []);

  const playNextInQueue = useCallback(async (startIndex: number | null = null): Promise<void> => {
    if (isStoppingRef.current) return;

    let nextIndex: number;
    if (startIndex !== null) {
      nextIndex = startIndex;
    } else {
      const queued = audioQueueRef.current.shift();
      if (queued === undefined) {
        setIsPlaying(false);
        return;
      }
      nextIndex = queued;
    }

    setActiveIndex(nextIndex);
    setIsPlaying(true);

    const paragraph = latest.current.paragraphs[nextIndex];
    let audioBlob: Blob | null = paragraph?.audioBlob ?? null;

    // If already generated but blob not in memory, fetch it from the stored URL directly
    if (!audioBlob && paragraph?.isGenerated && paragraph.audioUrl) {
      try {
        audioBlob = await fetchAudioBlob(paragraph.audioUrl);
      } catch (e) {
        console.error('Failed to fetch audio from URL, regenerating...', e);
      }
    }
    audioBlob ??= await latest.current.generateParagraphAudio(nextIndex, false);

    if (audioBlob && !isStoppingRef.current) {
      try {
        // Fades are already baked into the stored audio at generation time.
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        objectUrls.set(audio, url);

        currentAudioRef.current = audio;

        audio.onended = () => {
          releaseObjectUrl(audio);
          if (isStoppingRef.current) return;

          if (audioQueueRef.current.length === 0) {
            setIsPlaying(false);
          } else if (latest.current.useParagraphGap && latest.current.paragraphGapPause > 0) {
            paragraphGapTimeoutRef.current = setTimeout(() => void playNextInQueue(), latest.current.paragraphGapPause);
          } else {
            void playNextInQueue();
          }
        };

        audio.onerror = () => {
          releaseObjectUrl(audio);
          latest.current.setError(`Error playing paragraph ${nextIndex + 1}`);
          if (!isStoppingRef.current) void playNextInQueue();
        };

        // Pre-generate the next paragraph (only if truly not generated and not in storage)
        const upcomingIndex = audioQueueRef.current[0];
        if (upcomingIndex !== undefined && !isStoppingRef.current) {
          const upcoming = latest.current.paragraphs[upcomingIndex];
          if (upcoming && !upcoming.isGenerated && !upcoming.audioUrl) {
            void latest.current.generateParagraphAudio(upcomingIndex, false);
          }
        }

        await audio.play();
      } catch (err) {
        latest.current.setError(`Failed to play audio: ${getErrorMessage(err)}`);
        releaseObjectUrl(currentAudioRef.current);
        if (!isStoppingRef.current) void playNextInQueue();
      }
    } else if (!isStoppingRef.current) {
      void playNextInQueue();
    }
  }, []);

  const handlePlayParagraph = useCallback(async (index: number) => {
    if (activeIndex === index) {
      if (isPlaying) {
        // Pause current
        currentAudioRef.current?.pause();
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
          void playNextInQueue(index);
        }
      }
    } else {
      // Play a different paragraph locally
      isStoppingRef.current = false;
      currentAudioRef.current?.pause();
      clearGapTimer();
      setIsGlobalMode(false);
      audioQueueRef.current = [];
      void playNextInQueue(index);
    }
  }, [activeIndex, isPlaying, playNextInQueue, clearGapTimer]);

  const handlePlayAll = useCallback(() => {
    if (isGlobalMode && isPlaying) {
      // Pause Play All
      currentAudioRef.current?.pause();
      setIsPlaying(false);
      isStoppingRef.current = true;
    } else if (isGlobalMode && !isPlaying && activeIndex !== -1) {
      // Resume Play All
      isStoppingRef.current = false;
      if (currentAudioRef.current) {
        void currentAudioRef.current.play();
        setIsPlaying(true);
      } else {
        void playNextInQueue(activeIndex);
      }
    } else {
      // Start Play All from beginning
      isStoppingRef.current = false;
      currentAudioRef.current?.pause();
      clearGapTimer();

      const [first, ...rest] = playableIndexes(paragraphs);
      if (first === undefined) {
        setError('No paragraphs to play!');
        return;
      }

      setIsGlobalMode(true);
      audioQueueRef.current = rest;
      void playNextInQueue(first);
    }
  }, [isGlobalMode, isPlaying, activeIndex, paragraphs, playNextInQueue, setError, clearGapTimer]);

  const skipToParagraph = useCallback((index: number) => {
    const [first, ...rest] = playableIndexes(paragraphs).filter((i) => i >= index);
    if (first === undefined) return;

    isStoppingRef.current = false;
    currentAudioRef.current?.pause();
    clearGapTimer();

    setIsGlobalMode(true);
    audioQueueRef.current = rest;
    void playNextInQueue(first);
  }, [paragraphs, playNextInQueue, clearGapTimer]);

  const handleExportAll = useCallback(async () => {
    if (paragraphs.length === 0) {
      setError('No paragraphs to export!');
      return;
    }

    const validParagraphs = paragraphs.filter((p) => p.text.trim());
    const totalChars = validParagraphs.reduce((sum, p) => sum + p.text.length, 0);
    const generatedCount = validParagraphs.filter((p) => p.isGenerated).length;
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

    if (!confirmed) return;

    setIsLoading(true);
    setError('');

    try {
      const audioBlobs: Blob[] = [];

      for (const [i, p] of paragraphs.entries()) {
        if (!p.text.trim()) continue;

        let audioBlob: Blob | null = p.audioBlob;

        // If generated and stored but blob not in memory, fetch directly from URL
        if (!audioBlob && p.isGenerated && p.audioUrl) {
          try {
            audioBlob = await fetchAudioBlob(p.audioUrl);
          } catch (e) {
            console.error('Failed to fetch from URL, regenerating...', e);
          }
        }
        audioBlob ??= await generateParagraphAudio(i, false);

        if (audioBlob) audioBlobs.push(audioBlob);
      }

      if (audioBlobs.length === 0) throw new Error('No audio generated');

      const finalBlob = await concatenateAudio(audioBlobs, useParagraphGap ? paragraphGapPause : 0);

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
      setError(`Export failed: ${getErrorMessage(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [paragraphs, generateParagraphAudio, setError, setIsLoading, showConfirm, useFadeTransitions, useParagraphGap, paragraphGapPause]);

  const resetAudioPlayer = useCallback(() => {
    isStoppingRef.current = true;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      releaseObjectUrl(currentAudioRef.current);
      currentAudioRef.current = null;
    }
    clearGapTimer();
    audioQueueRef.current = [];
    setActiveIndex(-1);
    setIsPlaying(false);
    setIsGlobalMode(false);
  }, [clearGapTimer]);

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
  };
};

export type AudioPlayerApi = ReturnType<typeof useAudioPlayer>;
