import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

/** Must match the Edge Function's own default (see supabase/functions/clone-voice/index.ts). */
export const DEFAULT_VOICE_CLONE_COST = 5000;

/** The current price (in credits) of cloning one voice, as set by an admin. `system_settings` is publicly readable. */
export function useVoiceCloneCost(): number {
  const [cost, setCost] = useState(DEFAULT_VOICE_CLONE_COST);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from('system_settings').select('value').eq('key', 'voice_clone_cost').maybeSingle();
      const parsed = Number(data?.value);
      if (!cancelled && Number.isFinite(parsed) && parsed > 0) setCost(Math.floor(parsed));
    })();
    return () => { cancelled = true; };
  }, []);

  return cost;
}
