import { EMOTION_OPTIONS } from '../constants/voiceConstants';

/** Hue (0-360) of the colour that marks an emotion in the text and on its buttons. */
const HUES: Record<string, number> = {
  angry: 2,
  cheerful: 48,
  sad: 215,
  terrified: 275,
  relaxed: 168,
  fearful: 255,
  surprised: 28,
  calm: 192,
  assertive: 340,
  energetic: 92,
  warm: 35,
  direct: 225,
  bright: 318,
};

export const emotionHue = (emotion: string): number => HUES[emotion] ?? 220;

export function emotionLabel(emotion: string): string {
  return EMOTION_OPTIONS.find((e) => e.value === emotion)?.label ?? emotion;
}

export function emotionIcon(emotion: string): string {
  return EMOTION_OPTIONS.find((e) => e.value === emotion)?.icon ?? '';
}
