import { describe, it, expect } from 'vitest';
import {
  addSegment,
  clearRange,
  normalizeSegments,
  rebaseSegments,
  sameSegments,
  sliceSegments,
  toRuns,
  type EmotionSegment,
} from './emotionSegments';

const seg = (start: number, end: number, emotion = 'calm'): EmotionSegment => ({ start, end, emotion });

describe('normalizeSegments', () => {
  it('sorts, clamps and drops empty or invalid segments', () => {
    expect(normalizeSegments([seg(8, 20), seg(2, 2), seg(-3, 4), seg(5, 3), { start: 0, end: 5, emotion: '' }], 10)).toEqual([
      seg(0, 4),
      seg(8, 10),
    ]);
  });

  it('keeps the earlier segment where segments overlap', () => {
    expect(normalizeSegments([seg(0, 6, 'sad'), seg(4, 9, 'angry')], 10)).toEqual([seg(0, 6, 'sad'), seg(6, 9, 'angry')]);
    expect(normalizeSegments([seg(0, 9, 'sad'), seg(2, 4, 'angry')], 10)).toEqual([seg(0, 9, 'sad')]);
  });

  it('merges touching segments with the same emotion only', () => {
    expect(normalizeSegments([seg(0, 3), seg(3, 6)], 10)).toEqual([seg(0, 6)]);
    expect(normalizeSegments([seg(0, 3, 'sad'), seg(3, 6, 'calm')], 10)).toHaveLength(2);
  });
});

describe('addSegment / clearRange', () => {
  it('replaces the covered part of existing segments', () => {
    const result = addSegment([seg(0, 10, 'sad')], seg(3, 6, 'angry'), 20);
    expect(result).toEqual([seg(0, 3, 'sad'), seg(3, 6, 'angry'), seg(6, 10, 'sad')]);
  });

  it('extends a segment when the same emotion is added next to it', () => {
    expect(addSegment([seg(0, 4)], seg(4, 8), 20)).toEqual([seg(0, 8)]);
  });

  it('removes an emotion from a range and splits segments around it', () => {
    expect(clearRange([seg(0, 10)], 3, 6, 20)).toEqual([seg(0, 3), seg(6, 10)]);
    expect(clearRange([seg(0, 10)], 0, 10, 20)).toEqual([]);
    expect(clearRange([seg(0, 4), seg(8, 12)], 5, 7, 20)).toEqual([seg(0, 4), seg(8, 12)]);
  });
});

describe('rebaseSegments', () => {
  const text = 'Hello brave new world';
  const brave = [seg(6, 11, 'angry')]; // "brave"

  it('keeps everything as is when the text did not change', () => {
    expect(rebaseSegments(brave, text, text)).toBe(brave);
  });

  it('does not touch segments before the edit', () => {
    expect(rebaseSegments(brave, text, `${text}!!!`)).toEqual(brave);
  });

  it('shifts segments after an insertion or deletion', () => {
    expect(rebaseSegments(brave, text, `Oh, ${text}`)).toEqual([seg(10, 15, 'angry')]);
    expect(rebaseSegments(brave, text, 'llo brave new world')).toEqual([seg(4, 9, 'angry')]);
  });

  it('keeps highlighting when typing inside the segment', () => {
    expect(rebaseSegments(brave, text, 'Hello braXve new world')).toEqual([seg(6, 12, 'angry')]);
    expect(rebaseSegments(brave, text, 'Hello bve new world')).toEqual([seg(6, 9, 'angry')]);
  });

  it('does not extend a segment when typing at its edges', () => {
    expect(rebaseSegments(brave, text, 'Hello Xbrave new world')).toEqual([seg(7, 12, 'angry')]);
    expect(rebaseSegments(brave, text, 'Hello braveX new world')).toEqual([seg(6, 11, 'angry')]);
  });

  it('cuts the part of a segment that was replaced at its edge', () => {
    // "brave new" replaced by "big" -> the segment on "brave" loses its ending "ve"
    expect(rebaseSegments(brave, text, 'Hello bra world')).toEqual([seg(6, 9, 'angry')]);
    // the diff keeps the common "b", so only that letter stays highlighted
    expect(rebaseSegments(brave, text, 'Hello big world')).toEqual([seg(6, 7, 'angry')]);
  });

  it('drops a segment whose text was deleted completely', () => {
    expect(rebaseSegments(brave, text, 'Hello  new world')).toEqual([]);
  });

  it('handles several segments in one edit', () => {
    const many = [seg(0, 5, 'sad'), seg(12, 15, 'calm')]; // "Hello", "new"
    expect(rebaseSegments(many, text, `>> ${text}`)).toEqual([seg(3, 8, 'sad'), seg(15, 18, 'calm')]);
  });

  it('produces valid segments for every edit of a sample text (property check)', () => {
    const base = 'The quick brown fox jumps over the lazy dog';
    const segments = [seg(4, 9, 'sad'), seg(16, 19, 'angry'), seg(35, 43, 'calm')];
    for (let i = 0; i <= base.length; i++) {
      for (let j = i; j <= base.length; j++) {
        const edited = base.slice(0, i) + '<>' + base.slice(j);
        for (const s of rebaseSegments(segments, base, edited)) {
          expect(s.start).toBeGreaterThanOrEqual(0);
          expect(s.end).toBeLessThanOrEqual(edited.length);
          expect(s.end).toBeGreaterThan(s.start);
        }
      }
    }
  });
});

describe('sliceSegments', () => {
  it('returns the overlapping part relative to the slice', () => {
    expect(sliceSegments([seg(2, 8, 'sad'), seg(12, 15, 'calm')], 5, 13)).toEqual([seg(0, 3, 'sad'), seg(7, 8, 'calm')]);
  });

  it('returns nothing for a slice without segments', () => {
    expect(sliceSegments([seg(2, 4)], 10, 20)).toEqual([]);
  });
});

describe('toRuns', () => {
  it('splits a text into plain and emotional runs that add up to the text', () => {
    const text = 'Hello brave world';
    const runs = toRuns(text, [seg(6, 11, 'angry')]);
    expect(runs).toEqual([
      { text: 'Hello ', emotion: null },
      { text: 'brave', emotion: 'angry' },
      { text: ' world', emotion: null },
    ]);
    expect(runs.map((r) => r.text).join('')).toBe(text);
  });

  it('is one plain run without segments', () => {
    expect(toRuns('abc', [])).toEqual([{ text: 'abc', emotion: null }]);
    expect(toRuns('', [])).toEqual([]);
  });

  it('ignores segments beyond the text', () => {
    expect(toRuns('abc', [seg(5, 9)])).toEqual([{ text: 'abc', emotion: null }]);
  });
});

describe('sameSegments', () => {
  it('compares highlighting', () => {
    expect(sameSegments([seg(0, 2)], [seg(0, 2)])).toBe(true);
    expect(sameSegments([seg(0, 2)], [seg(0, 3)])).toBe(false);
    expect(sameSegments([], [seg(0, 1)])).toBe(false);
  });
});
