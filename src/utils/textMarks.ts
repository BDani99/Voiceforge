import { diffEdit } from './emotionSegments';

/**
 * Extra SSML controls on a paragraph, next to the emotions:
 * - `emphasis`: a span read with more or less stress (`value` is reduced, moderate or strong)
 * - `sub`: a span that is pronounced as another text (`value` is the alias), the documented way to
 *   read numbers, dates, units and abbreviations the way you want them
 * - `break`: a pause at one position (`start === end`; `value` is a strength or a time like "500ms")
 *
 * Offsets are UTF-16 positions in the paragraph text, like the emotion segments.
 */
export type MarkKind = 'emphasis' | 'sub' | 'break';

export interface TextMark {
  kind: MarkKind;
  start: number;
  end: number;
  value: string;
}

export const EMPHASIS_LEVELS = ['reduced', 'moderate', 'strong'] as const;
export const BREAK_STRENGTHS = ['x-weak', 'weak', 'medium', 'strong', 'x-strong'] as const;
export const MAX_ALIAS_LENGTH = 100;
/** Speechify limits: one pause 10 s, all pauses of a document together 30 s (more is dropped). */
export const MAX_BREAK_MS = 10_000;
export const MAX_TOTAL_BREAK_MS = 30_000;

const BREAK_TIME_RE = /^(\d{1,5})ms$/;

export const isSpan = (mark: TextMark): boolean => mark.kind !== 'break';

/** Length of a pause value in milliseconds (strengths count as a rough estimate). */
export function breakMs(value: string): number {
  const time = BREAK_TIME_RE.exec(value);
  if (time) return Number(time[1]);
  const estimate: Record<string, number> = { 'x-weak': 100, weak: 250, medium: 500, strong: 750, 'x-strong': 1000 };
  return estimate[value] ?? 0;
}

export function isValidMark(mark: TextMark): boolean {
  switch (mark.kind) {
    case 'emphasis':
      return (EMPHASIS_LEVELS as readonly string[]).includes(mark.value);
    case 'sub':
      return mark.value.trim().length > 0 && mark.value.length <= MAX_ALIAS_LENGTH;
    case 'break': {
      if ((BREAK_STRENGTHS as readonly string[]).includes(mark.value)) return true;
      const time = BREAK_TIME_RE.exec(mark.value);
      return !!time && Number(time[1]) > 0 && Number(time[1]) <= MAX_BREAK_MS;
    }
    default:
      return false;
  }
}

const insideSpan = (spans: TextMark[], position: number): boolean =>
  spans.some((s) => s.kind === 'sub' && position > s.start && position < s.end);

/**
 * Clamps, sorts and cleans a list: valid values only, spans do not overlap (the earlier one keeps its
 * part), one pause per position, and no pause inside a pronunciation replacement.
 */
