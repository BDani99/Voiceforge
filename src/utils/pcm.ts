/** Speechify's streamed audio: raw 16-bit little-endian mono PCM at this rate (output_format pcm_24000). */
export const STREAM_SAMPLE_RATE = 24000;
const BYTES_PER_SAMPLE = 2;

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Length of PCM audio of `byteLength` bytes in milliseconds. */
export function pcmDurationMs(byteLength: number, sampleRate = STREAM_SAMPLE_RATE): number {
  return Math.round((byteLength / BYTES_PER_SAMPLE / sampleRate) * 1000);
}

/**
 * Chunks of a byte stream do not have to end on a sample boundary. This keeps the odd byte of a
 * chunk and puts it in front of the next one, so every returned piece holds whole samples.
 */
export class SampleAligner {
  private pending: number | null = null;

  push(bytes: Uint8Array): Uint8Array {
    let data = bytes;
    if (this.pending !== null) {
      data = new Uint8Array(bytes.length + 1);
      data[0] = this.pending;
      data.set(bytes, 1);
      this.pending = null;
    }
    if (data.length % BYTES_PER_SAMPLE === 1) {
      this.pending = data[data.length - 1] ?? null;
      return data.subarray(0, data.length - 1);
    }
    return data;
  }
}

/** Samples (-1..1) of 16-bit little-endian PCM. */
export function pcmToFloat32(bytes: Uint8Array): Float32Array<ArrayBuffer> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength - (bytes.byteLength % BYTES_PER_SAMPLE));
  const samples = new Float32Array(view.byteLength / BYTES_PER_SAMPLE);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * BYTES_PER_SAMPLE, true) / 32768;
  return samples;
}

/** Wraps PCM chunks into a WAV file (mono, 16 bit). */
export function pcmToWav(chunks: Uint8Array[], sampleRate = STREAM_SAMPLE_RATE): Blob {
  const dataSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  write(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true); // byte rate
  view.setUint16(32, BYTES_PER_SAMPLE, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  write(36, 'data');
  view.setUint32(40, dataSize, true);

  return new Blob([header, ...chunks.map((chunk) => chunk.slice().buffer)], { type: 'audio/wav' });
}
