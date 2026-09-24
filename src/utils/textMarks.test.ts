import { describe, it, expect } from 'vitest';
import {
  addMark,
  breakMs,
  clearMarksRange,
  isValidMark,
  normalizeMarks,
  rebaseMarks,
  sliceMarks,
  totalBreakMs,
  type TextMark,
} from './textMarks';

const emphasis = (start: number, end: number, value = 'strong'): TextMark => ({ kind: 'emphasis', start, end, value });
const sub = (start: number, end: number, value = 'three quarters'): TextMark => ({ kind: 'sub', start, end, value });
const pause = (at: number, value = '500ms'): TextMark => ({ kind: 'break', start: at, end: at, value });

describe('isValidMark', () => {
  it('accepts the documented values only', () => {
    expect(isValidMark(emphasis(0, 1, 'moderate'))).toBe(true);
    expect(isValidMark(emphasis(0, 1, 'huge'))).toBe(false);
    expect(isValidMark(sub(0, 1, '  '))).toBe(false);
    expect(isValidMark(sub(0, 1, 'x'.repeat(101)))).toBe(false);
    expect(isValidMark(pause(3, '250ms'))).toBe(true);
    expect(isValidMark(pause(3, 'x-strong'))).toBe(true);
    expect(isValidMark(pause(3, '10000ms'))).toBe(true);
    expect(isValidMark(pause(3, '10001ms'))).toBe(false);
    expect(isValidMark(pause(3, '0ms'))).toBe(false);
    expect(isValidMark(pause(3, 'forever'))).toBe(false);
  });
});

describe('normalizeMarks', () => {
  it('clamps, sorts and drops empty or invalid marks', () => {
    const result = normalizeMarks([emphasis(8, 40), emphasis(2, 2), sub(0, 4), emphasis(5, 6, 'nope')], 10);
    expect(result).toEqual([sub(0, 4), emphasis(8, 10)]);
  });

  it('keeps spans apart and merges neighbours of the same emphasis', () => {
    expect(normalizeMarks([emphasis(0, 5), emphasis(3, 8)], 10)).toEqual([emphasis(0, 8)]);
    expect(normalizeMarks([emphasis(0, 5, 'reduced'), emphasis(5, 8, 'strong')], 10)).toHaveLength(2);
  });

  it('never cuts a pronunciation and never keeps a pause inside one', () => {
    expect(normalizeMarks([sub(2, 8), emphasis(0, 5)], 10)).toEqual([emphasis(0, 5)]);
    const result = normalizeMarks([sub(2, 8), pause(5), pause(2), pause(8)], 10);
    expect(result).toHaveLength(3);
    expect(result).toEqual(expect.arrayContaining([sub(2, 8), pause(2), pause(8)]));
    expect(result).not.toContainEqual(pause(5));
  });

  it('keeps one pause per position, the last wins', () => {
    expect(normalizeMarks([pause(3, '250ms'), pause(3, 'strong')], 10)).toEqual([pause(3, 'strong')]);
  });
});

describe('addMark / clearMarksRange', () => {
  it('replaces the covered part of an emphasis', () => {
    const result = addMark([emphasis(0, 10, 'reduced')], emphasis(3, 6, 'strong'), 12);
    expect(result).toEqual([emphasis(0, 3, 'reduced'), emphasis(3, 6, 'strong'), emphasis(6, 10, 'reduced')]);
  });

  it('removes an overlapped pronunciation completely', () => {
    expect(addMark([sub(2, 6)], emphasis(4, 9), 12)).toEqual([emphasis(4, 9)]);
    expect(addMark([emphasis(0, 8)], sub(3, 5), 12)).toEqual([emphasis(0, 3), sub(3, 5), emphasis(5, 8)]);
  });

  it('adds a pause and ignores one inside a pronunciation', () => {
    expect(addMark([], pause(4), 10)).toEqual([pause(4)]);
    expect(addMark([sub(2, 8)], pause(5), 10)).toEqual([sub(2, 8)]);
  });

  it('clears a range: shortens emphasis, drops pronunciations and pauses', () => {
    const marks = [emphasis(0, 10), sub(12, 16), pause(20)];
    expect(clearMarksRange(marks, 4, 14, 30)).toEqual([emphasis(0, 4), pause(20)]);
    expect(clearMarksRange(marks, 19, 21, 30)).toEqual([emphasis(0, 10), sub(12, 16)]);
  });
});

describe('rebaseMarks', () => {
  it('moves marks that are after an insertion and keeps those before', () => {
    const oldText = 'Hello world and more text';
    const newText = 'Hello big world and more text';
    const result = rebaseMarks([emphasis(6, 11), pause(15)], oldText, newText);
    expect(result).toEqual([emphasis(10, 15), pause(19)]);
  });

  it('grows an emphasis when text is typed inside it and drops a pause in replaced text', () => {
    expect(rebaseMarks([emphasis(0, 10)], 'abcdefghij', 'abcXXdefghij')).toEqual([emphasis(0, 12)]);
    expect(rebaseMarks([pause(4)], 'abcdefghij', 'abZZij')).toEqual([]);
  });

  it('keeps a pause that sits exactly where text is inserted before it', () => {
    expect(rebaseMarks([pause(5)], 'abcde fgh', 'abcdeXX fgh')).toEqual([pause(5)]);
  });

  it('drops a pronunciation whose words were edited', () => {
    expect(rebaseMarks([sub(0, 3)], 'a/b rest', 'a-b rest')).toEqual([]);
    expect(rebaseMarks([sub(0, 3)], 'a/b rest', 'a/b rests')).toEqual([sub(0, 3)]);
  });
});

describe('sliceMarks', () => {
  it('shifts marks into a chunk and clips emphasis', () => {
    expect(sliceMarks([emphasis(8, 14)], 10, 20)).toEqual([emphasis(0, 4)]);
    expect(sliceMarks([emphasis(0, 5)], 10, 20)).toEqual([]);
  });

  it('keeps a pronunciation only when it is completely inside', () => {
    expect(sliceMarks([sub(12, 15)], 10, 20)).toEqual([sub(2, 5)]);
    expect(sliceMarks([sub(8, 12)], 10, 20)).toEqual([]);
  });

  it('gives a pause on the boundary to the next chunk, and one at the very end to the last', () => {
    expect(sliceMarks([pause(10)], 0, 10)).toEqual([]);
    expect(sliceMarks([pause(10)], 10, 20)).toEqual([pause(0)]);
    expect(sliceMarks([pause(20)], 10, 20, true)).toEqual([pause(10)]);
    expect(sliceMarks([pause(20)], 10, 20)).toEqual([]);
  });
});

describe('breaks', () => {
  it('adds up the manual pauses', () => {
    expect(breakMs('750ms')).toBe(750);
    expect(breakMs('strong')).toBe(750);
    expect(totalBreakMs([pause(1, '500ms'), pause(2, '1500ms'), emphasis(0, 3)])).toBe(2000);
  });
});
