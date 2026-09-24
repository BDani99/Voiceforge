import { useState, useCallback, useEffect, useRef } from 'react';
import { concatenateAudio } from '../utils/audioProcessing';
import { fetchAudioBlob } from '../services/audioStorage';
import { downloadBlob } from '../utils/download';
import { StreamPlayer } from '../services/streamPlayer';
import { MAX_STREAM_CHARS } from '../services/speechStream';
import type { PlaybackSource } from '../types/playback';
import { getErrorMessage } from '../utils/notificationService';
import type { ConfirmFn } from './useConfirm';
import type { SpeechifyApi } from './useSpeechify';
import type { VoiceSettings } from './useVoiceSettings';

type Timer = ReturnType<typeof setTimeout>;

/** The audio (an element, or a live stream) that is loaded or playing, and the paragraph it belongs to. */
interface Loaded {
  source: PlaybackSource;
  index: number;
  id: string;
  text: string;
  /** The finished audio; null while a stream is still being received. */
  blob: Blob | null;
  /** Stops the sound and lets go of everything the source holds. */
  release: () => void;
}

interface StartOptions {
  /** Paragraphs that follow (Play All). */
  queue?: number[];
  global?: boolean;
  /** Start position as a fraction of the paragraph (0..1). */
  seek?: number;
}

/** Indexes of the paragraphs that contain text. */
const playableIndexes = (paragraphs: { text: string }[]): number[] =>
  paragraphs.flatMap((p, i) => (p.text.trim() ? [i] : []));

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