export function normalizeMarks(marks: TextMark[], textLength: number): TextMark[] {
  const spans: TextMark[] = [];
  const sorted = marks
    .filter(isSpan)
    .map((m) => ({ ...m, start: Math.max(0, Math.floor(m.start)), end: Math.min(textLength, Math.floor(m.end)) }))
    .filter((m) => m.end > m.start && isValidMark(m))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  for (const mark of sorted) {
    const previous = spans[spans.length - 1];
    if (previous && mark.start < previous.end) {
      if (mark.end <= previous.end || mark.kind === 'sub' || previous.kind === 'sub') continue; // a replacement is never cut
      mark.start = previous.end;
    }
    const last = spans[spans.length - 1];
    if (last?.kind === 'emphasis' && mark.kind === 'emphasis' && last.end === mark.start && last.value === mark.value) {
      last.end = mark.end;
    } else {
      spans.push(mark);
    }
  }

  const byPosition = new Map<number, TextMark>();
  for (const mark of marks.filter((m) => m.kind === 'break')) {
    const position = Math.max(0, Math.min(textLength, Math.floor(mark.start)));
    const candidate: TextMark = { kind: 'break', start: position, end: position, value: mark.value };
    if (isValidMark(candidate) && !insideSpan(spans, position)) byPosition.set(position, candidate);
  }

  return [...spans, ...byPosition.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Adds a mark; whatever it covers of other spans is replaced (a pronunciation is removed as a whole). */
export function addMark(marks: TextMark[], added: TextMark, textLength: number): TextMark[] {
  if (added.kind === 'break') {
    return normalizeMarks([...marks, { ...added, end: added.start }], textLength);
  }

  const kept: TextMark[] = [];
  for (const existing of marks) {
    if (!isSpan(existing) || existing.end <= added.start || existing.start >= added.end) {
      kept.push(existing);
    } else if (existing.kind === 'emphasis') {
      if (existing.start < added.start) kept.push({ ...existing, end: added.start });
      if (existing.end > added.end) kept.push({ ...existing, start: added.end });
    }
    // an overlapped pronunciation is dropped
  }
  return normalizeMarks([...kept, added], textLength);
}

/** Removes spans (or parts of emphasis) and pauses in [start, end]. */
export function clearMarksRange(marks: TextMark[], start: number, end: number, textLength: number): TextMark[] {
  const kept: TextMark[] = [];
  for (const existing of marks) {
    if (existing.kind === 'break') {
      if (existing.start < start || existing.start > end) kept.push(existing);
    } else if (existing.end <= start || existing.start >= end) {
      kept.push(existing);
    } else if (existing.kind === 'emphasis') {
      if (existing.start < start) kept.push({ ...existing, end: start });
      if (existing.end > end) kept.push({ ...existing, start: end });
    }
  }
  return normalizeMarks(kept, textLength);
}

/** Moves the marks along with an edit of the text so they keep pointing at the same words. */
export function rebaseMarks(marks: TextMark[], oldText: string, newText: string): TextMark[] {
  if (marks.length === 0 || oldText === newText) return marks;
  const { prefix, oldEnd, delta } = diffEdit(oldText, newText);

  const moved: TextMark[] = [];
  for (const mark of marks) {
    if (mark.kind === 'break') {
      if (mark.start <= prefix) moved.push(mark);
      else if (mark.start >= oldEnd) moved.push({ ...mark, start: mark.start + delta, end: mark.end + delta });
      // a pause inside the replaced part is gone with it
    } else if (mark.end <= prefix) {
      moved.push(mark);
    } else if (mark.start >= oldEnd) {
      moved.push({ ...mark, start: mark.start + delta, end: mark.end + delta });
    } else if (mark.kind === 'emphasis') {
      if (mark.start <= prefix && mark.end >= oldEnd) {
        moved.push({ ...mark, end: mark.end + delta });
      } else {
        if (mark.start < prefix) moved.push({ ...mark, end: prefix });
        if (mark.end > oldEnd) moved.push({ ...mark, start: oldEnd + delta, end: mark.end + delta });
      }
    }
    // a pronunciation whose text was edited no longer describes it: dropped
  }
  return normalizeMarks(moved, newText.length);
}

/**
 * The part of the marks that falls into [start, end), shifted so `start` becomes 0. A pronunciation
 * is only kept when it lies completely inside. A pause at the very end counts for the last chunk only.
 */
export function sliceMarks(marks: TextMark[], start: number, end: number, includeEnd = false): TextMark[] {
  return marks.flatMap((mark): TextMark[] => {
    if (mark.kind === 'break') {
      const inside = mark.start >= start && (mark.start < end || (includeEnd && mark.start === end));
      return inside ? [{ ...mark, start: mark.start - start, end: mark.end - start }] : [];
    }
    if (mark.end <= start || mark.start >= end) return [];
    if (mark.kind === 'sub') {
      return mark.start >= start && mark.end <= end ? [{ ...mark, start: mark.start - start, end: mark.end - start }] : [];
    }
    return [{ ...mark, start: Math.max(mark.start, start) - start, end: Math.min(mark.end, end) - start }];
  });
}

/** Total length of the manual pauses in milliseconds. */
export function totalBreakMs(marks: TextMark[]): number {
  return marks.filter((m) => m.kind === 'break').reduce((sum, m) => sum + breakMs(m.value), 0);
}

export const sameMarks = (a: TextMark[], b: TextMark[]): boolean =>
  a.length === b.length && a.every((m, i) => m.kind === b[i]?.kind && m.start === b[i]?.start && m.end === b[i]?.end && m.value === b[i]?.value);

export function markLabel(mark: TextMark): string {
  switch (mark.kind) {
    case 'emphasis':
      return `Emphasis ${mark.value}`;
    case 'sub':
      return 'Pronounced as';
    default:
      return mark.value.endsWith('ms') ? `Pause ${mark.value.replace('ms', ' ms')}` : `Pause ${mark.value}`;
  }
}
