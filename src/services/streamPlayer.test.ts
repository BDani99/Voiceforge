import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamPlayer } from './streamPlayer';

/** A stand-in for the Web Audio API with a clock we control. */
class FakeContext {
  static instances: FakeContext[] = [];
  currentTime = 0;
  state: 'running' | 'suspended' | 'closed' = 'suspended';
  destination = {};
  sources: FakeSource[] = [];
  buffers: { length: number; sampleRate: number; duration: number; data: Float32Array | null; copyToChannel: (d: Float32Array) => void }[] = [];
  constructor(public options: { sampleRate: number }) {
    FakeContext.instances.push(this);
  }
  resume = vi.fn(() => { this.state = 'running'; return Promise.resolve(); });
  suspend = vi.fn(() => { this.state = 'suspended'; return Promise.resolve(); });
  close = vi.fn(() => { this.state = 'closed'; return Promise.resolve(); });
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const buffer = { length, sampleRate, duration: length / sampleRate, data: null as Float32Array | null, copyToChannel(d: Float32Array) { this.data = d; } };
    this.buffers.push(buffer);
    return buffer;
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
}

class FakeSource {
  buffer: unknown = null;
  startedAt: number | null = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn((when: number) => { this.startedAt = when; });
  /** The sound of this chunk is over. */
  finish() {
    this.onended?.();
  }
}

/** `n` samples of 16-bit PCM. */
const chunk = (samples: number) => new Uint8Array(samples * 2);
const context = () => FakeContext.instances[FakeContext.instances.length - 1]!;

beforeEach(() => {
  FakeContext.instances = [];
  vi.stubGlobal('AudioContext', FakeContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StreamPlayer', () => {
  it('is supported when the browser has Web Audio', () => {
    expect(StreamPlayer.isSupported()).toBe(true);
    vi.stubGlobal('AudioContext', undefined);
    expect(StreamPlayer.isSupported()).toBe(false);
  });

  it('creates the audio context at the stream sample rate and starts it', () => {
    new StreamPlayer();
    expect(context().options.sampleRate).toBe(24000);
    expect(context().resume).toHaveBeenCalled();
  });

  it('schedules every chunk right behind the previous one (gapless)', () => {
    const player = new StreamPlayer();
    player.push(chunk(2400)); // 100 ms
    player.push(chunk(4800)); // 200 ms
    player.push(chunk(2400));

    const [a, b, c] = context().sources;
    expect(a?.startedAt).toBeCloseTo(0.05, 5); // a short head start
    expect(b?.startedAt).toBeCloseTo(0.15, 5);
    expect(c?.startedAt).toBeCloseTo(0.35, 5);
  });

  it('starts a late chunk right away instead of in the past', () => {
    const player = new StreamPlayer();
    player.push(chunk(2400));
    context().currentTime = 5; // the data arrived long after the first chunk was played
    player.push(chunk(2400));
    expect(context().sources[1]?.startedAt).toBeCloseTo(5.05, 5);
  });

  it('converts the samples to floats', () => {
    const player = new StreamPlayer();
    player.push(new Uint8Array([0x00, 0x40])); // 16384
    expect(context().buffers[0]?.data?.[0]).toBeCloseTo(0.5, 5);
  });

  it('ignores empty chunks and data after end or stop', () => {
    const player = new StreamPlayer();
    player.push(new Uint8Array(0));
    player.push(new Uint8Array(1)); // less than one sample
    expect(context().sources).toHaveLength(0);

    player.end();
    player.push(chunk(100));
    expect(context().sources).toHaveLength(0);
  });

  describe('position and length', () => {
    it('follows the clock and stands still while paused', () => {
      const player = new StreamPlayer();
      player.push(chunk(24000)); // 1 s, starts at 0.05
      player.push(chunk(24000)); // 1 s, starts at 1.05

      expect(player.currentTime).toBe(0); // before the first chunk starts
      context().currentTime = 0.55;
      expect(player.currentTime).toBeCloseTo(0.5, 5);
      context().currentTime = 1.55;
      expect(player.currentTime).toBeCloseTo(1.5, 5);
      context().currentTime = 99; // past everything
      expect(player.currentTime).toBeCloseTo(2, 5);
    });

    it('stays on the audio position when a late chunk leaves a gap in time', () => {
      const player = new StreamPlayer();
      player.push(chunk(24000)); // audio 0..1 s at 0.05
      context().currentTime = 3;
      player.push(chunk(24000)); // audio 1..2 s, but starts at 3.05
      context().currentTime = 3.55;
      expect(player.currentTime).toBeCloseTo(1.5, 5);
    });

    it('has no length until the stream is complete', () => {
      const player = new StreamPlayer();
      player.push(chunk(48000));
      expect(player.duration).toBeNaN();
      player.end();
      expect(player.duration).toBeCloseTo(2, 5);
    });

    it('cannot be moved while streaming', () => {
      const player = new StreamPlayer();
      player.push(chunk(24000));
      player.currentTime = 0.9;
      expect(player.currentTime).toBe(0);
    });
  });

  describe('the end', () => {
    it('fires when everything received has played after end()', () => {
      const player = new StreamPlayer();
      const onended = vi.fn();
      player.onended = onended;
      player.push(chunk(2400));
      player.push(chunk(2400));

      context().sources[0]?.finish();
      player.end();
      expect(onended).not.toHaveBeenCalled(); // one chunk is still playing
      context().sources[1]?.finish();
      expect(onended).toHaveBeenCalledTimes(1);
    });

    it('does not fire before end(), even when everything so far has played (more may come)', () => {
      const player = new StreamPlayer();
      const onended = vi.fn();
      player.onended = onended;
      player.push(chunk(2400));
      context().sources[0]?.finish();
      expect(onended).not.toHaveBeenCalled();
      player.end();
      expect(onended).toHaveBeenCalledTimes(1);
    });

    it('fires once, immediately when nothing is left', () => {
      const player = new StreamPlayer();
      const onended = vi.fn();
      player.onended = onended;
      player.end();
      player.end();
      expect(onended).toHaveBeenCalledTimes(1);
    });
  });

  describe('control', () => {
    it('pauses and resumes the clock', async () => {
      const player = new StreamPlayer();
      player.pause();
      expect(context().suspend).toHaveBeenCalled();
      await player.play();
      expect(context().resume).toHaveBeenCalledTimes(2); // once at the start
    });

    it('stops for good: releases the device, drops later data and never fires the end', () => {
      const player = new StreamPlayer();
      const onended = vi.fn();
      player.onended = onended;
      player.push(chunk(2400));

      player.stop();
      player.stop();
      expect(context().close).toHaveBeenCalledTimes(1);

      player.push(chunk(2400));
      expect(context().sources).toHaveLength(1);
      context().sources[0]?.finish();
      player.end();
      expect(onended).not.toHaveBeenCalled();
    });
  });
});
