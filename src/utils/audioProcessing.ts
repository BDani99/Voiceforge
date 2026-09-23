import { audioBufferToWav } from './wav';

const FADE_SEGMENT_SECONDS = 0.01;

let decodeContext: AudioContext | null = null;

function getDecodeContext(): AudioContext {
  if (!decodeContext || decodeContext.state === 'closed') {
    if (typeof AudioContext === 'undefined') throw new Error('Web Audio API is not available in this browser');
    decodeContext = new AudioContext();
  }
  return decodeContext;
}

async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  return getDecodeContext().decodeAudioData(arrayBuffer);
}

/** Returns a WAV blob with a linear fade-in and fade-out applied (durations in seconds). */
export async function applyFade(blob: Blob, fadeInSeconds: number, fadeOutSeconds: number): Promise<Blob> {
  const buffer = await decodeBlob(blob);
  const duration = buffer.duration;
  const fadeIn = Math.min(fadeInSeconds, duration / 2);
  const fadeOut = Math.min(fadeOutSeconds, duration / 2);

  const offline = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;

  const gain = offline.createGain();
  gain.gain.setValueAtTime(fadeIn > 0 ? 0 : 1, 0);
  if (fadeIn > 0) gain.gain.linearRampToValueAtTime(1, fadeIn);
  if (fadeOut > 0) {
    gain.gain.setValueAtTime(1, duration - fadeOut);
    gain.gain.linearRampToValueAtTime(0, duration);
  }

  source.connect(gain);
  gain.connect(offline.destination);
  source.start(0);

  return audioBufferToWav(await offline.startRendering());
}

/** Joins audio blobs into a single WAV blob, inserting `gapMs` of silence between them. */
export async function concatenateAudio(blobs: Blob[], gapMs = 0): Promise<Blob> {
  if (!blobs || blobs.length === 0) throw new Error('No audio blobs to concatenate');
  if (blobs.length === 1 && blobs[0]) return blobs[0];

  const buffers = await Promise.all(blobs.map(decodeBlob));
  const sampleRate = getDecodeContext().sampleRate;
  const gapSeconds = gapMs / 1000;

  const totalSeconds = buffers.reduce((sum, b) => sum + b.duration, 0) + gapSeconds * (buffers.length - 1);
  const offline = new OfflineAudioContext(2, Math.ceil(totalSeconds * sampleRate), sampleRate);

  let startTime = 0;
  for (const buffer of buffers) {
    const source = offline.createBufferSource();
    source.buffer = buffer;

    // Short fades on every segment avoid clicks at the joins.
    const gain = offline.createGain();
    const end = startTime + buffer.duration;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(1, startTime + FADE_SEGMENT_SECONDS);
    gain.gain.setValueAtTime(1, Math.max(startTime + FADE_SEGMENT_SECONDS, end - FADE_SEGMENT_SECONDS));
    gain.gain.linearRampToValueAtTime(0, end);

    source.connect(gain);
    gain.connect(offline.destination);
    source.start(startTime);

    startTime = end + gapSeconds;
  }

  return audioBufferToWav(await offline.startRendering());
}
