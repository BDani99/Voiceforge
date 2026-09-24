import type { Json } from '../types/database';
import type { Paragraph } from '../types/models';
import { EMOTION_OPTIONS } from '../constants/voiceConstants';
import { normalizeSegments, type EmotionSegment } from './emotionSegments';

/** Paragraph emotion value for "explicitly neutral", overriding the default emotion of all paragraphs. */
export const EMOTION_NEUTRAL = 'none';

const KNOWN_EMOTIONS = new Set(EMOTION_OPTIONS.map((e) => e.value));

export type EmotionMode = 'default' | 'neutral' | 'paragraph' | 'highlights';

type EmotionFields = Pick<Paragraph, 'emotion' | 'segments'>;

/**
 * How a paragraph gets its emotion. Whole-paragraph emotion and highlighted parts exclude each
 * other: with highlights the paragraph itself has no emotion, and the other way round.
 */
export function emotionMode(paragraph: EmotionFields): EmotionMode {
  if (paragraph.segments.length > 0) return 'highlights';
  if (paragraph.emotion === EMOTION_NEUTRAL) return 'neutral';
  return paragraph.emotion ? 'paragraph' : 'default';
}

/** The emotion that speaks the whole paragraph, or null for a neutral voice. */
export function effectiveParagraphEmotion(paragraph: EmotionFields, defaultEmotion: string): string | null {
  switch (emotionMode(paragraph)) {
    case 'highlights':
    case 'neutral':
      return null;
    case 'paragraph':
      return paragraph.emotion;
    default:
      return defaultEmotion || null;
  }
}

/** What is stored in paragraphs.settings. */
export interface StoredParagraphSettings {
  emotion: string;
  segments: EmotionSegment[];
}

export function serializeParagraphSettings(paragraph: EmotionFields): Json {
  return {
    emotion: paragraph.emotion,
    segments: paragraph.segments.map((s) => ({ start: s.start, end: s.end, emotion: s.emotion })),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads stored settings defensively: anything unknown or malformed is dropped. */
export function parseParagraphSettings(value: Json | null | undefined, textLength: number): StoredParagraphSettings {
  if (!isRecord(value)) return { emotion: '', segments: [] };

  const emotion = typeof value.emotion === 'string' && (value.emotion === EMOTION_NEUTRAL || KNOWN_EMOTIONS.has(value.emotion))
    ? value.emotion
    : '';

  const rawSegments: unknown[] = Array.isArray(value.segments) ? value.segments : [];
  const segments = normalizeSegments(
    rawSegments.flatMap((raw): EmotionSegment[] => {
      if (!isRecord(raw)) return [];
      const { start, end, emotion: segmentEmotion } = raw;
      if (typeof start !== 'number' || typeof end !== 'number' || typeof segmentEmotion !== 'string') return [];
      return KNOWN_EMOTIONS.has(segmentEmotion) ? [{ start, end, emotion: segmentEmotion }] : [];
    }),
    textLength,
  );

  // Never both: highlights win, as they carry more information.
  return segments.length > 0 ? { emotion: '', segments } : { emotion, segments: [] };
}
