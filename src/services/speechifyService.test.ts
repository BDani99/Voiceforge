import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FunctionsHttpError } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), concatenateAudio: vi.fn(), duration: vi.fn() }));

vi.mock('./supabase', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('../utils/audioProcessing', () => ({ concatenateAudio: mocks.concatenateAudio }));
vi.mock('../utils/audioDuration', () => ({ audioDurationMs: mocks.duration }));

const { default: speechify, SpeechServiceError } = await import('./speechifyService');

// "AAAA" is valid base64 for three zero bytes.
const audio = { audio_data: 'AAAA', audio_format: 'mp3' };
const httpError = (status: number, error: string) =>
  new FunctionsHttpError(new Response(JSON.stringify({ error }), { status }));

const bodyOf = (call: number): Record<string, unknown> =>
  (mocks.invoke.mock.calls[call]?.[1] as { body: Record<string, unknown> }).body;

beforeEach(() => {
  vi.clearAllMocks();
  speechify.clearCache();
  mocks.invoke.mockResolvedValue({ data: audio, error: null });
});

describe('generateSpeech', () => {
  it('sends SSML, voice, language, model, action and project to the Edge Function', async () => {
    const blob = await speechify.generateSpeech('Hello', 'henry', 'en-US', {}, { action: 'preview', projectId: 'p1' });

    expect(mocks.invoke).toHaveBeenCalledWith('generate-speech', { body: {
      input: '<speak>Hello</speak>',
      voice_id: 'henry',
      language: 'en-US',
      model: 'simba-3.2',
      action: 'preview',
      project_id: 'p1',
    } });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/mp3');
    expect(blob.size).toBe(3);
  });

  it('uses the model it is given and makes it part of the cache key', async () => {
    await speechify.generateSpeech('same', 'v', 'en-US', {}, { model: 'simba-3.0' });
    await speechify.generateSpeech('same', 'v', 'en-US', {}, { model: 'simba-3.2' });
    expect(bodyOf(0)).toMatchObject({ model: 'simba-3.0' });
    expect(bodyOf(1)).toMatchObject({ model: 'simba-3.2' });
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('keeps emotion tags for models that support them, including highlighted parts', async () => {
    await speechify.generateSpeech('Hello brave world', 'v', 'en-US', { emotionSegments: [{ start: 6, end: 11, emotion: 'angry' }] }, { model: 'simba-3.2' });
    expect(bodyOf(0).input).toBe('<speak>Hello <speechify:style emotion="angry">brave</speechify:style> world</speak>');
  });

  it('drops emotion, highlighted emotions and emphasis for models without support', async () => {
    await speechify.generateSpeech('Hello brave world', 'v', 'en-US', {
      emotion: { enabled: true, type: 'calm' },
      emotionSegments: [{ start: 6, end: 11, emotion: 'angry' }],
      emphasis: { enabled: true, level: 'strong' },
    }, { model: 'simba-multilingual' });
    expect(bodyOf(0).input).toBe('<speak>Hello brave world</speak>');
  });

  it('uses the multilingual model for other languages by default and drops emotion/emphasis for them', async () => {
    await speechify.generateSpeech('Szia', 'v', 'hu-HU', {
      emotion: { enabled: true, type: 'calm' },
      emphasis: { enabled: true, level: 'strong' },
    });

    expect(bodyOf(0)).toMatchObject({ model: 'simba-multilingual', input: '<speak>Szia</speak>' });
  });

  it('retries without highlighted emotions when the voice rejects them', async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: null, error: httpError(400, 'bad ssml') })
      .mockResolvedValueOnce({ data: audio, error: null });
    await speechify.generateSpeech('Hello brave', 'v', 'en-US', { emotionSegments: [{ start: 0, end: 5, emotion: 'sad' }] }, { model: 'simba-3.2' });
    expect(bodyOf(0).input).toContain('speechify:style');
    expect(bodyOf(1).input).toBe('<speak>Hello brave</speak>');
  });

  it('serves repeated requests from the memory cache and honours forceRegenerate', async () => {
    await speechify.generateSpeech('same', 'v', 'en-US');
    await speechify.generateSpeech('same', 'v', 'en-US');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    await speechify.generateSpeech('same', 'v', 'en-US', {}, { forceRegenerate: true });
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('does not confuse texts that start the same (regression: cache key used only 50 characters)', async () => {
    const prefix = 'x'.repeat(60);
    await speechify.generateSpeech(`${prefix} one`, 'v', 'en-US');
    await speechify.generateSpeech(`${prefix} two`, 'v', 'en-US');
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest entry beyond 50 cached results', async () => {
    for (let i = 0; i < 51; i++) await speechify.generateSpeech(`text ${i}`, 'v', 'en-US');
    mocks.invoke.mockClear();

    await speechify.generateSpeech('text 0', 'v', 'en-US'); // evicted
    await speechify.generateSpeech('text 50', 'v', 'en-US'); // still cached
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('turns HTTP errors into SpeechServiceError with the real status and message', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(402, 'Insufficient credits') });

    const failure = await speechify.generateSpeech('Hello', 'v', 'en-US').catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(SpeechServiceError);
    expect(failure).toMatchObject({ status: 402, message: 'Insufficient credits' });
  });

  it('retries without emotion/emphasis when the voice rejects them (400) and warns the user', async () => {
    const warning = vi.fn();
    window.addEventListener('speechify-fallback-warning', warning);
    mocks.invoke
      .mockResolvedValueOnce({ data: null, error: httpError(400, 'bad ssml') })
      .mockResolvedValueOnce({ data: audio, error: null });

    await speechify.generateSpeech('Hello', 'v', 'en-US', { emotion: { enabled: true, type: 'calm' } });

    expect(bodyOf(0).input).toContain('<speechify:style emotion="calm">');
    expect(bodyOf(1).input).toBe('<speak>Hello</speak>');
    expect(warning).toHaveBeenCalledTimes(1);
    window.removeEventListener('speechify-fallback-warning', warning);
  });

  it('does not retry a 400 that had no style tags', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(400, 'bad voice') });
    await expect(speechify.generateSpeech('Hello', 'v', 'en-US')).rejects.toMatchObject({ status: 400 });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('explains server errors of the experimental multilingual model', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(502, 'unavailable') });
    await expect(speechify.generateSpeech('Szia', 'v', 'hu-HU')).rejects.toThrow(/simba-multilingual .* unavailable/);
  });

  it('rejects an empty response body', async () => {
    mocks.invoke.mockResolvedValue({ data: {}, error: null });
    await expect(speechify.generateSpeech('Hello', 'v', 'en-US')).rejects.toThrow('no audio data');
  });

  it('rejects invalid SSML options before anything is sent', async () => {
    await expect(speechify.generateSpeech('Hello', 'v', 'en-US', { prosody: { pitch: '"><x' } })).rejects.toThrow(/Invalid pitch/);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('runs at most two requests at the same time', async () => {
    let running = 0;
    let peak = 0;
    mocks.invoke.mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return { data: audio, error: null };
    });

    await Promise.all(Array.from({ length: 6 }, (_, i) => speechify.generateSpeech(`t${i}`, 'v', 'en-US')));

    expect(mocks.invoke).toHaveBeenCalledTimes(6);
    expect(peak).toBe(2);
  });

  it('keeps working after a failed request (the queue is not blocked)', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: httpError(500, 'boom') });
    await expect(speechify.generateSpeech('a', 'v', 'en-US')).rejects.toBeInstanceOf(SpeechServiceError);
    await expect(speechify.generateSpeech('b', 'v', 'en-US')).resolves.toBeInstanceOf(Blob);
  });
});

