import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { queryMock } from '../test/queryMock';
import { usePresets } from './usePresets';
import type { PresetSettings } from '../types/models';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('../services/supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc, auth: { getUser: mocks.getUser } } }));
vi.mock('../utils/notificationService', () => ({ notify: mocks.notify }));

const row = (id: string, name: string, patch: Record<string, unknown> = {}) => ({
  id, name, user_id: 'u1', settings: { voice: id }, is_default: false, created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z', ...patch,
});

const current: PresetSettings = { voice: 'current', emotion: 'calm' };

/** The `from('presets')` call answers with the next queued result. */
function queue(...results: { data?: unknown; error?: unknown }[]) {
  const mocksList = results.map((r) => queryMock(r));
  mocksList.forEach((m) => mocks.from.mockReturnValueOnce(m.builder));
  return mocksList;
}

const setup = async (rows: unknown[], options: Partial<Parameters<typeof usePresets>[0]> = {}) => {
  const onApply = vi.fn();
  const load = queue({ data: rows })[0]!;
  const hook = renderHook((props: Parameters<typeof usePresets>[0]) => usePresets(props), {
    initialProps: { current, onApply, autoApplyDefault: false, ...options },
  });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return { ...hook, onApply, load };
};

describe('usePresets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it('loads the presets of the user: default first, then by name', async () => {
    const { result, load } = await setup([row('b', 'Beta'), row('a', 'Alpha'), row('c', 'Zed', { is_default: true })]);
    expect(result.current.presets.map((p) => p.name)).toEqual(['Zed', 'Alpha', 'Beta']);
    expect(load.argsOf('eq')).toEqual(['user_id', 'u1']);
  });

  it('forgets a remembered active preset that no longer exists', async () => {
    localStorage.setItem('voiceforge_activePresetId', 'gone');
    const { result } = await setup([row('a', 'Alpha')]);
    expect(result.current.activeId).toBeNull();
  });

  it('applies a preset, remembers it and detects later changes', async () => {
    const { result, onApply, rerender } = await setup([row('a', 'Alpha', { settings: { voice: 'a' } })]);

    act(() => result.current.apply('a'));
    expect(onApply).toHaveBeenCalledWith({ voice: 'a' });
    expect(result.current.activeId).toBe('a');
    expect(localStorage.getItem('voiceforge_activePresetId')).toBe('a');
    expect(result.current.isModified).toBe(true); // `current` differs

    rerender({ current: { voice: 'a' }, onApply, autoApplyDefault: false });
    expect(result.current.isModified).toBe(false);
  });

  it('applies the default preset once when allowed', async () => {
    const { onApply, rerender } = await setup([row('a', 'Alpha'), row('d', 'Default', { is_default: true })], { autoApplyDefault: false });
    expect(onApply).not.toHaveBeenCalled();

    rerender({ current, onApply, autoApplyDefault: true });
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ voice: 'd' }));

    rerender({ current, onApply, autoApplyDefault: false });
    rerender({ current, onApply, autoApplyDefault: true });
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('creates a preset from the current setup', async () => {
    const { result } = await setup([]);
    const insert = queue({ data: row('n', 'New one', { settings: current }) })[0]!;

    let error: string | null = 'unset';
    await act(async () => { error = await result.current.create('  New one '); });

    expect(error).toBeNull();
    expect(insert.argsOf('insert')?.[0]).toMatchObject({ user_id: 'u1', name: 'New one', settings: current });
    expect(result.current.presets.map((p) => p.name)).toEqual(['New one']);
    expect(result.current.activeId).toBe('n');
  });

  it('rejects an empty or duplicate name without touching the database', async () => {
    const { result } = await setup([row('a', 'Alpha')]);
    let empty: string | null = null;
    let duplicate: string | null = null;
    await act(async () => {
      empty = await result.current.create('   ');
      duplicate = await result.current.create(' alpha ');
    });
    expect(empty).toBeTruthy();
    expect(duplicate).toMatch(/already/);
    expect(mocks.from).toHaveBeenCalledTimes(1); // only the initial load
  });

  it('explains a unique-name violation from the database', async () => {
    const { result } = await setup([]);
    queue({ error: { code: '23505', message: 'duplicate key' } });
    let error: string | null = null;
    await act(async () => { error = await result.current.create('Race'); });
    expect(error).toBe('The preset could not be saved.');
    expect(result.current.presets).toEqual([]);
  });

  it('overwrites a preset with the current setup', async () => {
    const { result } = await setup([row('a', 'Alpha')]);
    const update = queue({ data: row('a', 'Alpha', { settings: current }) })[0]!;
    await act(async () => { await result.current.overwrite('a'); });
    expect(update.argsOf('update')?.[0]).toEqual({ settings: current });
    expect(result.current.presets[0]?.settings).toMatchObject({ voice: 'current' });
  });

  it('renames a preset and validates the name', async () => {
    const { result } = await setup([row('a', 'Alpha'), row('b', 'Beta')]);
    let taken: string | null = null;
    await act(async () => { taken = await result.current.rename('a', 'beta'); });
    expect(taken).toMatch(/already/);

    queue({ data: row('a', 'Gamma') });
    let ok: string | null = 'unset';
    await act(async () => { ok = await result.current.rename('a', 'Gamma'); });
    expect(ok).toBeNull();
    expect(result.current.presets.map((p) => p.name)).toEqual(['Beta', 'Gamma']);
  });

  it('duplicates under a free copy name', async () => {
    const { result } = await setup([row('a', 'Alpha')]);
    const insert = queue({ data: row('c', 'Alpha copy') })[0]!;
    await act(async () => { await result.current.duplicate('a'); });
    expect(insert.argsOf('insert')?.[0]).toMatchObject({ name: 'Alpha copy' });
    expect(result.current.presets).toHaveLength(2);
  });

  it('deletes a preset and forgets it when it was the active one', async () => {
    const { result } = await setup([row('a', 'Alpha')]);
    act(() => result.current.apply('a'));
    queue({});
    await act(async () => { await result.current.remove('a'); });
    expect(result.current.presets).toEqual([]);
    expect(result.current.activeId).toBeNull();
    expect(localStorage.getItem('voiceforge_activePresetId')).toBeNull();
  });

  it('keeps the list when a delete fails', async () => {
    const { result } = await setup([row('a', 'Alpha')]);
    queue({ error: { message: 'rls' } });
    await act(async () => { await result.current.remove('a'); });
    expect(result.current.presets).toHaveLength(1);
    expect(mocks.notify.error).toHaveBeenCalled();
  });

  it('sets and removes the default through the database function', async () => {
    const { result } = await setup([row('a', 'Alpha'), row('b', 'Beta', { is_default: true })]);

    await act(async () => { await result.current.setDefault('a'); });
    expect(mocks.rpc).toHaveBeenCalledWith('set_default_preset', { p_preset_id: 'a' });
    expect(result.current.presets.map((p) => [p.name, p.isDefault])).toEqual([['Alpha', true], ['Beta', false]]);

    await act(async () => { await result.current.setDefault(null); });
    expect(result.current.presets.some((p) => p.isDefault)).toBe(false);
  });

  it('does not change the default when the database function fails', async () => {
    const { result } = await setup([row('a', 'Alpha')]);
    mocks.rpc.mockResolvedValueOnce({ error: { message: 'boom' } });
    await act(async () => { await result.current.setDefault('a'); });
    expect(result.current.presets[0]?.isDefault).toBe(false);
  });
});
