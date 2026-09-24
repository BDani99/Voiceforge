import { useCallback, useEffect, useRef, useState } from 'react';
import { notify } from '../utils/notificationService';

export type PreviewStatus = 'idle' | 'loading' | 'playing';

interface PreviewState {
  key: string | null;
  status: PreviewStatus;
}

const IDLE: PreviewState = { key: null, status: 'idle' };

/**
 * Plays one sample recording at a time. Starting another sample (or closing the component)
 * stops the current one; clicking the playing sample again stops it.
 */
export function usePreviewPlayer() {
  const [state, setState] = useState<PreviewState>(IDLE);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const keyRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    audioRef.current = null;
    keyRef.current = null;
    if (audio) {
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
    setState(IDLE);
  }, []);

  const toggle = useCallback(async (key: string, url: string) => {
    if (keyRef.current === key) {
      stop();
      return;
    }
    stop();

    const audio = new Audio(url);
    audioRef.current = audio;
    keyRef.current = key;
    setState({ key, status: 'loading' });

    const fail = () => {
      if (audioRef.current !== audio) return; // a newer sample took over
      stop();
      notify.warning('This sample could not be played.');
    };

    audio.onplaying = () => {
      if (audioRef.current === audio) setState({ key, status: 'playing' });
    };
    audio.onended = () => {
      if (audioRef.current === audio) stop();
    };
    audio.onerror = fail;

    try {
      await audio.play();
    } catch {
      fail();
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { playingKey: state.key, status: state.status, toggle, stop };
}

export type PreviewPlayer = ReturnType<typeof usePreviewPlayer>;
