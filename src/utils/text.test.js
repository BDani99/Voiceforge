import { describe, it, expect } from 'vitest';
import { splitIntoChunks } from './text';

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
});
