import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'stopped' | 'error';

const CANDIDATE_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  return CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export interface RecordedClip {
  blob: Blob;
  url: string;
  durationMs: number;
}

/**
 * Records a short clip from the microphone. One clip lives at a time: starting again, or
 * unmounting, releases the previous one and the microphone.
 */
export function useMediaRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [clip, setClip] = useState<RecordedClip | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const releaseClip = useCallback(() => {
    setClip((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return null;
    });
  }, []);

  const start = useCallback(async () => {
    releaseClip();
    setError(null);
    setElapsedMs(0);
    setStatus('requesting');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError('This browser cannot record audio.');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus('error');
      setError('Microphone access was denied. Allow it in your browser settings and try again.');
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      setStatus('error');
      setError('Recording failed.');
      releaseStream();
    };
    recorder.onstop = () => {
      const durationMs = Date.now() - startedAtRef.current;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      setClip({ blob, url: URL.createObjectURL(blob), durationMs });
      setStatus('stopped');
      releaseStream();
    };

    startedAtRef.current = Date.now();
    recorder.start();
    setStatus('recording');
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 100);
  }, [releaseClip, releaseStream]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const reset = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    releaseStream();
    releaseClip();
    setStatus('idle');
    setElapsedMs(0);
    setError(null);
  }, [releaseStream, releaseClip]);

  useEffect(() => () => {
    releaseStream();
    releaseClip();
  }, [releaseStream, releaseClip]);

  return { status, elapsedMs, clip, error, start, stop, reset };
}

export type MediaRecorderApi = ReturnType<typeof useMediaRecorder>;
