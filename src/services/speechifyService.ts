import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { SpeechServiceError } from './speechErrors';
import { MAX_STREAM_CHARS, requestSpeechStream, type StreamCallbacks } from './speechStream';
import { pcmToWav } from '../utils/pcm';
import { buildSSML } from '../utils/ssml';
import { concatenateAudio } from '../utils/audioProcessing';
import { splitIntoChunkRanges, MAX_CHARS_PER_REQUEST } from '../utils/text';
import { sliceSegments } from '../utils/emotionSegments';
import { sliceMarks } from '../utils/textMarks';
import { audioDurationMs } from '../utils/audioDuration';
import { joinMarks, wordsFromApi, type SpeechMarks } from '../utils/speechMarks';
import { autoModel, supportsEmotion } from '../utils/voices';
import type { SsmlOptions, Voice } from '../types/models';

const FUNCTION_NAME = 'generate-speech';
const MAX_CONCURRENT_REQUESTS = 2; // keeps Speechify from answering 429
const MAX_CACHE_ENTRIES = 50;

export { SpeechServiceError };

/** Turns a supabase.functions.invoke error into a SpeechServiceError carrying the HTTP status. */
async function toServiceError(error: Error): Promise<SpeechServiceError> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    let message = error.message;
    try {
      const body = (await response.clone().json()) as { error?: unknown };
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // body was not JSON, keep the generic message
    }
    return new SpeechServiceError(message, response.status);
  }
  return new SpeechServiceError(error.message || 'Network error');
}

