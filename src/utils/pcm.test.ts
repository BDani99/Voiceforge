import { describe, it, expect } from 'vitest';
import { SampleAligner, base64ToBytes, pcmDurationMs, pcmToFloat32, pcmToWav } from './pcm';
import { wavDurationMs } from './audioDuration';

describe('base64ToBytes', () => {
  it('decodes', () => {
    expect([...base64ToBytes('AQID')]).toEqual([1, 2, 3]);
    expect(base64ToBytes('').length).toBe(0);
  });
});

describe('pcmDurationMs', () => {
  it('counts 16-bit mono samples', () => {
    expect(pcmDurationMs(48000)).toBe(1000); // 24000 samples
    expect(pcmDurationMs(24000, 24000)).toBe(500);
    expect(pcmDurationMs(0)).toBe(0);
  });
});

describe('SampleAligner', () => {
  it('passes whole samples through', () => {
    expect([...new SampleAligner().push(new Uint8Array([1, 2, 3, 4]))]).toEqual([1, 2, 3, 4]);
  });

  it('keeps an odd byte for the next chunk so no sample is ever cut', () => {
    const aligner = new SampleAligner();
    expect([...aligner.push(new Uint8Array([1, 2, 3]))]).toEqual([1, 2]);
    expect([...aligner.push(new Uint8Array([4, 5, 6]))]).toEqual([3, 4, 5, 6]);
    expect([...aligner.push(new Uint8Array([7]))]).toEqual([]);
    expect([...aligner.push(new Uint8Array([8, 9]))]).toEqual([7, 8]);
  });

  it('reassembles the same bytes whatever the chunk boundaries are', () => {
    const source = Uint8Array.from({ length: 101 }, (_, i) => i);
    const aligner = new SampleAligner();
    const out: number[] = [];
    let position = 0;
    for (const size of [1, 3, 7, 50, 40]) {
      out.push(...aligner.push(source.subarray(position, position + size)));
      position += size;
    }
    expect(out).toEqual([...source.subarray(0, 100)]); // the last odd byte is still pending
  });
});

describe('pcmToFloat32', () => {
  it('converts little-endian 16-bit samples to -1..1', () => {
    const bytes = new Uint8Array([0x00, 0x00, 0xff, 0x7f, 0x00, 0x80]); // 0, 32767, -32768
    const samples = pcmToFloat32(bytes);
    expect(samples[0]).toBe(0);
    expect(samples[1]).toBeCloseTo(32767 / 32768, 5);
    expect(samples[2]).toBe(-1);
  });

  it('ignores a trailing odd byte and respects the view offset', () => {
    const bytes = new Uint8Array([9, 0x00, 0x40, 7]).subarray(1);
    expect([...pcmToFloat32(bytes)]).toEqual([0.5]);
  });
});

describe('pcmToWav', () => {
  it('writes a valid mono 16-bit WAV of the right length', async () => {
    const wav = pcmToWav([new Uint8Array(24000), new Uint8Array(24000)], 24000);
    expect(wav.type).toBe('audio/wav');
    expect(wav.size).toBe(44 + 48000);
    expect(await wavDurationMs(wav)).toBe(1000);

    const header = new DataView(await wav.slice(0, 44).arrayBuffer());
    expect(String.fromCharCode(...new Uint8Array(await wav.slice(0, 4).arrayBuffer()))).toBe('RIFF');
    expect(header.getUint32(24, true)).toBe(24000); // sample rate
    expect(header.getUint16(22, true)).toBe(1); // mono
    expect(header.getUint16(34, true)).toBe(16); // bits
    expect(header.getUint32(40, true)).toBe(48000); // data size
  });

  it('keeps the audio bytes in order', async () => {
    const wav = pcmToWav([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
    expect([...new Uint8Array(await wav.slice(44).arrayBuffer())]).toEqual([1, 2, 3, 4]);
  });

  it('handles no audio', async () => {
    expect((await pcmToWav([]).arrayBuffer()).byteLength).toBe(44);
  });
});
