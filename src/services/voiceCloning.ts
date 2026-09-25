import { supabase } from './supabase';
import { toServiceError } from './functionError';
import { SpeechServiceError } from './speechErrors';
import type { Tables } from '../types/aliases';

const FUNCTION_NAME = 'clone-voice';

export type ClonedVoice = Tables<'cloned_voices'>;

export interface ConsentChallenge {
  id: string;
  phrase: string;
  expiresAt: string | null;
}

interface RawConsentChallenge {
  id?: unknown;
  phrase?: unknown;
  expires_at?: unknown;
}

interface InvokeResult<T> {
  data: T | null;
  error: Error | null;
}

async function invoke<T>(options: { body?: object; method?: 'POST' | 'DELETE' }): Promise<T> {
  const { data, error } = (await supabase.functions.invoke<T>(FUNCTION_NAME, options)) as InvokeResult<T>;
  if (error) throw await toServiceError(error);
  if (!data) throw new SpeechServiceError('Empty response from the voice cloning service');
  return data;
}

/** Step 1 of consent: asks Speechify for the phrase the speaker must read aloud. */
export async function requestConsentChallenge(fullName: string): Promise<ConsentChallenge> {
  const raw = await invoke<RawConsentChallenge>({ body: { full_name: fullName } });
  if (typeof raw.id !== 'string' || typeof raw.phrase !== 'string') {
    throw new SpeechServiceError('The voice cloning service returned an unexpected response');
  }
  return { id: raw.id, phrase: raw.phrase, expiresAt: typeof raw.expires_at === 'string' ? raw.expires_at : null };
}

export interface CreateClonedVoiceInput {
  name: string;
  consentChallengeId: string;
  gender: 'male' | 'female' | 'not_specified';
  /** ISO locale of the voice, e.g. "en-US". */
  locale?: string;
  /** 10-30 seconds of clear speech, under 5 MB. */
  sample: Blob;
  /** The speaker reading the consent phrase, 5-30 seconds, under 25 MB. */
  consentRecording: Blob;
}

/** Step 2: creates the cloned voice from a sample and a verified consent recording. Costs credits. */
export async function createClonedVoice(input: CreateClonedVoiceInput): Promise<ClonedVoice> {
  const form = new FormData();
  form.set('name', input.name);
  form.set('consent_challenge_id', input.consentChallengeId);
  form.set('gender', input.gender);
  if (input.locale) form.set('locale', input.locale);
  form.set('sample', input.sample, 'sample.webm');
  form.set('consent_recording', input.consentRecording, 'consent.webm');
  return invoke<ClonedVoice>({ body: form });
}

/** The current user's own cloned voices, newest first. */
export async function listMyClonedVoices(): Promise<ClonedVoice[]> {
  const { data, error } = await supabase.from('cloned_voices').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Deletes a cloned voice: removed from Speechify and from the user's list. */
export async function deleteClonedVoice(id: string): Promise<void> {
  await invoke<{ success: boolean }>({ method: 'DELETE', body: { id } });
}