describe('synthesize', () => {
  it('generates short texts with a single request', async () => {
    await speechify.synthesize('short', 'v', 'en-US', {});
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.concatenateAudio).not.toHaveBeenCalled();
  });

  it('splits long texts into chunks and joins the audio', async () => {
    const joined = new Blob(['joined']);
    mocks.concatenateAudio.mockResolvedValue(joined);
    const sentence = 'This is a sentence. ';
    const text = sentence.repeat(300); // 6000 characters

    const result = await speechify.synthesize(text, 'v', 'en-US', {});

    expect(result).toBe(joined);
    expect(mocks.invoke.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every chunk only its own highlighted emotions, shifted to the chunk', async () => {
    mocks.concatenateAudio.mockResolvedValue(new Blob(['joined']));
    const first = 'Alpha beta gamma. '.repeat(120); // 2160 characters, second chunk starts inside it
    const text = `${first}Omega delta.`;
    const start = text.length - 12; // "Omega delta." is highlighted

    await speechify.synthesize(text, 'v', 'en-US', { emotionSegments: [{ start, end: text.length, emotion: 'warm' }] }, { model: 'simba-3.2' });

    const inputs = mocks.invoke.mock.calls.map((c) => (c[1] as { body: { input: string } }).body.input);
    expect(inputs.filter((i) => i.includes('speechify:style'))).toHaveLength(1);
    expect(inputs.find((i) => i.includes('speechify:style'))).toContain('<speechify:style emotion="warm">Omega delta.</speechify:style>');
    expect((mocks.concatenateAudio.mock.calls[0]?.[0] as Blob[]).length).toBe(mocks.invoke.mock.calls.length);
  });
});

