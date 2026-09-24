import { describe, it, expect } from 'vitest';
import {
  estimateWords,
  findWordIndex,
  joinMarks,
  parseStoredMarks,
  serializeMarks,
  wordRange,
  wordsFromApi,
  type WordTiming,
} from './speechMarks';

const api = {
  type: 'sentence', start: 0, end: 11, start_time: 50, end_time: 900, value: 'Hello world',
  chunks: [
    { type: 'word', start: 0, end: 5, start_time: 50, end_time: 400, value: 'Hello' },
    { type: 'word', start: 6, end: 11, start_time: 450, end_time: 900, value: 'world' },
  ],
};

describe('wordsFromApi', () => {
  it('reads the words of the root object', () => {
    expect(wordsFromApi(api)).toEqual([[0, 5, 50, 400], [6, 11, 450, 900]]);
  });

  it('moves offsets and times so chunks can be joined', () => {
    expect(wordsFromApi(api, 100, 2000)[1]).toEqual([106, 111, 2450, 2900]);
  });

  it('drops malformed words and copes with anything that is not marks', () => {
    expect(wordsFromApi({ chunks: [{ start: 'a', end: 2, start_time: 0, end_time: 1 }, null, { start: 3, end: 3, start_time: 0, end_time: 1 }] })).toEqual([]);
    expect(wordsFromApi(null)).toEqual([]);
    expect(wordsFromApi([1, 2])).toEqual([]);
    expect(wordsFromApi({ chunks: 'x' })).toEqual([]);
  });
});

describe('stored marks', () => {
  const marks = { durationMs: 1000, words: [[0, 5, 50, 400], [6, 11, 450, 900]] as WordTiming[] };

  it('round-trips', () => {
    expect(parseStoredMarks(serializeMarks(marks), 11)).toEqual(marks);
  });

  it('rejects anything that does not fit the text or the format', () => {
    expect(parseStoredMarks(null, 11)).toBeNull();
    expect(parseStoredMarks({ v: 2, durationMs: 1, words: [] }, 11)).toBeNull();
    expect(parseStoredMarks(serializeMarks(marks), 8)).toBeNull(); // words beyond the text
    expect(parseStoredMarks({ v: 1, durationMs: 10, words: [[0, 5, 50]] }, 11)).toBeNull();
    expect(parseStoredMarks({ v: 1, durationMs: 10, words: [[6, 8, 0, 1], [0, 3, 2, 3]] }, 11)).toBeNull(); // not in order
    expect(parseStoredMarks({ v: 1, durationMs: 10, words: [[0, 5, 900, 400]] }, 11)).toBeNull();
    expect(parseStoredMarks({ v: 1, durationMs: 10, words: [] }, 11)).toBeNull();
  });
});

describe('joinMarks', () => {
  it('adds up the durations and keeps the words in order', () => {
    const joined = joinMarks([
      { marks: { durationMs: 500, words: [[0, 3, 0, 400]] }, textOffset: 0 },
      { marks: { durationMs: 700, words: [[0, 3, 100, 600]] }, textOffset: 10 },
    ]);
    expect(joined).toEqual({ durationMs: 1200, words: [[0, 3, 0, 400], [10, 13, 600, 1100]] });
  });
});

describe('findWordIndex', () => {
  const words: WordTiming[] = [[0, 2, 100, 300], [3, 6, 400, 700], [7, 9, 1000, 1200]];

  it('finds the word that has started, and stays on it during a pause', () => {
    expect(findWordIndex(words, 0)).toBe(-1);
    expect(findWordIndex(words, 100)).toBe(0);
    expect(findWordIndex(words, 350)).toBe(0); // gap between words
    expect(findWordIndex(words, 400)).toBe(1);
    expect(findWordIndex(words, 5000)).toBe(2);
    expect(findWordIndex([], 100)).toBe(-1);
  });
});

describe('wordRange', () => {
  it('leaves out whitespace that is counted to a word', () => {
    expect(wordRange('Really,  two', [0, 9, 0, 1])).toEqual({ start: 0, end: 7 });
    expect(wordRange('  hi', [0, 4, 0, 1])).toEqual({ start: 2, end: 4 });
    expect(wordRange('ab', [0, 99, 0, 1])).toEqual({ start: 0, end: 2 });
  });
});

describe('estimateWords', () => {
  it('spreads the words over the duration by length', () => {
    const words = estimateWords('aa bbbb cc', 1000);
    expect(words).toHaveLength(3);
    expect(words[0]?.[2]).toBe(0);
    expect(words[2]?.[3]).toBe(1000);
    // longer words take longer, and the words follow each other without gaps
    expect((words[1]?.[3] ?? 0) - (words[1]?.[2] ?? 0)).toBeGreaterThan((words[0]?.[3] ?? 0) - (words[0]?.[2] ?? 0));
    expect(words[1]?.[2]).toBe(words[0]?.[3]);
  });

  it('is empty without text or duration', () => {
    expect(estimateWords('   ', 1000)).toEqual([]);
    expect(estimateWords('hi', 0)).toEqual([]);
  });
});
