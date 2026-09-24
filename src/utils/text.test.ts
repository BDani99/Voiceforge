import { describe, it, expect } from 'vitest';
import { splitIntoChunkRanges, splitIntoChunks } from './text';

describe('splitIntoChunks', () => {
  it('keeps short text as one chunk', () => {
    expect(splitIntoChunks('Hello world.', 50)).toEqual(['Hello world.']);
  });

  it('splits on sentence boundaries without losing text', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const chunks = splitIntoChunks(text, 20);
    expect(chunks.every((c) => c.length <= 20)).toBe(true);
    expect(chunks.join(' ')).toBe(text);
  });

  it('hard-splits a single sentence longer than the limit', () => {
    const chunks = splitIntoChunks('a'.repeat(45), 20);
    expect(chunks.map((c) => c.length)).toEqual([20, 20, 5]);
  });

  it('returns nothing for blank text', () => {
    expect(splitIntoChunks('   ', 20)).toEqual([]);
  });
});

describe('splitIntoChunkRanges', () => {
  const cover = (text: string, max: number) => splitIntoChunkRanges(text, max);

  it('covers the whole text without gaps or overlaps', () => {
    const text = 'One. Two two. Three three three! Four? ' + 'x'.repeat(50) + ' end';
    const ranges = cover(text, 25);
    expect(ranges[0]?.start).toBe(0);
    expect(ranges[ranges.length - 1]?.end).toBe(text.length);
    ranges.forEach((r, i) => {
      if (i > 0) expect(r.start).toBe(ranges[i - 1]?.end);
      expect(r.end - r.start).toBeLessThanOrEqual(25);
      expect(r.end).toBeGreaterThan(r.start);
    });
    expect(ranges.map((r) => text.slice(r.start, r.end)).join('')).toBe(text);
  });

  it('is one range for text within the limit', () => {
    expect(cover('short text', 50)).toEqual([{ start: 0, end: 10 }]);
  });

  it('keeps text without sentence punctuation and punctuation-only text', () => {
    expect(cover('...', 10)).toEqual([{ start: 0, end: 3 }]);
    expect(cover('no punctuation at all here', 10).map((r) => r.end - r.start)).toEqual([10, 10, 6]);
  });

  it('is empty for empty text', () => {
    expect(cover('', 10)).toEqual([]);
  });
});
