import { supabase } from './supabase';
import { SpeechServiceError } from './speechErrors';
import { SampleAligner, base64ToBytes, pcmDurationMs } from '../utils/pcm';
import { SseParser } from '../utils/sse';
import { wordsFromApi, type WordTiming } from '../utils/speechMarks';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-speech`;

/** Text longer than this is not streamed: the request would exceed the size limit of one stream. */
export const MAX_STREAM_CHARS = 10_000;

export interface StreamCallbacks {
  /** Audio as it arrives: raw 16-bit mono PCM, always whole samples. */
  onAudio: (pcm: Uint8Array) => void;
  /** All word timings received so far (they arrive while the audio is made). */
  onWords?: (words: WordTiming[]) => void;
}

export interface StreamResult {
  pcm: Uint8Array[];
  words: WordTiming[];
  durationMs: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

async function errorFrom(response: Response): Promise<SpeechServiceError> {
  let message = `Speech request failed (${response.status})`;
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && typeof body.error === 'string') message = body.error;
  } catch {
    // not JSON: keep the generic message
  }
  return new SpeechServiceError(message, response.status);
}

/**
 * Asks the generate-speech function for streamed speech and hands out audio and word timings while
 * they arrive. Resolves when the stream is complete; throws when it fails or ends early.
 */
export async function requestSpeechStream(body: object, callbacks: StreamCallbacks, signal?: AbortSignal): Promise<StreamResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new SpeechServiceError('You are not signed in', 401);

  let response: Response;
  try {
    response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, stream: true }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    throw new SpeechServiceError(error instanceof Error ? error.message : 'Network error');
  }
  if (!response.ok) throw await errorFrom(response);
  if (!response.body) throw new SpeechServiceError('The speech service sent no stream', 502);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  const aligner = new SampleAligner();
  const pcm: Uint8Array[] = [];
  const words: WordTiming[] = [];
  let pcmBytes = 0;
  let durationMs: number | null = null;

  const handle = (event: string, data: string): void => {
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      return; // not for us
    }
    if (!isRecord(payload)) return;

    if (event === 'speech.chunk') {
      if (typeof payload.audio === 'string' && payload.audio) {
        const bytes = aligner.push(base64ToBytes(payload.audio));
        if (bytes.length > 0) {
          pcm.push(bytes);
          pcmBytes += bytes.length;
          callbacks.onAudio(bytes);
        }
      }
      if (Array.isArray(payload.speech_marks)) {
        const fresh = wordsFromApi({ chunks: payload.speech_marks });
        if (fresh.length > 0) {
          words.push(...fresh);
          callbacks.onWords?.([...words]);
        }
      }
    } else if (event === 'speech.done') {
      durationMs = typeof payload.audio_duration_ms === 'number' ? payload.audio_duration_ms : null;
    } else if (event === 'speech.error') {
      const error = payload.error;
      const message = isRecord(error) && typeof error.message === 'string' ? error.message : 'The audio stream failed';
      throw new SpeechServiceError(message, 502);
    }
  };

  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const { event, data } of parser.push(decoder.decode(value, { stream: true }))) {
        handle(event, data);
        if (event === 'speech.done') finished = true;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!finished) throw new SpeechServiceError('The audio stream ended unexpectedly', 502);
  return { pcm, words, durationMs: durationMs ?? pcmDurationMs(pcmBytes) };
}