export const useAudioPlayer = (
  speechify: Pick<SpeechifyApi, 'paragraphs' | 'generateParagraphAudio' | 'setError'>,
  settings: Pick<VoiceSettings, 'useParagraphGap' | 'paragraphGapPause' | 'useFadeTransitions' | 'streamingEnabled'>,
  setIsLoading: (loading: boolean) => void,
  showConfirm: ConfirmFn,
) => {
  const { paragraphs, generateParagraphAudio, setError } = speechify;
  const { useParagraphGap, paragraphGapPause, useFadeTransitions, streamingEnabled } = settings;

  const [activeIndex, setActiveIndex] = useState(-1);
  /** The paragraph whose audio is being received and played at the same time. */
  const [streamingIndex, setStreamingIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGlobalMode, setIsGlobalMode] = useState(false);

  const loadedRef = useRef<Loaded | null>(null);
  const queueRef = useRef<number[]>([]);
  const gapTimerRef = useRef<Timer | null>(null);
  /**
   * Every start, stop and reset gets a new session number. Whatever is still waiting for a download
   * or an audio event checks its own number first, so a superseded playback can never start or
   * chain on to the next paragraph.
   */
  const sessionRef = useRef(0);

  // Playback callbacks chain themselves from audio events, so they must always see the
  // latest paragraphs and functions instead of the render they were created in.
  const latest = useRef({ paragraphs, generateParagraphAudio, setError, useParagraphGap, paragraphGapPause, streamingEnabled });
  useEffect(() => {
    latest.current = { paragraphs, generateParagraphAudio, setError, useParagraphGap, paragraphGapPause, streamingEnabled };
  });

  /** The audio of one paragraph, if it is loaded (playing or paused). */
  const getAudioFor = useCallback(
    (index: number): PlaybackSource | null => (loadedRef.current?.index === index ? loadedRef.current.source : null),
    [],
  );

  const clearGapTimer = useCallback(() => {
    if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
    gapTimerRef.current = null;
  }, []);

  /** Stops and releases the loaded audio. */
  const unload = useCallback(() => {
    const loaded = loadedRef.current;
    loadedRef.current = null;
    setStreamingIndex(-1);
    loaded?.release();
  }, []);

  const finish = useCallback(() => {
    unload();
    clearGapTimer();
    queueRef.current = [];
    setIsPlaying(false);
    setIsGlobalMode(false);
    setActiveIndex(-1);
  }, [unload, clearGapTimer]);

  /** Plays the paragraph, then (Play All) the ones that follow. */
  const playIndex = useCallback(async (index: number, session: number, seek?: number): Promise<void> => {
    if (session !== sessionRef.current) return;

    setActiveIndex(index);
    setIsPlaying(true);

    const advance = (): void => {
      if (session !== sessionRef.current) return;
      const next = queueRef.current.shift();
      if (next === undefined) {
        finish();
        return;
      }
      const { useParagraphGap: gap, paragraphGapPause: pause } = latest.current;
      if (gap && pause > 0) {
        setActiveIndex(next); // shows which paragraph comes next while the pause runs
        gapTimerRef.current = setTimeout(() => {
          gapTimerRef.current = null;
          void playIndex(next, session);
        }, pause);
      } else {
        void playIndex(next, session);
      }
    };

    const paragraph = latest.current.paragraphs[index];
    let blob: Blob | null = paragraph?.audioBlob ?? null;

    // Pre-generate the next paragraph so Play All does not wait between paragraphs.
    const prefetchNext = () => {
      const upcomingIndex = queueRef.current[0];
      if (upcomingIndex === undefined) return;
      const upcoming = latest.current.paragraphs[upcomingIndex];
      if (upcoming && !upcoming.isGenerated && !upcoming.audioUrl) void latest.current.generateParagraphAudio(upcomingIndex, false);
    };

    // Generated earlier but not in memory: fetch it from the stored URL.
    if (!blob && paragraph?.isGenerated && paragraph.audioUrl) {
      try {
        blob = await fetchAudioBlob(paragraph.audioUrl);
      } catch (e) {
        console.error('Failed to fetch audio from URL, regenerating...', e);
      }
    }
    // Audio that still has to be made is played while it arrives, when the browser and the text allow it.
    const streaming: { player: StreamPlayer | null } = { player: null };
    if (!blob) {
      const canStream = latest.current.streamingEnabled
        && StreamPlayer.isSupported()
        && !!paragraph && !paragraph.isGenerated
        && paragraph.text.length <= MAX_STREAM_CHARS;

      if (canStream) prefetchNext();
      blob = await latest.current.generateParagraphAudio(index, false, canStream
        ? {
          onAudio: (pcm) => {
            // Playback was replaced or paused meanwhile: the audio is still stored, only not played.
            if (session !== sessionRef.current) return;
            if (!streaming.player) {
              const player = new StreamPlayer();
              streaming.player = player;
              unload();
              const own = latest.current.paragraphs[index];
              loadedRef.current = { source: player, index, id: own?.id ?? '', text: own?.text ?? '', blob: null, release: () => player.stop() };
              setStreamingIndex(index);
            }
            streaming.player.push(pcm);
          },
        }
        : undefined);
    }

    const streamed = streaming.player;
    if (streamed) {
      // The audio was played while it was made. When it is complete, its end is the end of this paragraph.
      setStreamingIndex(-1);
      const loaded = loadedRef.current;
      if (session !== sessionRef.current || loaded?.source !== streamed) return;
      loaded.blob = blob;
      streamed.onended = () => {
        if (session !== sessionRef.current) return;
        unload();
        advance();
      };
      streamed.end();
      return;
    }

    if (session !== sessionRef.current) return;
    const current = latest.current.paragraphs[index];
    if (!blob || !current) {
      advance();
      return;
    }

    unload();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    loadedRef.current = {
      source: audio,
      index,
      id: current.id,
      text: current.text,
      blob,
      release: () => {
        audio.onended = null;
        audio.onerror = null;
        audio.onloadedmetadata = null;
        audio.pause();
        URL.revokeObjectURL(url);
      },
    };

    audio.onloadedmetadata = () => {
      if (seek !== undefined && Number.isFinite(audio.duration)) audio.currentTime = seek * audio.duration;
    };
    audio.onended = () => {
      if (session !== sessionRef.current) return;
      unload();
      advance();
    };
    audio.onerror = () => {
      if (session !== sessionRef.current) return;
      latest.current.setError(`Error playing paragraph ${index + 1}`);
      unload();
      advance();
    };

    prefetchNext();

    try {
      await audio.play();
    } catch (err) {
      // Pausing while the audio starts rejects play() with an AbortError; that is not a failure.
      if (session !== sessionRef.current || isAbort(err)) return;
      latest.current.setError(`Failed to play audio: ${getErrorMessage(err)}`);
      unload();
      advance();
    }
  }, [finish, unload]);

  /** Starts a new playback and replaces whatever plays now. */
  const start = useCallback((index: number, { queue = [], global = false, seek }: StartOptions = {}) => {
    sessionRef.current += 1;
    unload();
    clearGapTimer();
    queueRef.current = queue;
    setIsGlobalMode(global);
    void playIndex(index, sessionRef.current, seek);
  }, [playIndex, unload, clearGapTimer]);

  const pause = useCallback(() => {
    clearGapTimer();
    const audio = loadedRef.current?.source;
    if (audio) {
      audio.pause();
    } else {
      sessionRef.current += 1; // nothing is playing yet (loading or waiting): cancel what is pending
    }
    setIsPlaying(false);
  }, [clearGapTimer]);

  /** Continues a paused playback where it stopped. */
  const resume = useCallback(async () => {
    const audio = loadedRef.current?.source;
    if (!audio) {
      // It was paused before the audio was ready: start that paragraph again with its queue.
      sessionRef.current += 1;
      void playIndex(activeIndex, sessionRef.current);
      return;
    }
    setIsPlaying(true);
    try {
      await audio.play();
    } catch (err) {
      if (isAbort(err)) return;
      setIsPlaying(false);
      setError(`Failed to play audio: ${getErrorMessage(err)}`);
    }
  }, [activeIndex, playIndex, setError]);

  const handlePlayParagraph = useCallback(async (index: number) => {
    if (activeIndex === index) {
      if (isPlaying) pause();
      else await resume();
      return;
    }
    start(index);
  }, [activeIndex, isPlaying, pause, resume, start]);

  const handlePlayAll = useCallback(() => {
    if (isGlobalMode && isPlaying) {
      pause();
    } else if (isGlobalMode && activeIndex !== -1) {
      void resume();
    } else {
      const [first, ...rest] = playableIndexes(paragraphs);
      if (first === undefined) {
        setError('No paragraphs to play!');
        return;
      }
      start(first, { queue: rest, global: true });
    }
  }, [isGlobalMode, isPlaying, activeIndex, paragraphs, pause, resume, start, setError]);

  const skipToParagraph = useCallback((index: number) => {
    const [first, ...rest] = playableIndexes(paragraphs).filter((i) => i >= index);
    if (first === undefined) return;
    start(first, { queue: rest, global: true });
  }, [paragraphs, start]);

  /** Jumps to a position (0..1) in a paragraph; a paragraph that is not loaded starts from there. */
  const seekParagraph = useCallback((index: number, fraction: number) => {
    const position = Math.max(0, Math.min(1, fraction));
    const audio = getAudioFor(index);
    if (audio) {
      if (Number.isFinite(audio.duration)) audio.currentTime = position * audio.duration; // a live stream cannot be moved
      return;
    }
    const paragraph = paragraphs[index];
    if (paragraph?.isGenerated) start(index, { seek: position });
  }, [getAudioFor, paragraphs, start]);

  // Audio that no longer matches its paragraph (text edited, regenerated, paragraph moved or deleted) must not go on.
  useEffect(() => {
    const loaded = loadedRef.current;
    if (!loaded) return;
    const paragraph = paragraphs[loaded.index];
    const changed = paragraph === undefined
      ? true
      : paragraph.id !== loaded.id
        || paragraph.text !== loaded.text
        || (loaded.blob !== null && paragraph.audioBlob !== null && paragraph.audioBlob !== loaded.blob);
    if (changed) {
      sessionRef.current += 1;
      finish();
    }
  }, [paragraphs, finish]);

  // Leaving the page must stop the sound.
  useEffect(() => () => {
    sessionRef.current += 1;
    unload();
    clearGapTimer();
  }, [unload, clearGapTimer]);

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
      downloadBlob(finalBlob, `voiceforge-${Date.now()}.${extension}`);
    } catch (err) {
      setError(`Export failed: ${getErrorMessage(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, [paragraphs, generateParagraphAudio, setError, setIsLoading, showConfirm, useFadeTransitions, useParagraphGap, paragraphGapPause]);

  const resetAudioPlayer = useCallback(() => {
    sessionRef.current += 1;
    finish();
  }, [finish]);

  return {
    isPlayingAll: isGlobalMode && isPlaying,
    isPausedAll: isGlobalMode && !isPlaying && activeIndex !== -1,
    currentPlayingIndex: activeIndex,
    streamingIndex,
    isPlaying,
    handlePlayParagraph,
    handlePlayAll,
    skipToParagraph,
    seekParagraph,
    handleExportAll,
    resetAudioPlayer,
    getAudioFor,
  };
};

export type AudioPlayerApi = ReturnType<typeof useAudioPlayer>;
