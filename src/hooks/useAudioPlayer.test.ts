import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAudioPlayer } from './useAudioPlayer';
import type { Paragraph } from '../types/models';

const mocks = vi.hoisted(() => ({ concatenateAudio: vi.fn(), fetchAudioBlob: vi.fn() }));

vi.mock('../utils/audioProcessing', () => ({ concatenateAudio: mocks.concatenateAudio }));
vi.mock('../services/audioStorage', () => ({ fetchAudioBlob: mocks.fetchAudioBlob }));

class FakeAudio {
  static instances: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = true;
  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  /** Simulates the browser reaching the end of the clip. */
  finish() {
    this.onended?.();
  }
}

const paragraph = (id: string, text: string, audioBlob: Blob | null = new Blob([id])): Paragraph => ({
  id,
  text,
  audioBlob,
  audioUrl: null,
  isGenerated: !!audioBlob,
  wasCached: false,
});

interface Setup {
  paragraphs?: Paragraph[];
  gap?: boolean;
  confirmAnswer?: boolean;
}

function setup({ paragraphs = [paragraph('a', 'One'), paragraph('b', 'Two')], gap = false, confirmAnswer = true }: Setup = {}) {
  const generateParagraphAudio = vi.fn((index: number) => Promise.resolve(new Blob([`generated-${index}`])));
  const setError = vi.fn();
  const setIsLoading = vi.fn();
  const showConfirm = vi.fn(() => Promise.resolve(confirmAnswer));

  const props = {
    paragraphs,
    settings: { useParagraphGap: gap, paragraphGapPause: 500, useFadeTransitions: false },
  };
  const rendered = renderHook(
    ({ paragraphs: p, settings }) =>
      useAudioPlayer({ paragraphs: p, generateParagraphAudio, setError }, settings, setIsLoading, showConfirm),
    { initialProps: props },
  );
  return { ...rendered, props, generateParagraphAudio, setError, setIsLoading, showConfirm };
}

const flush = () => act(async () => { await Promise.resolve(); });
const current = () => FakeAudio.instances[FakeAudio.instances.length - 1]!;

