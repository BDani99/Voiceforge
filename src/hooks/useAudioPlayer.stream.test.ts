import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAudioPlayer } from './useAudioPlayer';
import type { Paragraph } from '../types/models';
import type { StreamCallbacks } from '../services/speechStream';

const mocks = vi.hoisted(() => ({ supported: { value: true } }));

vi.mock('../utils/audioProcessing', () => ({ concatenateAudio: vi.fn() }));
vi.mock('../services/audioStorage', () => ({ fetchAudioBlob: vi.fn() }));
vi.mock('../services/streamPlayer', () => {
  class FakeStreamPlayer {
    static instances: FakeStreamPlayer[] = [];
    static isSupported = () => mocks.supported.value;
    onended: (() => void) | null = null;
    pushed: Uint8Array[] = [];
    ended = false;
    stopped = false;
    paused = false;
    currentTime = 0;
    duration = Number.NaN;
    constructor() {
      FakeStreamPlayer.instances.push(this);
    }
    push(pcm: Uint8Array) {
      if (!this.stopped) this.pushed.push(pcm);
    }
    end() {
      this.ended = true;
      this.duration = 2;
    }
    pause() {
      this.paused = true;
    }
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    stop() {
      this.stopped = true;
      this.onended = null;
    }
    /** All queued audio has been played. */
    finishPlaying() {
      this.onended?.();
    }
  }
  return { StreamPlayer: FakeStreamPlayer };
});

interface FakePlayer {
  pushed: Uint8Array[];
  ended: boolean;
  stopped: boolean;
  paused: boolean;
  finishPlaying: () => void;
}

const { StreamPlayer } = await import('../services/streamPlayer');
const fakePlayers = StreamPlayer as unknown as { instances: FakePlayer[] };
const players = (): FakePlayer[] => fakePlayers.instances;

class FakeAudio {
  static instances: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onloadedmetadata: (() => void) | null = null;
  currentTime = 0;
  duration = 5;
  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
}

const paragraph = (id: string, text: string, generated = false): Paragraph => ({
  id, text, audioBlob: generated ? new Blob([id]) : null, audioUrl: null, isGenerated: generated, wasCached: false,
  emotion: '', segments: [], marks: [], speechMarks: null,
});

type Generate = (index: number, force?: boolean, stream?: StreamCallbacks) => Promise<Blob | null>;

function setup(paragraphs: Paragraph[], generate: Generate, { streaming = true } = {}) {
  const generateParagraphAudio = vi.fn(generate);
  const setError = vi.fn();
  const props = { paragraphs, settings: { useParagraphGap: false, paragraphGapPause: 0, useFadeTransitions: false, streamingEnabled: streaming } };
  const rendered = renderHook(
    ({ paragraphs: p, settings }) => useAudioPlayer({ paragraphs: p, generateParagraphAudio, setError }, settings, vi.fn(), vi.fn(() => Promise.resolve(true))),
    { initialProps: props },
  );
  return { ...rendered, props, generateParagraphAudio, setError };
}

const flush = () => act(async () => { await Promise.resolve(); });
const pcm = (...bytes: number[]) => new Uint8Array(bytes);

