import { describe, it, expect } from 'vitest';
import { audioDurationMs, wavDurationMs } from './audioDuration';

/** A minimal PCM WAV: 16-bit mono at the given sample rate, `seconds` long. */
function wav(seconds: number, sampleRate = 24000, dataSizeField?: number): Blob {
  const dataSize = Math.round(seconds * sampleRate * 2);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, dataSizeField ?? dataSize, true);
  return new Blob([buffer], { type: 'audio/wav' });
}

describe('wavDurationMs', () => {
  it('reads the length from the header', async () => {
    expect(await wavDurationMs(wav(2.5))).toBe(2500);
    expect(await wavDurationMs(wav(1, 44100))).toBe(1000);
  });

  it('uses the rest of the file when the header does not know the data size (streamed files)', async () => {
    expect(await wavDurationMs(wav(2, 24000, 0xffffffff))).toBe(2000);
    expect(await wavDurationMs(wav(2, 24000, 0))).toBe(2000);
    expect(await wavDurationMs(wav(2, 24000, 999_999_999))).toBe(2000);
  });

  it('returns null for anything that is not a WAV file', async () => {
    expect(await wavDurationMs(new Blob(['ID3 not a wav file at all']))).toBeNull();
    expect(await wavDurationMs(new Blob([]))).toBeNull();
  });
});

describe('audioDurationMs', () => {
  it('prefers the WAV header', async () => {
    expect(await audioDurationMs(wav(3))).toBe(3000);
  });
});
