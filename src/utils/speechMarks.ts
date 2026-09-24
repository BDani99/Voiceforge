import type { Json } from '../types/database';

/**
 * One spoken word: start and end offset in the paragraph text, start and end time in milliseconds
 * from the beginning of the paragraph audio. This is all that is kept of Speechify's speech marks
 * (the word itself is the text between the offsets), which keeps the stored data small.
 */
export type WordTiming = [start: number, end: number, startMs: number, endMs: number];

export interface SpeechMarks {
  /** Length of the audio in milliseconds. */
  durationMs: number;
  words: WordTiming[];
}

/** More words than this in one paragraph is not a real paragraph, so stored data claiming it is ignored. */
const MAX_WORDS = 20_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Reads the `speech_marks` object of Speechify's response: a sentence-like root whose `chunks` are the
 * words. Offsets are moved by `textOffset` characters and times by `timeOffsetMs`, so marks of chunks
 * can be joined into the marks of a whole paragraph.
 */
export function wordsFromApi(raw: unknown, textOffset = 0, timeOffsetMs = 0): WordTiming[] {
  if (!isRecord(raw)) return [];
  const chunks = Array.isArray(raw.chunks) ? (raw.chunks as unknown[]) : [];

  const words: WordTiming[] = [];
  for (const chunk of chunks) {
    if (!isRecord(chunk)) continue;
    const { start, end, start_time: startTime, end_time: endTime } = chunk;
    if (!isFiniteNumber(start) || !isFiniteNumber(end) || !isFiniteNumber(startTime) || !isFiniteNumber(endTime)) continue;
    if (end <= start || endTime < startTime) continue;
    words.push([start + textOffset, end + textOffset, Math.round(startTime + timeOffsetMs), Math.round(endTime + timeOffsetMs)]);
    if (words.length >= MAX_WORDS) break;
  }
  return words;
}

/** The same words further into the text and the audio. */
export function shiftWords(words: WordTiming[], textOffset: number, timeOffsetMs: number): WordTiming[] {
  return words.map(([start, end, startMs, endMs]) => [start + textOffset, end + textOffset, startMs + timeOffsetMs, endMs + timeOffsetMs]);
}

/** Joins the marks of consecutive parts of one paragraph; each part starts at its text offset, after the audio before it. */
export function joinMarks(parts: { marks: SpeechMarks; textOffset: number }[]): SpeechMarks {
  let time = 0;
  const words: WordTiming[] = [];
  for (const { marks, textOffset } of parts) {
    words.push(...shiftWords(marks.words, textOffset, time));
    time += marks.durationMs;
  }
  return { durationMs: time, words };
}

export function serializeMarks(marks: SpeechMarks): Json {
  return { v: 1, durationMs: Math.round(marks.durationMs), words: marks.words.map((w) => [...w]) };
}

/** Reads stored marks defensively (the cache table is shared): anything malformed is dropped. */
export function parseStoredMarks(value: Json | null | undefined, textLength: number): SpeechMarks | null {
  if (!isRecord(value) || value.v !== 1 || !isFiniteNumber(value.durationMs) || value.durationMs < 0) return null;
  if (!Array.isArray(value.words) || value.words.length > MAX_WORDS) return null;

  const words: WordTiming[] = [];
  let previousStart = -1;
  for (const raw of value.words as unknown[]) {
    if (!Array.isArray(raw) || raw.length !== 4 || !raw.every(isFiniteNumber)) return null;
    const [start, end, startMs, endMs] = raw;
    if (start === undefined || end === undefined || startMs === undefined || endMs === undefined) return null;
    if (start < 0 || end <= start || end > textLength || endMs < startMs || start < previousStart) return null;
    previousStart = start;
    words.push([start, end, startMs, endMs]);
  }
  return words.length > 0 ? { durationMs: value.durationMs, words } : null;
}

/**
 * The word being spoken at a time: the last word that has started. During a pause it stays on the word
 * before it, which reads better than a highlight that flickers off. -1 before the first word.
 */
export function findWordIndex(words: WordTiming[], ms: number): number {
  let low = 0;
  let high = words.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const word = words[middle];
    if (word && word[2] <= ms) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** The text range of a word without the whitespace Speechify sometimes counts to it. */
export function wordRange(text: string, word: WordTiming): { start: number; end: number } {
  let start = word[0];
  let end = Math.min(word[1], text.length);
  while (start < end && /\s/.test(text[start] ?? '')) start++;
  while (end > start && /\s/.test(text[end - 1] ?? '')) end--;
  return { start, end };
}

/**
 * Rough timing for audio that has no speech marks (generated before they were kept): the words share
 * the audio duration in proportion to their length. Good enough for captions, flagged as estimated.
 */
export function estimateWords(text: string, durationMs: number): WordTiming[] {
  const matches = [...text.matchAll(/\S+/g)];
  const total = matches.reduce((sum, m) => sum + m[0].length + 1, 0);
  if (matches.length === 0 || total === 0 || durationMs <= 0) return [];

  let elapsed = 0;
  return matches.map((match) => {
    const weight = (match[0].length + 1) / total;
    const startMs = Math.round(elapsed * durationMs);
    elapsed += weight;
    const endMs = Math.round(elapsed * durationMs);
    return [match.index, match.index + match[0].length, startMs, endMs] as WordTiming;
  });
}
