import { STREAM_SAMPLE_RATE, pcmToFloat32 } from '../utils/pcm';
import type { PlaybackSource } from '../types/playback';

/** A little head start, so the first chunk is not late by the time it is scheduled. */
const LEAD_SECONDS = 0.05;

interface Segment {
  /** When the chunk starts, on the clock of the audio context. */
  startedAt: number;
  duration: number;
  /** Where the chunk lies in the audio itself (seconds from its beginning). */
  audioOffset: number;
}

/**
 * Plays raw PCM audio while it is still arriving: every chunk is scheduled right behind the previous
 * one, so the sound is gapless as long as the data arrives at least as fast as it plays.
 */
export class StreamPlayer implements PlaybackSource {
  /** Called when everything that arrived has been played after `end()`. */
  onended: (() => void) | null = null;

  private readonly context: AudioContext;
  private readonly segments: Segment[] = [];
  private nextStart = 0;
  private totalSamples = 0;
  private active = 0;
  private ended = false;
  private finished = false;
  private stopped = false;

  static isSupported(): boolean {
    return typeof AudioContext !== 'undefined';
  }

  constructor(private readonly sampleRate = STREAM_SAMPLE_RATE) {
    this.context = new AudioContext({ sampleRate });
    void this.context.resume().catch(() => undefined);
  }

  /** Queues whole 16-bit samples for playback. */
  push(pcm: Uint8Array): void {
    if (this.stopped || this.ended) return;
    const samples = pcmToFloat32(pcm);
    if (samples.length === 0) return;

    const buffer = this.context.createBuffer(1, samples.length, this.sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);

    // A chunk that arrives too late starts right away: the sound has a gap, its position stays right.
    const startedAt = Math.max(this.nextStart, this.context.currentTime + LEAD_SECONDS);
    this.segments.push({ startedAt, duration: buffer.duration, audioOffset: this.totalSamples / this.sampleRate });
    source.start(startedAt);
    this.nextStart = startedAt + buffer.duration;
    this.totalSamples += samples.length;

    this.active++;
    source.onended = () => {
      this.active--;
      this.checkFinished();
    };
  }

  /** No more audio will come. */
  end(): void {
    this.ended = true;
    this.checkFinished();
  }

  private checkFinished(): void {
    if (this.ended && this.active === 0 && !this.finished && !this.stopped) {
      this.finished = true;
      this.onended?.();
    }
  }

  /** Seconds of audio played so far (stands still while paused). */
  get currentTime(): number {
    const now = this.context.currentTime;
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const segment = this.segments[i];
      if (segment && segment.startedAt <= now) return segment.audioOffset + Math.min(now - segment.startedAt, segment.duration);
    }
    return 0;
  }

  // Live audio cannot be moved.
  set currentTime(_seconds: number) {
    /* ignored */
  }

  /** Total length once the stream is complete; NaN before. */
  get duration(): number {
    return this.ended ? this.totalSamples / this.sampleRate : Number.NaN;
  }

  pause(): void {
    void this.context.suspend().catch(() => undefined);
  }

  async play(): Promise<void> {
    await this.context.resume();
  }

  /** Stops the sound and lets go of the audio device. Data that still arrives is ignored. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.onended = null;
    void this.context.close().catch(() => undefined);
  }
}
