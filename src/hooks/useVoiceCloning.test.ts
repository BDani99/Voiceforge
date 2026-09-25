import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useVoiceCloning } from './useVoiceCloning';
import type * as NotificationService from '../utils/notificationService';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  consent: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('../services/voiceCloning', () => ({
  listMyClonedVoices: mocks.list,
  requestConsentChallenge: mocks.consent,
  createClonedVoice: mocks.create,
  deleteClonedVoice: mocks.remove,
}));
vi.mock('../utils/notificationService', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationService>()),
  notify: mocks.notify,
}));

const voice = (id: string) => ({ id, user_id: 'u1', speechify_voice_id: `sf_${id}`, display_name: id, gender: 'male', locale: null, consent_challenge_id: 'c', created_at: null });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([voice('a')]);
});

describe('useVoiceCloning', () => {
  it('loads the list on mount', async () => {
    const { result } = renderHook(() => useVoiceCloning());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.voices).toEqual([voice('a')]);
  });

  it('notifies when the list fails to load', async () => {
    mocks.list.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useVoiceCloning());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.notify.error).toHaveBeenCalled();
  });

  it('starts a consent challenge and reports a failure with a toast', async () => {
    mocks.consent.mockResolvedValue({ id: 'c1', phrase: 'Read this', expiresAt: null });
    const { result } = renderHook(() => useVoiceCloning());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const challenge = await act(async () => result.current.startConsent('Jane'));
    expect(challenge).toEqual({ id: 'c1', phrase: 'Read this', expiresAt: null });

    mocks.consent.mockRejectedValue(new Error('rate limited'));
    const failed = await act(async () => result.current.startConsent('Jane'));
    expect(failed).toBeNull();
    expect(mocks.notify.error).toHaveBeenCalled();
  });

  it('creates a voice, adds it to the list and notifies success', async () => {
    mocks.create.mockResolvedValue(voice('b'));
    const { result } = renderHook(() => useVoiceCloning());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let error: string | null = 'unset';
    await act(async () => {
      error = await result.current.create({
        name: 'b', consentChallengeId: 'c1', gender: 'male', sample: new Blob(['a']), consentRecording: new Blob(['b']),
      });
    });

    expect(error).toBeNull();
    expect(result.current.voices.map((v) => v.id)).toEqual(['b', 'a']);
    expect(mocks.notify.success).toHaveBeenCalled();
  });

  it('returns an inline error message on failure, without changing the list', async () => {
    mocks.create.mockRejectedValue({ message: 'The recording did not match the phrase.' });
    const { result } = renderHook(() => useVoiceCloning());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let error: string | null = null;
    await act(async () => {
      error = await result.current.create({
        name: 'b', consentChallengeId: 'c1', gender: 'male', sample: new Blob(['a']), consentRecording: new Blob(['b']),
      });
    });
    expect(error).toMatch(/did not match the phrase/);
    expect(result.current.voices).toHaveLength(1);
  });

  it('removes a voice from the list on delete', async () => {
    mocks.remove.mockResolvedValue(undefined);
    const { result } = renderHook(() => useVoiceCloning());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.remove('a'); });
    expect(result.current.voices).toEqual([]);
    expect(mocks.notify.success).toHaveBeenCalled();
  });

  it('keeps the voice in the list when deletion fails', async () => {
    mocks.remove.mockRejectedValue(new Error('not found'));
    const { result } = renderHook(() => useVoiceCloning());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.remove('a'); });
    expect(result.current.voices).toHaveLength(1);
    expect(mocks.notify.error).toHaveBeenCalled();
  });

  it('tracks busy while creating or removing', async () => {
    let resolveCreate: (v: unknown) => void = () => undefined;
    mocks.create.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    const { result } = renderHook(() => useVoiceCloning());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let pending: Promise<string | null> | undefined;
    act(() => {
      pending = result.current.create({ name: 'b', consentChallengeId: 'c', gender: 'male', sample: new Blob(['a']), consentRecording: new Blob(['b']) });
    });
    expect(result.current.busy).toBe(true);
    await act(async () => { resolveCreate(voice('b')); await pending; });
    expect(result.current.busy).toBe(false);
  });
});
