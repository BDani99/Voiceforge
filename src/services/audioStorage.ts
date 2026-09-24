import { supabase } from './supabase';
import { generateHash } from '../utils/hash';
import { parseStoredMarks, serializeMarks, type SpeechMarks } from '../utils/speechMarks';

const BUCKET = 'voiceovers';
const PUBLIC_URL_PREFIX = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

const EXTENSIONS: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/aac': 'aac' };

/** Stable key for a rendered paragraph: same text + settings always map to the same file. */
export function getAudioHash(payload: unknown): Promise<string> {
  return generateHash(JSON.stringify(payload));
}

/** Only URLs pointing into our own storage bucket are trusted (the cache table is shared between users). */
function isTrustedAudioUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && url.startsWith(PUBLIC_URL_PREFIX);
}

export async function fetchAudioBlob(url: string | null | undefined): Promise<Blob> {
  if (!isTrustedAudioUrl(url)) throw new Error('Refusing to load audio from an untrusted URL');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Audio download failed (${response.status})`);
  return response.blob();
}

/** Returns the cached audio for a hash, or null when there is none (or it cannot be loaded). */
export interface CachedAudio {
  url: string;
  blob: Blob;
  /** Word timings stored with the audio, if it has any. */
  marks: SpeechMarks | null;
}

/** `textLength` is the length of the text the audio was made from: stored timings that do not fit it are ignored. */
export async function findCachedAudio(hashKey: string, textLength = Number.MAX_SAFE_INTEGER): Promise<CachedAudio | null> {
  const { data, error } = await supabase
    .from('audio_cache')
    .select('audio_url, speech_marks')
    .eq('hash_key', hashKey)
    .maybeSingle();

  if (error || !isTrustedAudioUrl(data?.audio_url)) return null;

  try {
    return {
      url: data.audio_url,
      blob: await fetchAudioBlob(data.audio_url),
      marks: parseStoredMarks(data.speech_marks, textLength),
    };
  } catch (err) {
    console.error('Failed to load cached audio', err);
    return null;
  }
}

async function fileExists(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { method: 'HEAD' })).ok;
  } catch {
    return false;
  }
}

/** Uploads audio and registers it in the cache table. Returns the public URL, or null on failure. */
export async function storeAudio(hashKey: string, blob: Blob, marks: SpeechMarks | null = null): Promise<string | null> {
  try {
    const extension = EXTENSIONS[blob.type] ?? 'wav';
    const path = `${hashKey}.${extension}`;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { upsert: true, contentType: blob.type || 'audio/wav' });
    // The name is the hash of text and settings: a file that already exists (uploaded by another user, who
    // is the only one allowed to overwrite it) holds the same audio, so it can simply be used.
    if (uploadError && !(await fileExists(data.publicUrl))) throw uploadError;

    // The file is usable even if registering it in the shared cache fails.
    const { error: cacheError } = await supabase
      .from('audio_cache')
      // Rows are immutable (clients may only insert), an existing entry already points to this file.
      .upsert(
        { hash_key: hashKey, audio_url: data.publicUrl, speech_marks: marks ? serializeMarks(marks) : null },
        { onConflict: 'hash_key', ignoreDuplicates: true },
      );
    if (cacheError) console.error('Failed to register audio in cache', cacheError);

    // Audio from before word timings were kept: add them to the existing row (allowed once, only while empty).
    if (marks && !cacheError) {
      const { error: marksError } = await supabase
        .from('audio_cache')
        .update({ speech_marks: serializeMarks(marks) })
        .eq('hash_key', hashKey)
        .is('speech_marks', null);
      if (marksError) console.error('Failed to add word timings to the cache', marksError);
    }

    return data.publicUrl;
  } catch (err) {
    console.error('Failed to store audio', err);
    return null;
  }
}
