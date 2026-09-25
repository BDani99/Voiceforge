import { useCallback, useEffect, useState } from 'react';
import {
  createClonedVoice,
  deleteClonedVoice,
  listMyClonedVoices,
  requestConsentChallenge,
  type ClonedVoice,
  type ConsentChallenge,
  type CreateClonedVoiceInput,
} from '../services/voiceCloning';
import { notify, getErrorMessage } from '../utils/notificationService';

/** The user's cloned ("Instant Voice Cloning") voices: list, create (consent, then create) and delete. */
export function useVoiceCloning() {
  const [voices, setVoices] = useState<ClonedVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listMyClonedVoices();
        if (!cancelled) setVoices(data);
      } catch (error) {
        if (!cancelled) notify.error(error, 'Could not load your cloned voices');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** Step 1: shows the speaker the phrase they must read aloud. Returns null on failure (a toast is shown). */
  const startConsent = useCallback(async (fullName: string): Promise<ConsentChallenge | null> => {
    try {
      return await requestConsentChallenge(fullName);
    } catch (error) {
      notify.error(error, 'Could not start voice consent');
      return null;
    }
  }, []);

  /** Step 2: creates the voice. Returns an error message to show inline, or null on success. */
  const create = useCallback(async (input: CreateClonedVoiceInput): Promise<string | null> => {
    setBusy(true);
    try {
      const voice = await createClonedVoice(input);
      setVoices((previous) => [voice, ...previous]);
      notify.success(`Cloned voice "${voice.display_name}" is ready to use.`);
      return null;
    } catch (error) {
      return getErrorMessage(error);
    } finally {
      setBusy(false);
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    setBusy(true);
    try {
      await deleteClonedVoice(id);
      setVoices((previous) => previous.filter((v) => v.id !== id));
      notify.success('Cloned voice deleted');
    } catch (error) {
      notify.error(error, 'Could not delete the voice');
    } finally {
      setBusy(false);
    }
  }, []);

  return { voices, loading, busy, startConsent, create, remove };
}

export type VoiceCloningApi = ReturnType<typeof useVoiceCloning>;
