import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMediaRecorder } from './useMediaRecorder';

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = vi.fn(() => true);
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: MediaStream, public options?: { mimeType?: string }) {
    if (options?.mimeType) this.mimeType = options.mimeType;
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['chunk']) });
    this.onstop?.();
  }
}

const fakeTrack = () => ({ stop: vi.fn() });
const fakeStream = () => ({ getTracks: vi.fn(() => [fakeTrack(), fakeTrack()]) }) as unknown as MediaStream;

const current = () => FakeRecorder.instances[FakeRecorder.instances.length - 1]!;

beforeEach(() => {
  FakeRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) } });
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaRecorder', () => {
  it('records and produces a playable clip', async () => {
    const { result } = renderHook(() => useMediaRecorder());
    await act(async () => { await result.current.start(); });
    expect(result.current.status).toBe('recording');

    act(() => result.current.stop());
    expect(result.current.status).toBe('stopped');
    expect(result.current.clip).toMatchObject({ url: 'blob:fake' });
    expect(result.current.clip?.blob).toBeInstanceOf(Blob);
  });

  it('releases the microphone tracks when recording stops', async () => {
    const track = fakeTrack();
    const stream = { getTracks: vi.fn(() => [track]) } as unknown as MediaStream;
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });

    const { result } = renderHook(() => useMediaRecorder());
    await act(async () => { await result.current.start(); });
    act(() => result.current.stop());
    expect(track.stop).toHaveBeenCalled();
  });

  it('reports denied microphone access', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) } });
    const { result } = renderHook(() => useMediaRecorder());
    await act(async () => { await result.current.start(); });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/denied/);
  });

  it('reports a browser with no recording support', async () => {
    vi.stubGlobal('navigator', {});
    const { result } = renderHook(() => useMediaRecorder());
    await act(async () => { await result.current.start(); });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/cannot record/);
  });

  it('tracks elapsed time while recording', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMediaRecorder());
    await act(async () => { await result.current.start(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(300);
    vi.useRealTimers();
  });

  it('starting again releases the previous clip and microphone', async () => {
    const { result } = renderHook(() => useMediaRecorder());
    await act(async () => { await result.current.start(); });
    act(() => result.current.stop());
    const firstUrl = result.current.clip?.url;

    await act(async () => { await result.current.start(); });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstUrl);
    expect(result.current.status).toBe('recording');
  });

  it('reset clears everything and stops an active recording', async () => {
    const { result } = renderHook(() => useMediaRecorder());
    await act(async () => { await result.current.start(); });
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.clip).toBeNull();
    expect(current().state).toBe('inactive');
  });

  it('reports a recorder error', async () => {
    const { result } = renderHook(() => useMediaRecorder());
    await act(async () => { await result.current.start(); });
    act(() => current().onerror?.());
    expect(result.current.status).toBe('error');
  });

  it('releases the microphone when the component unmounts while recording', async () => {
    const track = fakeTrack();
    const stream = { getTracks: vi.fn(() => [track]) } as unknown as MediaStream;
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    const { result, unmount } = renderHook(() => useMediaRecorder());
    await act(async () => { await result.current.start(); });
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it('picks a supported mime type', async () => {
    const { result } = renderHook(() => useMediaRecorder());
    await act(async () => { await result.current.start(); });
    await waitFor(() => expect(FakeRecorder.instances).toHaveLength(1));
    expect(current().options?.mimeType).toBe('audio/webm;codecs=opus');
  });
});