beforeEach(() => {
  FakeAudio.instances = [];
  vi.stubGlobal('Audio', FakeAudio);
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('handlePlayAll', () => {
  it('reports when there is nothing to play', () => {
    const { result, setError } = setup({ paragraphs: [paragraph('a', '  ')] });
    act(() => result.current.handlePlayAll());
    expect(setError).toHaveBeenCalledWith('No paragraphs to play!');
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('plays the paragraphs one after another and stops at the end', async () => {
    const { result } = setup();

    act(() => result.current.handlePlayAll());
    await flush();
    expect(result.current.isPlayingAll).toBe(true);
    expect(result.current.currentPlayingIndex).toBe(0);
    expect(FakeAudio.instances).toHaveLength(1);

    await act(async () => current().finish());
    await flush();
    expect(result.current.currentPlayingIndex).toBe(1);
    expect(FakeAudio.instances).toHaveLength(2);

    await act(async () => current().finish());
    await flush();
    expect(result.current.isPlaying).toBe(false);
    expect(FakeAudio.instances).toHaveLength(2);
  });

  it('skips paragraphs without text', async () => {
    const { result } = setup({ paragraphs: [paragraph('a', 'One'), paragraph('b', ''), paragraph('c', 'Three')] });
    act(() => result.current.handlePlayAll());
    await flush();
    await act(async () => current().finish());
    await flush();
    expect(result.current.currentPlayingIndex).toBe(2);
  });

  it('waits for the configured gap between paragraphs', async () => {
    vi.useFakeTimers();
    const { result } = setup({ gap: true });

    act(() => result.current.handlePlayAll());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => current().finish());
    expect(FakeAudio.instances).toHaveLength(1); // gap running

    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(FakeAudio.instances).toHaveLength(2);
  });

  it('generates audio that does not exist yet', async () => {
    const { result, generateParagraphAudio } = setup({ paragraphs: [paragraph('a', 'One', null)] });
    act(() => result.current.handlePlayAll());
    await flush();
    expect(generateParagraphAudio).toHaveBeenCalledWith(0, false);
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it('downloads stored audio instead of regenerating it', async () => {
    mocks.fetchAudioBlob.mockResolvedValue(new Blob(['stored']));
    const stored: Paragraph = { ...paragraph('a', 'One', null), audioUrl: 'https://cdn/x.wav', isGenerated: true };
    const { result, generateParagraphAudio } = setup({ paragraphs: [stored] });

    act(() => result.current.handlePlayAll());
    await flush();

    expect(mocks.fetchAudioBlob).toHaveBeenCalledWith('https://cdn/x.wav');
    expect(generateParagraphAudio).not.toHaveBeenCalled();
  });

  it('falls back to generating when the stored audio cannot be downloaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.fetchAudioBlob.mockRejectedValue(new Error('404'));
    const stored: Paragraph = { ...paragraph('a', 'One', null), audioUrl: 'https://cdn/x.wav', isGenerated: true };
    const { result, generateParagraphAudio } = setup({ paragraphs: [stored] });

    act(() => result.current.handlePlayAll());
    await flush();

    expect(generateParagraphAudio).toHaveBeenCalledWith(0, false);
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it('uses the latest paragraphs when a clip ends (regression: it used a stale render)', async () => {
    const { result, rerender, props, generateParagraphAudio } = setup({
      paragraphs: [paragraph('a', 'One'), paragraph('b', 'Two', null)],
    });

    act(() => result.current.handlePlayAll());
    await flush();
    // While the first clip plays, the second paragraph finishes generating elsewhere.
    rerender({ ...props, paragraphs: [paragraph('a', 'One'), paragraph('b', 'Two', new Blob(['ready']))] });
    generateParagraphAudio.mockClear();

    await act(async () => current().finish());
    await flush();

    expect(generateParagraphAudio).not.toHaveBeenCalled();
    expect(result.current.currentPlayingIndex).toBe(1);
  });

  it('pauses and resumes', async () => {
    const { result } = setup();
    act(() => result.current.handlePlayAll());
    await flush();

    act(() => result.current.handlePlayAll()); // pause
    expect(current().pause).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);

    act(() => result.current.handlePlayAll()); // resume
    expect(current().play).toHaveBeenCalledTimes(2);
    expect(result.current.isPlaying).toBe(true);
  });
});

describe('single paragraph and skipping', () => {
  it('plays only the requested paragraph', async () => {
    const { result } = setup();
    await act(async () => { await result.current.handlePlayParagraph(1); });
    await flush();
    expect(result.current.currentPlayingIndex).toBe(1);

    await act(async () => current().finish());
    await flush();
    expect(FakeAudio.instances).toHaveLength(1);
    expect(result.current.isPlaying).toBe(false);
  });

  it('skips to a paragraph and continues from there', async () => {
    const { result } = setup({ paragraphs: [paragraph('a', 'One'), paragraph('b', 'Two'), paragraph('c', 'Three')] });
    act(() => result.current.skipToParagraph(1));
    await flush();
    expect(result.current.currentPlayingIndex).toBe(1);

    await act(async () => current().finish());
    await flush();
    expect(result.current.currentPlayingIndex).toBe(2);
  });

  it('stops playback, releases the audio and resets the state', async () => {
    const { result } = setup();
    act(() => result.current.handlePlayAll());
    await flush();

    act(() => result.current.resetAudioPlayer());

    expect(current().pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(result.current.currentPlayingIndex).toBe(-1);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.getGlobalAudio()).toBeNull();
  });

  it('reports a playback error and moves on', async () => {
    const { result, setError } = setup();
    act(() => result.current.handlePlayAll());
    await flush();

    await act(async () => current().onerror?.());
    await flush();

    expect(setError).toHaveBeenCalledWith('Error playing paragraph 1');
    expect(result.current.currentPlayingIndex).toBe(1);
  });
});

describe('handleExportAll', () => {
  beforeEach(() => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    mocks.concatenateAudio.mockResolvedValue(new Blob(['all'], { type: 'audio/wav' }));
  });

  it('asks for confirmation and does nothing when declined', async () => {
    const { result, showConfirm, setIsLoading } = setup({ confirmAnswer: false });
    await act(async () => { await result.current.handleExportAll(); });

    expect(showConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Export Audio' }));
    expect(setIsLoading).not.toHaveBeenCalled();
    expect(mocks.concatenateAudio).not.toHaveBeenCalled();
  });

  it('joins all paragraphs with the paragraph gap and downloads a file with a matching extension', async () => {
    const { result, setIsLoading } = setup({ gap: true });
    await act(async () => { await result.current.handleExportAll(); });

    expect(mocks.concatenateAudio).toHaveBeenCalledWith([expect.any(Blob), expect.any(Blob)], 500);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(setIsLoading).toHaveBeenLastCalledWith(false);
  });

  it('generates missing paragraphs first', async () => {
    const { result, generateParagraphAudio } = setup({ paragraphs: [paragraph('a', 'One', null), paragraph('b', 'Two')] });
    await act(async () => { await result.current.handleExportAll(); });
    expect(generateParagraphAudio).toHaveBeenCalledWith(0, false);
    expect(generateParagraphAudio).toHaveBeenCalledTimes(1);
  });

  it('reports failures and always ends the loading state', async () => {
    mocks.concatenateAudio.mockRejectedValue(new Error('decode failed'));
    const { result, setError, setIsLoading } = setup();
    await act(async () => { await result.current.handleExportAll(); });

    expect(setError).toHaveBeenLastCalledWith('Export failed: decode failed');
    expect(setIsLoading).toHaveBeenLastCalledWith(false);
  });

  it('fails clearly when no audio could be produced', async () => {
    const { result, setError, generateParagraphAudio } = setup({ paragraphs: [paragraph('a', 'One', null)] });
    generateParagraphAudio.mockResolvedValue(null as unknown as Blob);
    await act(async () => { await result.current.handleExportAll(); });
    expect(setError).toHaveBeenLastCalledWith('Export failed: No audio generated');
  });
});
