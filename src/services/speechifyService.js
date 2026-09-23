import { supabase } from './supabase';
import { buildSSML } from '../utils/ssml';
import { concatenateAudio } from '../utils/audioProcessing';
import { splitIntoChunks, MAX_CHARS_PER_REQUEST } from '../utils/text';

const FUNCTION_NAME = 'generate-speech';
const MAX_CONCURRENT_REQUESTS = 2; // keeps Speechify from answering 429
const MAX_CACHE_ENTRIES = 50;
const ENGLISH_LOCALES = ['en-US', 'en-GB'];

export class SpeechServiceError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'SpeechServiceError';
    this.status = status;
  }
}

/** Turns a supabase.functions.invoke error into a SpeechServiceError carrying the HTTP status. */
async function toServiceError(error) {
  const response = error?.context;
  if (response && typeof response.status === 'number') {
    let message = error.message;
    try {
      const body = await response.clone().json();
      if (body?.error) message = body.error;
    } catch {
      // body was not JSON, keep the generic message
    }
    return new SpeechServiceError(message, response.status);
  }
  return new SpeechServiceError(error?.message || 'Network error');
}

function base64ToBlob(base64Data, contentType) {
  try {
    const binary = atob(base64Data);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: contentType });
  } catch (error) {
    throw new Error(`Failed to decode audio data: ${error.message}`);
  }
}

class SpeechifyService {
  constructor() {
    this.activeRequests = 0;
    this.requestQueue = [];
    this.audioCache = new Map();
  }

  async getVoices() {
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { method: 'GET' });
    if (error) {
      const serviceError = await toServiceError(error);
      throw new Error(`Failed to fetch voices: ${serviceError.message}`);
    }
    return data || [];
  }

  isWithinLimit(text) {
    return text.length <= MAX_CHARS_PER_REQUEST;
  }

  clearCache() {
    this.audioCache.clear();
  }

  getCacheKey(text, voiceId, language, ssmlOptions) {
    return JSON.stringify([voiceId, language, text, ssmlOptions]);
  }

  /**
   * Generates audio for a text of any length. Long texts are split into chunks
   * which are generated in parallel (throttled) and joined again.
   */
  async synthesize(text, voiceId, language, ssmlOptions, requestOptions = {}) {
    if (this.isWithinLimit(text)) {
      return this.generateSpeech(text, voiceId, language, ssmlOptions, requestOptions);
    }

    const chunks = splitIntoChunks(text);
    const blobs = await Promise.all(
      chunks.map((chunk) => this.generateSpeech(chunk, voiceId, language, ssmlOptions, requestOptions)),
    );
    return concatenateAudio(blobs, 0);
  }

  /**
   * @param {object} requestOptions
   * @param {boolean} [requestOptions.forceRegenerate] skip the in-memory cache
   * @param {'generation'|'preview'} [requestOptions.action] used for the usage log
   * @param {string} [requestOptions.projectId] project the usage is logged against
   */
  async generateSpeech(text, voiceId, language, ssmlOptions = {}, requestOptions = {}) {
    const { forceRegenerate = false, action = 'generation', projectId } = requestOptions;

    const cacheKey = this.getCacheKey(text, voiceId, language, ssmlOptions);
    if (!forceRegenerate && this.audioCache.has(cacheKey)) {
      // Re-insert to keep the Map ordered by recency.
      const cached = this.audioCache.get(cacheKey);
      this.audioCache.delete(cacheKey);
      this.audioCache.set(cacheKey, cached);
      return cached;
    }

    // Emotion and emphasis are only supported by the English model.
    const isEnglish = ENGLISH_LOCALES.includes(language);
    const effectiveOptions = isEnglish
      ? ssmlOptions
      : { ...ssmlOptions, emotion: { enabled: false }, emphasis: { enabled: false } };

    const model = language.startsWith('en') ? 'simba-english' : 'simba-multilingual';
    const buildBody = (options) => ({
      input: buildSSML(text, options),
      voice_id: voiceId,
      language,
      model,
      action,
      project_id: projectId,
    });

    let data;
    try {
      data = await this.invoke(buildBody(effectiveOptions));
    } catch (error) {
      const usesStyleTags = effectiveOptions.emotion?.enabled || effectiveOptions.emphasis?.enabled;

      if (error.status === 400 && usesStyleTags) {
        // The voice most likely rejected the emotion/emphasis tags: retry as plain speech.
        window.dispatchEvent(new CustomEvent('speechify-fallback-warning', {
          detail: { message: 'SSML formatting not supported by this voice. Falling back to default style.' },
        }));
        data = await this.invoke(buildBody({
          ...effectiveOptions,
          emotion: { enabled: false },
          emphasis: { enabled: false },
        }));
      } else if (error.status >= 500 && model === 'simba-multilingual') {
        throw new Error(`The simba-multilingual model (experimental) is currently unavailable. Please try again later! (Error: ${error.status})`);
      } else {
        throw error;
      }
    }

    const audioData = data?.audio_data || data?.audioContent || data?.audio;
    if (!audioData) throw new Error('API returned no audio data');

    const blob = base64ToBlob(audioData, `audio/${data.audio_format || 'mpeg'}`);

    this.audioCache.set(cacheKey, blob);
    if (this.audioCache.size > MAX_CACHE_ENTRIES) {
      this.audioCache.delete(this.audioCache.keys().next().value);
    }

    return blob;
  }

  invoke(body) {
    return this.throttleRequest(async () => {
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });
      if (error) throw await toServiceError(error);
      return data;
    });
  }

  throttleRequest(requestFn) {
    return new Promise((resolve, reject) => {
      const run = async () => {
        this.activeRequests++;
        try {
          resolve(await requestFn());
        } catch (error) {
          reject(error);
        } finally {
          this.activeRequests--;
          this.requestQueue.shift()?.();
        }
      };

      if (this.activeRequests < MAX_CONCURRENT_REQUESTS) {
        run();
      } else {
        this.requestQueue.push(run);
      }
    });
  }
}

export default new SpeechifyService();
