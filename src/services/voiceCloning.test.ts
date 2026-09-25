import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { queryMock } from '../test/queryMock';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), from: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: mocks.invoke }, from: mocks.from } }));

const { createClonedVoice, deleteClonedVoice, listMyClonedVoices, requestConsentChallenge } = await import('./voiceCloning');
const { SpeechServiceError } = await import('./speechErrors');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requestConsentChallenge', () => {
  it('sends the full name and returns the challenge', async () => {
    mocks.invoke.mockResolvedValue({ data: { id: 'chal_1', phrase: 'The quick brown fox', expires_at: '2026-01-01T00:00:00Z' }, error: null });

    const result = await requestConsentChallenge('Jane Doe');

    expect(mocks.invoke).toHaveBeenCalledWith('clone-voice', { body: { full_name: 'Jane Doe' } });
    expect(result).toEqual({ id: 'chal_1', phrase: 'The quick brown fox', expiresAt: '2026-01-01T00:00:00Z' });
  });

  it('copes with a missing expiry', async () => {
    mocks.invoke.mockResolvedValue({ data: { id: 'chal_1', phrase: 'x' }, error: null });
    expect((await requestConsentChallenge('Jane')).expiresAt).toBeNull();
  });

  it('rejects an unexpected response shape', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(requestConsentChallenge('Jane')).rejects.toThrow(/unexpected response/);
  });

  it('turns a function error into a SpeechServiceError with its status and message', async () => {
    const response = new Response(JSON.stringify({ error: 'Insufficient credits' }), { status: 402 });
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) });

    const error = await requestConsentChallenge('Jane').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpeechServiceError);
    expect(error).toMatchObject({ message: 'Insufficient credits', status: 402 });
  });
});

describe('createClonedVoice', () => {
  it('sends a multipart form with all the fields', async () => {
    const row = { id: 'row1', display_name: 'My Voice' };
    mocks.invoke.mockResolvedValue({ data: row, error: null });
    const sample = new Blob(['a'], { type: 'audio/webm' });
    const consentRecording = new Blob(['b'], { type: 'audio/webm' });

    const result = await createClonedVoice({
      name: 'My Voice', consentChallengeId: 'chal_1', gender: 'female', locale: 'en-US', sample, consentRecording,
    });

    expect(result).toBe(row);
    const [name, options] = mocks.invoke.mock.calls[0] as [string, { body: FormData }];
    expect(name).toBe('clone-voice');
    const form = options.body;
    expect(form.get('name')).toBe('My Voice');
    expect(form.get('consent_challenge_id')).toBe('chal_1');
    expect(form.get('gender')).toBe('female');
    expect(form.get('locale')).toBe('en-US');
    expect(form.get('sample')).toBeInstanceOf(File);
    expect(form.get('consent_recording')).toBeInstanceOf(File);
  });

  it('leaves out the locale field when none is given', async () => {
    mocks.invoke.mockResolvedValue({ data: { id: 'row1' }, error: null });
    await createClonedVoice({
      name: 'x', consentChallengeId: 'c', gender: 'not_specified', sample: new Blob(['a']), consentRecording: new Blob(['b']),
    });
    const form = (mocks.invoke.mock.calls[0]?.[1] as { body: FormData }).body;
    expect(form.has('locale')).toBe(false);
  });

  it('propagates a validation failure from the function', async () => {
    const response = new Response(JSON.stringify({ error: 'The consent recording could not be understood.' }), { status: 422 });
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) });
    await expect(createClonedVoice({
      name: 'x', consentChallengeId: 'c', gender: 'male', sample: new Blob(['a']), consentRecording: new Blob(['b']),
    })).rejects.toMatchObject({ status: 422, message: 'The consent recording could not be understood.' });
  });
});

describe('listMyClonedVoices', () => {
  it('reads the table, newest first', async () => {
    const rows = [{ id: '1' }, { id: '2' }];
    const query = queryMock({ data: rows });
    mocks.from.mockReturnValue(query.builder);

    expect(await listMyClonedVoices()).toBe(rows);
    expect(mocks.from).toHaveBeenCalledWith('cloned_voices');
    expect(query.argsOf('order')).toEqual(['created_at', { ascending: false }]);
  });

  it('throws on a query error', async () => {
    mocks.from.mockReturnValue(queryMock({ error: { message: 'rls' } }).builder);
    await expect(listMyClonedVoices()).rejects.toBeTruthy();
  });
});

describe('deleteClonedVoice', () => {
  it('sends a DELETE with the id', async () => {
    mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
    await deleteClonedVoice('row1');
    expect(mocks.invoke).toHaveBeenCalledWith('clone-voice', { method: 'DELETE', body: { id: 'row1' } });
  });

  it('propagates a failure', async () => {
    const response = new Response(JSON.stringify({ error: 'Voice not found' }), { status: 404 });
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) });
    await expect(deleteClonedVoice('row1')).rejects.toMatchObject({ status: 404 });
  });
});
