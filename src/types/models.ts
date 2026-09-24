/** One language of a voice with its sample recording. */
export interface VoiceLanguage {
  locale: string;
  preview_audio?: string | null;
}

/** A model a voice can be used with, and the languages it covers. */
export interface VoiceModel {
  name: string;
  languages: VoiceLanguage[];
}

/** A Speechify voice as returned by the generate-speech Edge Function. */
export interface Voice {
  id: string;
  display_name?: string;
  name?: string;
  gender?: string;
  locale?: string;
  avatar_image?: string | null;
  preview_audio?: string | null;
  tags?: string[] | null;
  models?: VoiceModel[];
}

export interface Paragraph {
  id: string;
  text: string;
  audioBlob: Blob | null;
  audioUrl: string | null;
  isGenerated: boolean;
  /** True when the audio came from the shared cache (no credits were charged). */
  wasCached: boolean;
  /** Emotion of the whole paragraph: empty = default of all paragraphs, none = neutral. */
  emotion: string;
  /** Emotions of highlighted parts. Excludes a paragraph emotion (see paragraphEmotion.ts). */
  segments: EmotionSegment[];
  /** Emphasis, pronunciations and pauses. They combine with any emotion. */
  marks: TextMark[];
  /** When each word of the generated audio is spoken (null for audio without timings). */
  speechMarks: SpeechMarks | null;
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

import type { EmotionSegment } from '../utils/emotionSegments';
import type { TextMark } from '../utils/textMarks';
import type { SpeechMarks } from '../utils/speechMarks';

export interface SsmlOptions {
  prosody?: { pitch?: string; rate?: string; volume?: string };
  emphasis?: { enabled?: boolean; level?: string };
  /** One emotion for the whole text. Ignored when `emotionSegments` are given (the two exclude each other). */
  emotion?: { enabled?: boolean; type?: string };
  /** Emotions for highlighted parts of the text. */
  emotionSegments?: EmotionSegment[];
  /** Emphasis, pronunciations and manual pauses at positions in the text. */
  marks?: TextMark[];
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
  /** "auto" or a model name. */
  model?: string;
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
