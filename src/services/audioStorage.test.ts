import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queryMock } from '../test/queryMock';

const mocks = vi.hoisted(() => {
  const upload = vi.fn();
  const getPublicUrl = vi.fn();
  return {
    from: vi.fn(),
    upload,
    getPublicUrl,
    storageFrom: vi.fn(() => ({ upload, getPublicUrl })),
  };
});

vi.mock('./supabase', () => ({
  supabase: { from: mocks.from, storage: { from: mocks.storageFrom } },
}));

const { fetchAudioBlob, findCachedAudio, getAudioHash, storeAudio } = await import('./audioStorage');

const PREFIX = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/voiceovers/`;
const HASH = 'a'.repeat(64);

const audioResponse = (ok = true, status = 200) => ({ ok, status, blob: () => Promise.resolve(new Blob(['x'], { type: 'audio/wav' })) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getAudioHash', () => {
  it('is a stable SHA-256 of the payload', async () => {
    const a = await getAudioHash({ text: 'hello', voice: 'v' });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await getAudioHash({ text: 'hello', voice: 'v' })).toBe(a);
    expect(await getAudioHash({ text: 'hello!', voice: 'v' })).not.toBe(a);
  });
});

describe('fetchAudioBlob', () => {
  it('refuses URLs outside the audio bucket', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchAudioBlob('https://evil.example/x.wav')).rejects.toThrow(/untrusted/);
    await expect(fetchAudioBlob(null)).rejects.toThrow(/untrusted/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('downloads trusted URLs and reports HTTP failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(audioResponse()).mockResolvedValueOnce(audioResponse(false, 404)));
    await expect(fetchAudioBlob(`${PREFIX}${HASH}.wav`)).resolves.toBeInstanceOf(Blob);
    await expect(fetchAudioBlob(`${PREFIX}${HASH}.wav`)).rejects.toThrow('404');
  });
});

describe('findCachedAudio', () => {
  it('returns the cached blob for a trusted URL', async () => {
    mocks.from.mockReturnValue(queryMock({ data: { audio_url: `${PREFIX}${HASH}.wav` } }).builder);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(audioResponse()));

    const hit = await findCachedAudio(HASH);
    expect(hit?.url).toBe(`${PREFIX}${HASH}.wav`);
    expect(hit?.blob).toBeInstanceOf(Blob);
  });

  it('ignores cache rows that point somewhere else (cache poisoning)', async () => {
    mocks.from.mockReturnValue(queryMock({ data: { audio_url: 'https://evil.example/x.wav' } }).builder);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(findCachedAudio(HASH)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null for a miss, a query error or a broken download', async () => {
    mocks.from.mockReturnValueOnce(queryMock({ data: null }).builder);
    await expect(findCachedAudio(HASH)).resolves.toBeNull();

    mocks.from.mockReturnValueOnce(queryMock({ error: { message: 'db down' } }).builder);
    await expect(findCachedAudio(HASH)).resolves.toBeNull();

    mocks.from.mockReturnValueOnce(queryMock({ data: { audio_url: `${PREFIX}${HASH}.wav` } }).builder);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(findCachedAudio(HASH)).resolves.toBeNull();
  });
});

describe('storeAudio', () => {
  const publicUrl = (path: string) => ({ data: { publicUrl: `${PREFIX}${path}` } });

  it('uploads with the right extension and content type and registers the cache row', async () => {
    mocks.upload.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockImplementation((path: string) => publicUrl(path));
    const cache = queryMock({});
    mocks.from.mockReturnValue(cache.builder);

    const url = await storeAudio(HASH, new Blob(['x'], { type: 'audio/mpeg' }));

    expect(url).toBe(`${PREFIX}${HASH}.mp3`);
    expect(mocks.upload).toHaveBeenCalledWith(`${HASH}.mp3`, expect.any(Blob), { upsert: true, contentType: 'audio/mpeg' });
    expect(cache.argsOf('upsert')).toEqual([
      { hash_key: HASH, audio_url: `${PREFIX}${HASH}.mp3` },
      { onConflict: 'hash_key', ignoreDuplicates: true },
    ]);
  });

  it('defaults to wav for unknown types', async () => {
    mocks.upload.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockImplementation((path: string) => publicUrl(path));
    mocks.from.mockReturnValue(queryMock({}).builder);

    await expect(storeAudio(HASH, new Blob(['x']))).resolves.toBe(`${PREFIX}${HASH}.wav`);
  });

  it('still returns the URL when only the cache registration fails', async () => {
    mocks.upload.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockImplementation((path: string) => publicUrl(path));
    mocks.from.mockReturnValue(queryMock({ error: { message: 'rls' } }).builder);

    await expect(storeAudio(HASH, new Blob(['x'], { type: 'audio/wav' }))).resolves.toBe(`${PREFIX}${HASH}.wav`);
  });

  it('returns null when the upload fails', async () => {
    mocks.upload.mockResolvedValue({ error: { message: 'too large' } });
    await expect(storeAudio(HASH, new Blob(['x'], { type: 'audio/wav' }))).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
