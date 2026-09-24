const HEADER_BYTES = 4096;

/** Reads the length of a PCM WAV file from its header (no decoding needed). Null if it is not one. */
export async function wavDurationMs(blob: Blob): Promise<number | null> {
  const view = new DataView(await blob.slice(0, HEADER_BYTES).arrayBuffer());
  const tag = (offset: number): string =>
    offset + 4 <= view.byteLength ? String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3)) : '';

  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;

  let byteRate = 0;
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ' && offset + 20 <= view.byteLength) {
      byteRate = view.getUint32(offset + 16, true);
    } else if (id === 'data') {
      const available = blob.size - (offset + 8);
      // Streamed files may claim an unknown (0 or maximal) size: the rest of the file is the data.
      const dataSize = size === 0 || size === 0xffffffff || size > available ? available : size;
      return byteRate > 0 ? Math.round((dataSize / byteRate) * 1000) : null;
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

/** Fallback for other formats: the browser reads the length from the file's metadata. */
function metadataDurationMs(blob: Blob, timeoutMs: number): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    const done = (value: number) => {
      clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(0), timeoutMs);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

/** Length of an audio blob in milliseconds (0 when it cannot be determined). */
export async function audioDurationMs(blob: Blob, timeoutMs = 5000): Promise<number> {
  return (await wavDurationMs(blob)) ?? metadataDurationMs(blob, timeoutMs);
}
