import { wordRange, type WordTiming } from './speechMarks';

/** The words of one paragraph and where its audio starts in the exported file. */
export interface CaptionSource {
  text: string;
  words: WordTiming[];
  offsetMs: number;
}

export interface Cue {
  startMs: number;
  endMs: number;
  /** One or two lines, joined with a line break. */
  text: string;
}

export interface CueOptions {
  maxLineChars: number;
  maxLines: number;
  maxDurationMs: number;
  /** A silence at least this long between two words starts a new cue. */
  gapBreakMs: number;
  /** A cue is at least this long on screen, as far as the next cue allows. */
  minDurationMs: number;
}

export const DEFAULT_CUE_OPTIONS: CueOptions = {
  maxLineChars: 42,
  maxLines: 2,
  maxDurationMs: 6000,
  gapBreakMs: 800,
  minDurationMs: 800,
};

const SENTENCE_END = /[.!?…]["')\]]*$/;
/** A sentence ends a cue once the cue has this much text; shorter ones would flash by. */
const MIN_CHARS_TO_END_ON_SENTENCE = 24;

const flatten = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Puts a text on one or two lines, breaking near the middle at a space. */
export function wrapLines(text: string, maxLineChars: number): string {
  const flat = flatten(text);
  if (flat.length <= maxLineChars) return flat;

  const middle = Math.floor(flat.length / 2);
  let best = -1;
  for (let i = 0; i < flat.length; i++) {
    if (flat[i] === ' ' && (best === -1 || Math.abs(i - middle) < Math.abs(best - middle))) best = i;
  }
  return best === -1 ? flat : `${flat.slice(0, best)}\n${flat.slice(best + 1)}`;
}

/** Groups the words into cues that are easy to read: sentence ends, silences and length decide. */
export function buildCues(sources: CaptionSource[], options: Partial<CueOptions> = {}): Cue[] {
  const o = { ...DEFAULT_CUE_OPTIONS, ...options };
  const maxChars = o.maxLineChars * o.maxLines;
  const cues: Cue[] = [];

  for (const source of sources) {
    const words = source.words
      .map((word) => ({ word, range: wordRange(source.text, word) }))
      .filter(({ range }) => range.end > range.start);

    let group: typeof words = [];
    const flush = () => {
      const first = group[0];
      const last = group[group.length - 1];
      if (first && last) {
        const text = flatten(source.text.slice(first.range.start, last.range.end));
        if (text) {
          cues.push({
            startMs: source.offsetMs + first.word[2],
            endMs: source.offsetMs + last.word[3],
            text: wrapLines(text, o.maxLineChars),
          });
        }
      }
      group = [];
    };

    for (const item of words) {
      const first = group[0];
      const last = group[group.length - 1];
      if (first && last) {
        const candidateLength = flatten(source.text.slice(first.range.start, item.range.end)).length;
        const tooLong = candidateLength > maxChars || item.word[3] - first.word[2] > o.maxDurationMs;
        const silence = item.word[2] - last.word[3] >= o.gapBreakMs;
        if (tooLong || silence) flush();
      }
      group.push(item);

      const start = group[0]?.range.start ?? item.range.start;
      const text = source.text.slice(start, item.range.end);
      if (SENTENCE_END.test(text.trim()) && flatten(text).length >= MIN_CHARS_TO_END_ON_SENTENCE) flush();
    }
    flush();
  }

  // Cues must not overlap, and short ones stay a little longer when there is room.
  cues.sort((a, b) => a.startMs - b.startMs);
  return cues.map((cue, i) => {
    const next = cues[i + 1];
    let endMs = Math.max(cue.endMs, Math.min(cue.startMs + o.minDurationMs, next?.startMs ?? Infinity));
    if (next) endMs = Math.min(endMs, next.startMs);
    return { ...cue, endMs: Math.max(endMs, cue.startMs) };
  });
}

/** Start times of the paragraphs in the joined file: each starts after the previous one and the pause between them. */
export function paragraphOffsets(durationsMs: number[], gapMs: number): number[] {
  const offsets: number[] = [];
  let position = 0;
  for (const duration of durationsMs) {
    offsets.push(position);
    position += duration + gapMs;
  }
  return offsets;
}

function timestamp(ms: number, separator: ',' | '.'): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${pad(millis, 3)}`;
}

/** SubRip (.srt). */
export function toSrt(cues: Cue[]): string {
  return cues
    .map((cue, i) => `${i + 1}\n${timestamp(cue.startMs, ',')} --> ${timestamp(cue.endMs, ',')}\n${cue.text}\n`)
    .join('\n');
}

/** WebVTT (.vtt). Text is escaped, since VTT treats & and < as markup. */
export function toVtt(cues: Cue[]): string {
  const body = cues
    .map((cue) => {
      const text = cue.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `${timestamp(cue.startMs, '.')} --> ${timestamp(cue.endMs, '.')}\n${text}\n`;
    })
    .join('\n');
  return `WEBVTT\n\n${body}`;
}
