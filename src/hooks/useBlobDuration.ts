import { useEffect, useState } from 'react';

/** Length in seconds of an audio blob (0 while unknown), so a paragraph shows it before it is played. */
export function useBlobDuration(blob: Blob | null): number {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!blob) return undefined;

    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    let cancelled = false;
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      if (!cancelled && Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    audio.src = url;

    return () => {
      cancelled = true;
      audio.onloadedmetadata = null;
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  // A blob that is gone (text edited, audio removed) has no length.
  return blob ? duration : 0;
}
