import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePreviewPlayer } from './usePreviewPlayer';

const mocks = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock('../utils/notificationService', () => ({ notify: { warning: mocks.warning, error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

class FakeAudio {
  static instances: FakeAudio[] = [];
  static playResult: Promise<void> = Promise.resolve();
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }
  play() {
    return FakeAudio.playResult;
  }
  pause() {
    this.paused = true;
  }
}

describe('usePreviewPlayer', () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    FakeAudio.playResult = Promise.resolve();
    mocks.warning.mockClear();
    vi.stubGlobal('Audio', FakeAudio);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads a sample, then plays it', async () => {
    const { result } = renderHook(() => usePreviewPlayer());
    await act(() => result.current.toggle('a', 'https://cdn/a.mp3'));
    expect(result.current).toMatchObject({ playingKey: 'a', status: 'loading' });

    act(() => FakeAudio.instances[0]?.onplaying?.());
    expect(result.current.status).toBe('playing');

    act(() => FakeAudio.instances[0]?.onended?.());
    expect(result.current).toMatchObject({ playingKey: null, status: 'idle' });
  });

  it('stops when the playing sample is toggled again', async () => {
    const { result } = renderHook(() => usePreviewPlayer());
    await act(() => result.current.toggle('a', 'https://cdn/a.mp3'));
    await act(() => result.current.toggle('a', 'https://cdn/a.mp3'));
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0]?.paused).toBe(true);
    expect(result.current.playingKey).toBeNull();
  });

  it('starting another sample stops the first and ignores its late events', async () => {
    const { result } = renderHook(() => usePreviewPlayer());
    await act(() => result.current.toggle('a', 'https://cdn/a.mp3'));
    await act(() => result.current.toggle('b', 'https://cdn/b.mp3'));
    const [first, second] = FakeAudio.instances;
    expect(first?.paused).toBe(true);
    expect(result.current.playingKey).toBe('b');

    act(() => first?.onplaying?.());
    expect(result.current).toMatchObject({ playingKey: 'b', status: 'loading' });
    act(() => second?.onplaying?.());
    expect(result.current.status).toBe('playing');
  });

  it('warns and resets when the sample cannot be played', async () => {
    FakeAudio.playResult = Promise.reject(new Error('blocked'));
    const { result } = renderHook(() => usePreviewPlayer());
    await act(() => result.current.toggle('a', 'https://cdn/a.mp3'));
    expect(mocks.warning).toHaveBeenCalledWith('This sample could not be played.');
    expect(result.current.playingKey).toBeNull();
  });

  it('stops the sample when the component goes away', async () => {
    const { result, unmount } = renderHook(() => usePreviewPlayer());
    await act(() => result.current.toggle('a', 'https://cdn/a.mp3'));
    unmount();
    expect(FakeAudio.instances[0]?.paused).toBe(true);
  });
});
