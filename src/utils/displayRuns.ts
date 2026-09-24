import { normalizeSegments, type EmotionSegment } from './emotionSegments';
import { breakMs, normalizeMarks, type TextMark } from './textMarks';

/** A stretch of text that looks the same everywhere: for the coloured layer behind the text field. */
export interface DisplayRun {
  text: string;
  emotion: string | null;
  /** Emphasis level, if emphasised. */
  emphasis: string | null;
  /** The alias, if this is a pronunciation. */
  alias: string | null;
  /** A pause sits in front of this run (its value, e.g. "500ms"). */
  pause: string | null;
}

export interface DisplayText {
  runs: DisplayRun[];
  /** A pause at the very end of the text. */
  endPause: string | null;
}

/** Splits the text wherever emotion, emphasis, pronunciation or a pause changes. */
export function toDisplayRuns(text: string, segments: EmotionSegment[], marks: TextMark[]): DisplayText {
  const cleanSegments = normalizeSegments(segments, text.length);
  const cleanMarks = normalizeMarks(marks, text.length);
  const spans = cleanMarks.filter((m) => m.kind !== 'break');
  const pauses = cleanMarks.filter((m) => m.kind === 'break');

  const cuts = new Set<number>([0, text.length]);
  for (const segment of cleanSegments) {
    cuts.add(segment.start);
    cuts.add(segment.end);
  }
  for (const span of spans) {
    cuts.add(span.start);
    cuts.add(span.end);
  }
  for (const pause of pauses) cuts.add(pause.start);
  const points = [...cuts].sort((a, b) => a - b);

  const runs: DisplayRun[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i] ?? 0;
    const end = points[i + 1] ?? text.length;
    if (end <= start) continue;
    const segment = cleanSegments.find((s) => s.start <= start && s.end >= end);
    const span = spans.find((m) => m.start <= start && m.end >= end);
    runs.push({
      text: text.slice(start, end),
      emotion: segment?.emotion ?? null,
      emphasis: span?.kind === 'emphasis' ? span.value : null,
      alias: span?.kind === 'sub' ? span.value : null,
      pause: pauses.find((p) => p.start === start)?.value ?? null,
    });
  }

  return { runs, endPause: pauses.find((p) => p.start === text.length)?.value ?? null };
}

/** "500ms" to "500 ms", "1500ms" to "1.5 s", strengths as they are. */
export function pauseLabel(value: string): string {
  if (!value.endsWith('ms')) return value;
  const ms = breakMs(value);
  return ms >= 1000 && ms % 100 === 0 ? `${ms / 1000} s` : `${ms} ms`;
}