beforeEach(() => {
  fakePlayers.instances.length = 0;
  FakeAudio.instances = [];
  mocks.supported.value = true;
  vi.stubGlobal('Audio', FakeAudio);
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A generation that delivers audio in two chunks and then finishes when told to. */
function streamingGenerate() {
  let finish: (blob: Blob) => void = () => undefined;
  const done = new Promise<Blob>((resolve) => { finish = resolve; });
  const generate: Generate = async (_index, _force, stream) => {
    stream?.onAudio(pcm(1, 2));
    stream?.onAudio(pcm(3, 4));
    return done;
  };
  return { generate, finish: (blob = new Blob(['final'])) => finish(blob) };
}

describe('playing while the audio is generated', () => {
  it('starts playing with the first chunk, before the audio is complete', async () => {
    const { generate } = streamingGenerate();
    const { result } = setup([paragraph('a', 'One')], generate);

    await act(async () => { await result.current.handlePlayParagraph(0); });
    await flush();

    expect(players()).toHaveLength(1);
    expect(players()[0]?.pushed).toHaveLength(2);
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.streamingIndex).toBe(0);
    expect(FakeAudio.instances).toHaveLength(0); // no audio element: the stream plays itself
    expect(result.current.getAudioFor(0)).toBe(players()[0]);
  });

  it('asks the generation to stream only when it is allowed and possible', async () => {
    const seen: (StreamCallbacks | undefined)[] = [];
    const generate: Generate = (_i, _f, stream) => { seen.push(stream); return Promise.resolve(new Blob(['x'])); };

    const on = setup([paragraph('a', 'One')], generate);
    await act(async () => { await on.result.current.handlePlayParagraph(0); });
    await flush();
    expect(seen[0]).toBeDefined();

    seen.length = 0;
    const off = setup([paragraph('a', 'One')], generate, { streaming: false });
    await act(async () => { await off.result.current.handlePlayParagraph(0); });
    await flush();
    expect(seen[0]).toBeUndefined();

    seen.length = 0;
    mocks.supported.value = false;
    const unsupported = setup([paragraph('a', 'One')], generate);
    await act(async () => { await unsupported.result.current.handlePlayParagraph(0); });
    await flush();
    expect(seen[0]).toBeUndefined();

    seen.length = 0;
    mocks.supported.value = true;
    const long = setup([paragraph('a', 'x'.repeat(10_001))], generate);
    await act(async () => { await long.result.current.handlePlayParagraph(0); });
    await flush();
    expect(seen[0]).toBeUndefined();

    seen.length = 0;
    FakeAudio.instances = [];
    const generated = setup([paragraph('a', 'One', true)], generate);
    await act(async () => { await generated.result.current.handlePlayParagraph(0); });
    await flush();
    expect(seen).toHaveLength(0); // already generated: played from the file
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it('plays audio that turns out to be cached as a normal file (no chunks arrive)', async () => {
    const { result } = setup([paragraph('a', 'One')], () => Promise.resolve(new Blob(['cached'])));
    await act(async () => { await result.current.handlePlayParagraph(0); });
    await flush();
    expect(players()).toHaveLength(0);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(result.current.streamingIndex).toBe(-1);
  });

  it('keeps playing after the generation finished and ends with the last sound', async () => {
    const { generate, finish } = streamingGenerate();
    const { result } = setup([paragraph('a', 'One')], generate);
    await act(async () => { await result.current.handlePlayParagraph(0); });
    await flush();

    await act(async () => { finish(); });
    await flush();
    expect(players()[0]?.ended).toBe(true);
    expect(result.current.streamingIndex).toBe(-1);
    expect(result.current.isPlaying).toBe(true); // still playing what was received

    await act(async () => players()[0]?.finishPlaying());
    await flush();
    expect(result.current.isPlaying).toBe(false);
    expect(players()[0]?.stopped).toBe(true);
  });

  it('continues with the next paragraph after a streamed one (Play All)', async () => {
    const { generate, finish } = streamingGenerate();
    const paragraphs = [paragraph('a', 'One'), paragraph('b', 'Two', true)];
    const { result } = setup(paragraphs, generate);
    act(() => result.current.handlePlayAll());
    await flush();
    await act(async () => { finish(); });
    await flush();
    await act(async () => players()[0]?.finishPlaying());
    await flush();

    expect(result.current.currentPlayingIndex).toBe(1);
    expect(FakeAudio.instances).toHaveLength(1); // the second one is a normal file
  });

  it('pauses and resumes the live audio', async () => {
    const { generate } = streamingGenerate();
    const { result } = setup([paragraph('a', 'One')], generate);
    await act(async () => { await result.current.handlePlayParagraph(0); });
    await flush();

    await act(async () => { await result.current.handlePlayParagraph(0); }); // pause
    expect(players()[0]?.paused).toBe(true);
    expect(result.current.isPlaying).toBe(false);

    await act(async () => { await result.current.handlePlayParagraph(0); }); // resume
    expect(players()[0]?.paused).toBe(false);
    expect(result.current.isPlaying).toBe(true);
  });

  it('stops the live sound when another paragraph is started, and ignores audio that still arrives', async () => {
    let stream: StreamCallbacks | undefined;
    let finish: (blob: Blob) => void = () => undefined;
    const generate: Generate = (index, _f, callbacks) => {
      if (index === 0) {
        stream = callbacks;
        callbacks?.onAudio(pcm(1, 2));
        return new Promise<Blob>((resolve) => { finish = resolve; });
      }
      return Promise.resolve(new Blob(['other']));
    };
    const { result } = setup([paragraph('a', 'One'), paragraph('b', 'Two', true)], generate);
    await act(async () => { await result.current.handlePlayParagraph(0); });
    await flush();

    await act(async () => { await result.current.handlePlayParagraph(1); });
    await flush();
    expect(players()[0]?.stopped).toBe(true);
    expect(result.current.currentPlayingIndex).toBe(1);

    stream?.onAudio(pcm(5, 6)); // the first paragraph is still being generated in the background
    expect(players()).toHaveLength(1);
    expect(players()[0]?.pushed).toHaveLength(1);

    await act(async () => { finish(new Blob(['late'])); });
    await flush();
    expect(result.current.currentPlayingIndex).toBe(1); // the late result does not take over
  });

  it('does not start a stream when it was paused before the first chunk', async () => {
    let stream: StreamCallbacks | undefined;
    let finish: (blob: Blob) => void = () => undefined;
    const generate: Generate = (_i, _f, callbacks) => {
      stream = callbacks;
      return new Promise<Blob>((resolve) => { finish = resolve; });
    };
    const { result } = setup([paragraph('a', 'One')], generate);
    await act(async () => { await result.current.handlePlayParagraph(0); });
    await flush();
    await act(async () => { await result.current.handlePlayParagraph(0); }); // pause while still waiting

    stream?.onAudio(pcm(1, 2));
    await act(async () => { finish(new Blob(['done'])); });
    await flush();
    expect(players()).toHaveLength(0);
    expect(result.current.isPlaying).toBe(false);
  });

  it('plays what was received when the stream fails, and then moves on', async () => {
    const generate: Generate = (_i, _f, stream) => {
      stream?.onAudio(pcm(1, 2));
      return Promise.resolve(null); // the hook reports the error; there is no complete audio
    };
    const { result } = setup([paragraph('a', 'One')], generate);
    await act(async () => { await result.current.handlePlayParagraph(0); });
    await flush();

    expect(players()[0]?.ended).toBe(true);
    await act(async () => players()[0]?.finishPlaying());
    await flush();
    expect(result.current.isPlaying).toBe(false);
  });

  it('does not stop the stream when the paragraph gets its audio (the state catches up)', async () => {
    const { generate, finish } = streamingGenerate();
    const first = paragraph('a', 'One');
    const { result, rerender, props } = setup([first], generate);
    await act(async () => { await result.current.handlePlayParagraph(0); });
    await flush();

    const finalBlob = new Blob(['final']);
    await act(async () => { finish(finalBlob); });
    rerender({ ...props, paragraphs: [{ ...first, audioBlob: finalBlob, isGenerated: true }] });
    expect(result.current.isPlaying).toBe(true);
    expect(players()[0]?.stopped).toBe(false);
  });

  it('still stops when the text of the streamed paragraph is edited', async () => {
    const { generate } = streamingGenerate();
    const first = paragraph('a', 'One');
    const { result, rerender, props } = setup([first], generate);
    await act(async () => { await result.current.handlePlayParagraph(0); });
    await flush();

    rerender({ ...props, paragraphs: [{ ...first, text: 'One, edited' }] });
    expect(players()[0]?.stopped).toBe(true);
    expect(result.current.isPlaying).toBe(false);
  });

  it('stops the live sound when the page is left', async () => {
    const { generate } = streamingGenerate();
    const { result, unmount } = setup([paragraph('a', 'One')], generate);
    await act(async () => { await result.current.handlePlayParagraph(0); });
    await flush();
    unmount();
    expect(players()[0]?.stopped).toBe(true);
  });
});