describe('speech marks', () => {
  const marksFor = (words: [string, number, number, number, number][]) => ({
    type: 'sentence',
    chunks: words.map(([value, start, end, startTime, endTime]) => ({ type: 'word', value, start, end, start_time: startTime, end_time: endTime })),
  });

  it('returns the word timings with the audio', async () => {
    mocks.duration.mockResolvedValue(900);
    mocks.invoke.mockResolvedValue({ data: { ...audio, speech_marks: marksFor([['Hello', 0, 5, 50, 400], ['world', 6, 11, 450, 900]]) }, error: null });

    const { blob, marks } = await speechify.generateSpeechDetailed('Hello world', 'v', 'en-US');

    expect(blob).toBeInstanceOf(Blob);
    expect(marks).toEqual({ durationMs: 900, words: [[0, 5, 50, 400], [6, 11, 450, 900]] });
  });

  it('has no timings when the service sent none, and the plain methods still return only the blob', async () => {
    const detailed = await speechify.generateSpeechDetailed('Hello', 'v', 'en-US');
    expect(detailed.marks).toBeNull();
    await expect(speechify.generateSpeech('Hello again', 'v', 'en-US')).resolves.toBeInstanceOf(Blob);
  });

  it('keeps the timings in the in-memory cache', async () => {
    mocks.duration.mockResolvedValue(500);
    mocks.invoke.mockResolvedValue({ data: { ...audio, speech_marks: marksFor([['Hi', 0, 2, 10, 300]]) }, error: null });
    await speechify.generateSpeechDetailed('Hi', 'v', 'en-US');
    const again = await speechify.generateSpeechDetailed('Hi', 'v', 'en-US');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(again.marks?.words).toEqual([[0, 2, 10, 300]]);
  });

  it('joins the timings of chunks: text offsets add up and each chunk starts after the audio before it', async () => {
    const sentence = 'Alpha beta gamma. ';
    const text = sentence.repeat(120) + 'Omega delta.'; // second chunk starts inside the text
    mocks.duration.mockImplementation((blob: Blob) => Promise.resolve(blob === joined ? 4500 : 2000));
    const joined = new Blob(['joined']);
    mocks.concatenateAudio.mockResolvedValue(joined);
    mocks.invoke.mockResolvedValue({ data: { ...audio, speech_marks: marksFor([['first', 0, 5, 100, 500]]) }, error: null });

    const { marks } = await speechify.synthesizeDetailed(text, 'v', 'en-US', {});

    const calls = mocks.invoke.mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(marks?.words).toHaveLength(calls);
    // every chunk contributes one word; later chunks are shifted by the text and the time before them
    const starts = marks?.words.map((w) => w[0]) ?? [];
    const times = marks?.words.map((w) => w[2]) ?? [];
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(times[1]).toBe(2100);
    expect(marks?.durationMs).toBe(4500); // the length of the joined file
  });

  it('has no timings for a long text when one chunk lacks them', async () => {
    const text = 'Alpha beta gamma. '.repeat(300);
    mocks.concatenateAudio.mockResolvedValue(new Blob(['joined']));
    mocks.duration.mockResolvedValue(1000);
    mocks.invoke
      .mockResolvedValueOnce({ data: { ...audio, speech_marks: marksFor([['a', 0, 1, 0, 100]]) }, error: null })
      .mockResolvedValue({ data: audio, error: null });
    const { marks } = await speechify.synthesizeDetailed(text, 'v', 'en-US', {});
    expect(marks).toBeNull();
  });
});

describe('getVoices', () => {
  it('returns the voice list', async () => {
    mocks.invoke.mockResolvedValue({ data: [{ id: 'henry', locale: 'en-US' }], error: null });
    await expect(speechify.getVoices()).resolves.toEqual([{ id: 'henry', locale: 'en-US' }]);
    expect(mocks.invoke).toHaveBeenCalledWith('generate-speech', { method: 'GET' });
  });

  it('reports why loading the voices failed', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(401, 'Unauthorized') });
    await expect(speechify.getVoices()).rejects.toThrow('Failed to fetch voices: Unauthorized');
  });
});
