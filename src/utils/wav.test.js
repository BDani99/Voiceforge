import { describe, it, expect } from 'vitest';
import { audioBufferToWav } from './wav';

const fakeBuffer = (channels, sampleRate) => ({
  numberOfChannels: channels.length,
  length: channels[0].length,
  sampleRate,
  getChannelData: (c) => channels[c],
});

describe('audioBufferToWav', () => {
  it('writes a valid 16-bit PCM header and interleaved samples', async () => {
    const blob = audioBufferToWav(fakeBuffer([Float32Array.from([0, 1, -1]), Float32Array.from([0.5, 0, 0])], 8000));
    expect(blob.type).toBe('audio/wav');

    const view = new DataView(await blob.arrayBuffer());
    const text = (offset, len) => String.fromCharCode(...new Uint8Array(view.buffer, offset, len));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(2); // channels
    expect(view.getUint32(24, true)).toBe(8000); // sample rate
    expect(view.getUint32(40, true)).toBe(3 * 2 * 2); // data length
    expect(view.byteLength).toBe(44 + 12);

    expect(view.getInt16(44, true)).toBe(0); // frame 0, left
    expect(view.getInt16(46, true)).toBe(Math.trunc(0.5 * 0x7fff)); // frame 0, right
    expect(view.getInt16(48, true)).toBe(0x7fff); // frame 1 clipped to max
    expect(view.getInt16(52, true)).toBe(-0x8000); // frame 2 min
  });

  it('clamps out of range samples', async () => {
    const view = new DataView(await audioBufferToWav(fakeBuffer([Float32Array.from([5, -5])], 8000)).arrayBuffer());
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });
});
