import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { queryMock } from '../test/queryMock';
import { DEFAULT_VOICE_CLONE_COST, useVoiceCloneCost } from './useVoiceCloneCost';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../services/supabase', () => ({ supabase: { from: mocks.from } }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useVoiceCloneCost', () => {
  it('starts with the default and switches to the configured value', async () => {
    mocks.from.mockReturnValue(queryMock({ data: { value: '7500' } }).builder);
    const { result } = renderHook(() => useVoiceCloneCost());
    expect(result.current).toBe(DEFAULT_VOICE_CLONE_COST);
    await waitFor(() => expect(result.current).toBe(7500));
  });

  it('keeps the default when the setting is missing or not a positive number', async () => {
    mocks.from.mockReturnValue(queryMock({ data: null }).builder);
    const missing = renderHook(() => useVoiceCloneCost());
    await waitFor(() => expect(mocks.from).toHaveBeenCalled());
    expect(missing.result.current).toBe(DEFAULT_VOICE_CLONE_COST);

    mocks.from.mockReturnValue(queryMock({ data: { value: 'not-a-number' } }).builder);
    const bad = renderHook(() => useVoiceCloneCost());
    await waitFor(() => expect(mocks.from).toHaveBeenCalled());
    expect(bad.result.current).toBe(DEFAULT_VOICE_CLONE_COST);

    mocks.from.mockReturnValue(queryMock({ data: { value: '-5' } }).builder);
    const negative = renderHook(() => useVoiceCloneCost());
    await waitFor(() => expect(mocks.from).toHaveBeenCalled());
    expect(negative.result.current).toBe(DEFAULT_VOICE_CLONE_COST);
  });
});
