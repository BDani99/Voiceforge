import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: mocks.getSession } } }));

const { requestSpeechStream, MAX_STREAM_CHARS } = await import('./speechStream');
const { SpeechServiceError } = await import('./speechErrors');

const b64 = (...bytes: number[]) => btoa(String.fromCharCode(...bytes));
const sse = (event: string, payload: unknown) => `event: ${event}\ndata: ${JSON.stringify({ type: event, ...(payload as object) })}\n\n`;

/** A fetch response whose body delivers the given text pieces one after another. */
function streamResponse(pieces: string[], init: ResponseInit = { status: 200 }): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
  return new Response(body, init);
}

const word = (start: number, end: number, startTime: number, endTime: number) => ({ type: 'word', start, end, start_time: startTime, end_time: endTime, value: 'w' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'user-token' } } });
});

describe('requestSpeechStream', () => {
  const body = { input: '<speak>Hi</speak>', voice_id: 'henry', language: 'en-US', model: 'simba-3.2' };

  it('posts the request with the user session and asks for a stream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([sse('speech.done', {})]));
    vi.stubGlobal('fetch', fetchMock);
    await requestSpeechStream(body, { onAudio: vi.fn() });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/functions\/v1\/generate-speech$/);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer user-token');
    expect(JSON.parse(init.body as string)).toEqual({ ...body, stream: true });
  });

  it('hands out audio and words while they arrive and returns everything at the end', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      sse('speech.chunk', { audio: b64(1, 2, 3, 4) }),
      sse('speech.chunk', { audio: b64(5, 6), speech_marks: [word(0, 5, 10, 400)] }),
      sse('speech.chunk', { speech_marks: [word(6, 11, 450, 900)] }),
      sse('speech.done', { billable_characters_count: 11, audio_duration_ms: 1234 }),
    ])));
    const onAudio = vi.fn();
    const onWords = vi.fn();

    const result = await requestSpeechStream(body, { onAudio, onWords });

    expect(onAudio.mock.calls.map((c) => [...(c[0] as Uint8Array)])).toEqual([[1, 2, 3, 4], [5, 6]]);
    expect(onWords).toHaveBeenCalledTimes(2);
    expect(onWords).toHaveBeenLastCalledWith([[0, 5, 10, 400], [6, 11, 450, 900]]);
    expect(result.pcm.map((c) => [...c])).toEqual([[1, 2, 3, 4], [5, 6]]);
    expect(result.words).toEqual([[0, 5, 10, 400], [6, 11, 450, 900]]);
    expect(result.durationMs).toBe(1234);
  });

  it('copes with events and audio samples that are cut at chunk boundaries', async () => {
    const whole = sse('speech.chunk', { audio: b64(1, 2, 3) }) + sse('speech.chunk', { audio: b64(4, 5, 6) }) + sse('speech.done', {});
    const cut = [whole.slice(0, 17), whole.slice(17, 60), whole.slice(60)];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(cut)));
    const result = await requestSpeechStream(body, { onAudio: vi.fn() });
    // odd bytes are kept back so every piece holds whole 16-bit samples: 1,2 | 3,4 | 5,6
    expect(result.pcm.flatMap((c) => [...c])).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.pcm.every((c) => c.length % 2 === 0)).toBe(true);
  });

  it('computes the duration from the audio when the service does not say', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      sse('speech.chunk', { audio: b64(...new Array<number>(48).fill(0)) }),
      sse('speech.done', {}),
    ])));
    expect((await requestSpeechStream(body, { onAudio: vi.fn() })).durationMs).toBe(1); // 24 samples at 24 kHz
  });

  it('fails with the message and status of an error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Insufficient credits' }), { status: 402 })));
    const error = await requestSpeechStream(body, { onAudio: vi.fn() }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpeechServiceError);
    expect(error).toMatchObject({ message: 'Insufficient credits', status: 402 });
  });

  it('uses a generic message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>gateway</html>', { status: 502 })));
    await expect(requestSpeechStream(body, { onAudio: vi.fn() })).rejects.toMatchObject({ status: 502, message: expect.stringContaining('502') as string });
  });

  it('fails when the stream reports an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      sse('speech.chunk', { audio: b64(1, 2) }),
      sse('speech.error', { error: { code: 'upstream_failure', message: 'synthesis failed mid-stream' } }),
    ])));
    await expect(requestSpeechStream(body, { onAudio: vi.fn() })).rejects.toThrow('synthesis failed mid-stream');
  });

  it('fails when the stream ends without saying it is done', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([sse('speech.chunk', { audio: b64(1, 2) })])));
    await expect(requestSpeechStream(body, { onAudio: vi.fn() })).rejects.toThrow(/ended unexpectedly/);
  });

  it('fails when the user is not signed in, and when the network is down', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(requestSpeechStream(body, { onAudio: vi.fn() })).rejects.toMatchObject({ status: 401 });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(requestSpeechStream(body, { onAudio: vi.fn() })).rejects.toThrow('offline');
  });

  it('ignores events it does not know and payloads that are not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      'event: ping\ndata: hello\n\n',
      'event: speech.chunk\ndata: not json\n\n',
      sse('speech.done', {}),
    ])));
    await expect(requestSpeechStream(body, { onAudio: vi.fn() })).resolves.toMatchObject({ pcm: [], words: [] });
  });

  it('exposes the longest text that is streamed', () => {
    expect(MAX_STREAM_CHARS).toBe(10_000);
  });
});