function base64ToBlob(base64Data: string, contentType: string): Blob {
  try {
    const binary = atob(base64Data);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: contentType });
  } catch (error) {
    throw new Error(`Failed to decode audio data: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Result of supabase.functions.invoke with the error narrowed to what the client handles. */
interface InvokeResult<T> {
  data: T | null;
  error: Error | null;
}

/** Fields of the Edge Function response the client reads. */
interface SpeechResponse {
  audio_data?: string;
  audioContent?: string;
  audio?: string;
  audio_format?: string;
  /** Word timings of the audio (see utils/speechMarks.ts). */
  speech_marks?: unknown;
}

/** Audio and, when the service delivered them, the word timings of it. */
export interface SynthesisResult {
  blob: Blob;
  marks: SpeechMarks | null;
}

export interface RequestOptions {
  /** Skip the in-memory cache. */
  forceRegenerate?: boolean;
  /** Used for the usage log. */
  action?: 'generation' | 'preview';
  /** Project the usage is logged against. */
  projectId?: string;
  /** Speechify model. Defaults to the automatic choice for the language. */
  model?: string;
}

/** Emotion and emphasis are only supported by some models. */
function optionsForModel(model: string, options: SsmlOptions): SsmlOptions {
  return supportsEmotion(model) ? options : withoutStyling(options);
}

/** The same options without emotions and emphasis: plain speech. */
function withoutStyling(options: SsmlOptions): SsmlOptions {
  return {
    ...options,
    emotion: { enabled: false },
    emotionSegments: [],
    emphasis: { enabled: false },
    marks: (options.marks ?? []).filter((m) => m.kind !== 'emphasis'),
  };
}

const usesStyleTags = (options: SsmlOptions): boolean =>
  [
    options.emotion?.enabled,
    (options.emotionSegments?.length ?? 0) > 0,
    options.emphasis?.enabled,
    (options.marks ?? []).some((m) => m.kind === 'emphasis'),
  ].some(Boolean);

class SpeechifyService {
  private activeRequests = 0;
  private readonly requestQueue: (() => void)[] = [];
  private readonly audioCache = new Map<string, SynthesisResult>();

  async getVoices(): Promise<Voice[]> {
    const { data, error } = (await supabase.functions.invoke<Voice[]>(FUNCTION_NAME, { method: 'GET' })) as InvokeResult<Voice[]>;
    if (error) {
      const serviceError = await toServiceError(error);
      throw new Error(`Failed to fetch voices: ${serviceError.message}`);
    }
    return data ?? [];
  }

  isWithinLimit(text: string): boolean {
    return text.length <= MAX_CHARS_PER_REQUEST;
  }

  clearCache(): void {
    this.audioCache.clear();
  }

  getCacheKey(text: string, voiceId: string, language: string, model: string, ssmlOptions: SsmlOptions): string {
    return JSON.stringify([voiceId, language, model, text, ssmlOptions]);
  }

  /**
   * Generates audio for a text of any length. Long texts are split into chunks
   * which are generated in parallel (throttled) and joined again.
   */
  async synthesize(
    text: string,
    voiceId: string,
    language: string,
    ssmlOptions: SsmlOptions,
    requestOptions: RequestOptions = {},
  ): Promise<Blob> {
    return (await this.synthesizeDetailed(text, voiceId, language, ssmlOptions, requestOptions)).blob;
  }

  /** Like synthesize, and also returns when each word is spoken (for highlighting and captions). */
  async synthesizeDetailed(
    text: string,
    voiceId: string,
    language: string,
    ssmlOptions: SsmlOptions,
    requestOptions: RequestOptions = {},
  ): Promise<SynthesisResult> {
    if (this.isWithinLimit(text)) {
      return this.generateSpeechDetailed(text, voiceId, language, ssmlOptions, requestOptions);
    }

    // Highlighted emotions are positions in the full text, so every chunk gets its own share of them.
    const ranges = splitIntoChunkRanges(text);
    const chunks = ranges
      .map((range, index) => ({
        text: text.slice(range.start, range.end),
        options: {
          ...ssmlOptions,
          emotionSegments: sliceSegments(ssmlOptions.emotionSegments ?? [], range.start, range.end),
          marks: sliceMarks(ssmlOptions.marks ?? [], range.start, range.end, index === ranges.length - 1),
        },
      }))
      .filter((chunk) => chunk.text.trim());
    const results = await Promise.all(
      chunks.map((chunk) => this.generateSpeechDetailed(chunk.text, voiceId, language, chunk.options, requestOptions)),
    );
    const blob = await concatenateAudio(results.map((r) => r.blob), 0);

    // Every chunk starts at its own text offset and after the audio of the chunks before it.
    const timed = results.flatMap((result, i) => (result.marks ? [{ marks: result.marks, textOffset: ranges[i]?.start ?? 0 }] : []));
    const marks = timed.length === results.length ? joinMarks(timed) : null;
    return { blob, marks: marks ? { ...marks, durationMs: (await audioDurationMs(blob)) || marks.durationMs } : null };
  }

  async generateSpeech(
    text: string,
    voiceId: string,
    language: string,
    ssmlOptions: SsmlOptions = {},
    requestOptions: RequestOptions = {},
  ): Promise<Blob> {
    return (await this.generateSpeechDetailed(text, voiceId, language, ssmlOptions, requestOptions)).blob;
  }

  async generateSpeechDetailed(
    text: string,
    voiceId: string,
    language: string,
    ssmlOptions: SsmlOptions = {},
    requestOptions: RequestOptions = {},
  ): Promise<SynthesisResult> {
    const { forceRegenerate = false, action = 'generation', projectId } = requestOptions;
    const model = requestOptions.model ?? autoModel(undefined, language);

    const cacheKey = this.getCacheKey(text, voiceId, language, model, ssmlOptions);
    const cached = this.audioCache.get(cacheKey);
    if (!forceRegenerate && cached) {
      // Re-insert to keep the Map ordered by recency.
      this.audioCache.delete(cacheKey);
      this.audioCache.set(cacheKey, cached);
      return cached;
    }

    const effectiveOptions = optionsForModel(model, ssmlOptions);

    const buildBody = (options: SsmlOptions) => ({
      input: buildSSML(text, options),
      voice_id: voiceId,
      language,
      model,
      action,
      project_id: projectId,
    });

    let data: SpeechResponse;
    try {
      data = await this.invoke(buildBody(effectiveOptions));
    } catch (error) {
      const status = error instanceof SpeechServiceError ? error.status : 0;
      if (status === 400 && usesStyleTags(effectiveOptions)) {
        // The voice most likely rejected the emotion/emphasis tags: retry as plain speech.
        window.dispatchEvent(new CustomEvent('speechify-fallback-warning', {
          detail: { message: 'SSML formatting not supported by this voice. Falling back to default style.' },
        }));
        data = await this.invoke(buildBody(withoutStyling(effectiveOptions)));
      } else if (status >= 500 && model === 'simba-multilingual') {
        throw new Error(`The simba-multilingual model (legacy) is currently unavailable. Try another model or try again later. (Error: ${status})`);
      } else {
        throw error;
      }
    }

    const audioData = data.audio_data ?? data.audioContent ?? data.audio;
    if (!audioData) throw new Error('API returned no audio data');

    const blob = base64ToBlob(audioData, `audio/${data.audio_format ?? 'mpeg'}`);

    const words = wordsFromApi(data.speech_marks);
    const result: SynthesisResult = {
      blob,
      marks: words.length > 0 ? { words, durationMs: await audioDurationMs(blob) } : null,
    };

    this.audioCache.set(cacheKey, result);
    if (this.audioCache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.audioCache.keys().next();
      if (!oldest.done) this.audioCache.delete(oldest.value);
    }

    return result;
  }

  /** Whether a text can be streamed (longer texts are generated in chunks instead). */
  canStream(text: string): boolean {
    return text.length <= MAX_STREAM_CHARS;
  }

  /**
   * Like generateSpeechDetailed for one text, but the audio is handed to `callbacks` while it is made,
   * so it can be played before it is finished. Returns the finished audio as a WAV file with its timings.
   */
  async streamSynthesis(
    text: string,
    voiceId: string,
    language: string,
    ssmlOptions: SsmlOptions,
    requestOptions: RequestOptions,
    callbacks: StreamCallbacks,
  ): Promise<SynthesisResult> {
    const { action = 'generation', projectId } = requestOptions;
    const model = requestOptions.model ?? autoModel(undefined, language);
    const effectiveOptions = optionsForModel(model, ssmlOptions);

    const open = (options: SsmlOptions) => this.throttleRequest(() => requestSpeechStream({
      input: buildSSML(text, options),
      voice_id: voiceId,
      language,
      model,
      action,
      project_id: projectId,
    }, callbacks));

    let result;
    try {
      result = await open(effectiveOptions);
    } catch (error) {
      const status = error instanceof SpeechServiceError ? error.status : 0;
      if (status === 400 && usesStyleTags(effectiveOptions)) {
        // The voice most likely rejected the emotion/emphasis tags: retry as plain speech (no audio was sent yet).
        window.dispatchEvent(new CustomEvent('speechify-fallback-warning', {
          detail: { message: 'SSML formatting not supported by this voice. Falling back to default style.' },
        }));
        result = await open(withoutStyling(effectiveOptions));
      } else {
        throw error;
      }
    }

    return {
      blob: pcmToWav(result.pcm),
      marks: result.words.length > 0 ? { durationMs: result.durationMs, words: result.words } : null,
    };
  }

  private invoke(body: object): Promise<SpeechResponse> {
    return this.throttleRequest(async () => {
      const { data, error } = (await supabase.functions.invoke<SpeechResponse>(FUNCTION_NAME, { body })) as InvokeResult<SpeechResponse>;
      if (error) throw await toServiceError(error);
      if (!data) throw new SpeechServiceError('Empty response from the speech service');
      return data;
    });
  }

  private throttleRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = async () => {
        this.activeRequests++;
        try {
          resolve(await requestFn());
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        } finally {
          this.activeRequests--;
          this.requestQueue.shift()?.();
        }
      };

      if (this.activeRequests < MAX_CONCURRENT_REQUESTS) {
        void run();
      } else {
        this.requestQueue.push(() => void run());
      }
    });
  }
}

export default new SpeechifyService();
