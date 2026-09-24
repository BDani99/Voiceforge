import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { queryMock } from '../test/queryMock';
import { sortEntries, toReplacementText, useDictionary, type DictionaryEntry } from './useDictionary';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('../services/supabase', () => ({
  supabase: { from: mocks.from, auth: { getUser: mocks.getUser } },
}));
vi.mock('../utils/notificationService', () => ({ notify: mocks.notify }));

const entry = (id: string, original_word: string, replacement_word: string): DictionaryEntry => ({
  id,
  original_word,
  replacement_word,
  user_id: 'u1',
  created_at: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('sortEntries / toReplacementText', () => {
  it('orders deterministically so the audio cache key does not depend on row order', () => {
    const rows = [entry('2', 'SQL', 'sequel'), entry('1', 'GIF', 'jif')];
    expect(toReplacementText(sortEntries(rows))).toBe('GIF -> jif\nSQL -> sequel');
    expect(toReplacementText(sortEntries([...rows].reverse()))).toBe('GIF -> jif\nSQL -> sequel');
  });
});

describe('useDictionary', () => {
  it('loads the user\'s entries and reports them as replacement text', async () => {
    mocks.from.mockReturnValue(queryMock({ data: [entry('2', 'SQL', 'sequel'), entry('1', 'GIF', 'jif')] }).builder);
    const onChange = vi.fn();

    const { result } = renderHook(() => useDictionary(onChange));
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries.map((e) => e.original_word)).toEqual(['GIF', 'SQL']);
    expect(onChange).toHaveBeenLastCalledWith('GIF -> jif\nSQL -> sequel');
  });

  it('warns and does not report anything when loading fails', async () => {
    mocks.from.mockReturnValue(queryMock({ error: { message: 'boom' } }).builder);
    const onChange = vi.fn();

    const { result } = renderHook(() => useDictionary(onChange));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mocks.notify.error).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds an entry and reports the new text', async () => {
    const created = entry('3', 'API', 'A P I');
    mocks.from
      .mockReturnValueOnce(queryMock({ data: [] }).builder) // initial load
      .mockReturnValueOnce(queryMock({ data: created }).builder); // insert
    const onChange = vi.fn();
    const { result } = renderHook(() => useDictionary(onChange));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let added = false;
    await act(async () => {
      added = await result.current.addEntry('API', 'A P I');
    });

    expect(added).toBe(true);
    expect(result.current.entries).toEqual([created]);
    expect(onChange).toHaveBeenLastCalledWith('API -> A P I');
    expect(mocks.notify.success).toHaveBeenCalledWith('Word added to dictionary');
  });

  it('keeps the list unchanged when adding fails', async () => {
    mocks.from
      .mockReturnValueOnce(queryMock({ data: [entry('1', 'GIF', 'jif')] }).builder)
      .mockReturnValueOnce(queryMock({ error: { message: 'duplicate' } }).builder);
    const { result } = renderHook(() => useDictionary(vi.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let added = true;
    await act(async () => {
      added = await result.current.addEntry('GIF', 'gif');
    });

    expect(added).toBe(false);
    expect(result.current.entries).toHaveLength(1);
    expect(mocks.notify.error).toHaveBeenCalled();
  });

  it('deletes an entry and reports the remaining text', async () => {
    mocks.from
      .mockReturnValueOnce(queryMock({ data: [entry('1', 'GIF', 'jif'), entry('2', 'SQL', 'sequel')] }).builder)
      .mockReturnValueOnce(queryMock({}).builder);
    const onChange = vi.fn();
    const { result } = renderHook(() => useDictionary(onChange));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteEntry('1');
    });

    expect(result.current.entries.map((e) => e.id)).toEqual(['2']);
    expect(onChange).toHaveBeenLastCalledWith('SQL -> sequel');
  });
});
