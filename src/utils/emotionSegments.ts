/**
 * Emotion applied to a highlighted part of a paragraph. Offsets are UTF-16 code unit
 * positions into the paragraph text, `start` inclusive and `end` exclusive.
 */
export interface EmotionSegment {
  start: number;
  end: number;
  emotion: string;
}

export interface TextRun {
  text: string;
  emotion: string | null;
}

/** Clamps, sorts and cleans a list: no empty or overlapping segments, neighbours with the same emotion merged. */
export function normalizeSegments(segments: EmotionSegment[], textLength: number): EmotionSegment[] {
  const sorted = segments
    .map((s) => ({ ...s, start: Math.max(0, Math.floor(s.start)), end: Math.min(textLength, Math.floor(s.end)) }))
    .filter((s) => s.end > s.start && s.emotion)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const result: EmotionSegment[] = [];
  for (const segment of sorted) {
    const previous = result[result.length - 1];
    if (previous && segment.start < previous.end) {
      // Overlap: the earlier segment keeps its part, the later one only what is left.
      if (segment.end <= previous.end) continue;
      segment.start = previous.end;
    }
    if (previous?.end === segment.start && previous.emotion === segment.emotion) {
      previous.end = segment.end;
    } else {
      result.push(segment);
    }
  }
  return result;
}

/** Applies an emotion to a range; whatever it covers of existing segments is replaced. */
export function addSegment(segments: EmotionSegment[], added: EmotionSegment, textLength: number): EmotionSegment[] {
  const kept: EmotionSegment[] = [];
  for (const existing of segments) {
    if (existing.end <= added.start || existing.start >= added.end) {
      kept.push(existing);
      continue;
    }
    if (existing.start < added.start) kept.push({ ...existing, end: added.start });
    if (existing.end > added.end) kept.push({ ...existing, start: added.end });
  }
  return normalizeSegments([...kept, added], textLength);
}

/** Removes the emotion from a range (a partly covered segment is shortened or split). */
export function clearRange(segments: EmotionSegment[], start: number, end: number, textLength: number): EmotionSegment[] {
  const kept: EmotionSegment[] = [];
  for (const existing of segments) {
    if (existing.end <= start || existing.start >= end) {
      kept.push(existing);
      continue;
    }
    if (existing.start < start) kept.push({ ...existing, end: start });
    if (existing.end > end) kept.push({ ...existing, start: end });
  }
  return normalizeSegments(kept, textLength);
}

/**
 * Moves the segments along with an edit of the text so they keep pointing at the same words.
 * The edit is found as the differing middle between the old and the new text.
 */
export function rebaseSegments(segments: EmotionSegment[], oldText: string, newText: string): EmotionSegment[] {
  if (segments.length === 0 || oldText === newText) return segments;

  let prefix = 0;
  const maxPrefix = Math.min(oldText.length, newText.length);
  while (prefix < maxPrefix && oldText[prefix] === newText[prefix]) prefix++;

  let suffix = 0;
  const maxSuffix = maxPrefix - prefix;
  while (suffix < maxSuffix && oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]) suffix++;

  const oldEnd = oldText.length - suffix; // end of the replaced part in the old text
  const delta = newText.length - oldText.length;

  const moved: EmotionSegment[] = [];
  for (const segment of segments) {
    if (segment.end <= prefix) {
      moved.push(segment); // entirely before the edit
    } else if (segment.start >= oldEnd) {
      moved.push({ ...segment, start: segment.start + delta, end: segment.end + delta }); // entirely after it
    } else if (segment.start <= prefix && segment.end >= oldEnd) {
      moved.push({ ...segment, end: segment.end + delta }); // edit inside: the segment grows or shrinks
    } else {
      // The edit cuts into one edge: keep what lies outside the replaced part.
      if (segment.start < prefix) moved.push({ ...segment, end: prefix });
      if (segment.end > oldEnd) moved.push({ ...segment, start: oldEnd + delta, end: segment.end + delta });
    }
  }
  return normalizeSegments(moved, newText.length);
}

/** The part of the segments that falls into [start, end), shifted so `start` becomes 0. */
export function sliceSegments(segments: EmotionSegment[], start: number, end: number): EmotionSegment[] {
  return segments
    .filter((s) => s.end > start && s.start < end)
    .map((s) => ({ start: Math.max(s.start, start) - start, end: Math.min(s.end, end) - start, emotion: s.emotion }));
}

/** Splits the text into consecutive runs, each with the emotion that applies to it (or null). */
export function toRuns(text: string, segments: EmotionSegment[]): TextRun[] {
  const clean = normalizeSegments(segments, text.length);
  const runs: TextRun[] = [];
  let position = 0;

  for (const segment of clean) {
    if (segment.start > position) runs.push({ text: text.slice(position, segment.start), emotion: null });
    runs.push({ text: text.slice(segment.start, segment.end), emotion: segment.emotion });
    position = segment.end;
  }
  if (position < text.length) runs.push({ text: text.slice(position), emotion: null });
  return runs;
}

/** Whether two segment lists describe the same highlighting. */
export function sameSegments(a: EmotionSegment[], b: EmotionSegment[]): boolean {
  return a.length === b.length && a.every((s, i) => s.start === b[i]?.start && s.end === b[i]?.end && s.emotion === b[i]?.emotion);
}
