/** A Speechify voice as returned by the generate-speech Edge Function. */
export interface Voice {
  id: string;
  display_name?: string;
  name?: string;
  gender?: string;
  locale?: string;
}

export interface Paragraph {
  id: string;
  text: string;
  audioBlob: Blob | null;
  audioUrl: string | null;
  isGenerated: boolean;
  /** True when the audio came from the shared cache (no credits were charged). */
  wasCached: boolean;
}

/** Pitch, rate and volume: either a named preset or a custom percentage. */
export interface GlobalDefaults {
  pitch: string;
  pitchCustom: number;
  usePitchCustom: boolean;
  rate: string;
  rateCustom: number;
  useRateCustom: boolean;
  volume: string;
  volumeCustom: number;
  useVolumeCustom: boolean;
}

export interface SsmlOptions {
  prosody?: { pitch?: string; rate?: string; volume?: string };
  emphasis?: { enabled?: boolean; level?: string };
  emotion?: { enabled?: boolean; type?: string };
  customReplacements?: Record<string, string>;
  breaks?: {
    enabled?: boolean;
    pauseType?: 'strength' | 'time';
    pauseStrength?: string;
    pauseTime?: number;
  };
  addSilencePadding?: boolean;
  silenceDuration?: number;
}

/** The subset of the voice settings that is stored in a preset. */
export interface PresetSettings {
  language?: string;
  voice?: string;
  globalDefaults?: GlobalDefaults;
  pauseStrength?: string;
  usePauseCustom?: boolean;
  pauseCustomTime?: number;
  paragraphGapPause?: number;
  useParagraphGap?: boolean;
  useFadeTransitions?: boolean;
  fadeInDuration?: number;
  fadeOutDuration?: number;
  emotion?: string;
  globalEmphasis?: string;
}

export interface ConfirmDetail {
  icon?: string;
  text: string;
}

export interface ConfirmOptions {
  title?: string;
  message?: string;
  details?: ConfirmDetail[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'warning' | 'danger';
}
