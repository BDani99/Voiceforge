import { describe, it, expect } from 'vitest';
import { buildCues, paragraphOffsets, toSrt, toVtt, wrapLines } from './captions';
import { estimateWords } from './speechMarks';

/** Words of a text, each 300 ms long with 100 ms between them, starting at `from`. */
const timed = (text: string, from = 0) => {
  let time = from;
  return [...text.matchAll(/\S+/g)].map((m) => {
    const word: [number, number, number, number] = [m.index, m.index + m[0].length, time, time + 300];
    time += 400;
    return word;
  });
};

describe('wrapLines', () => {
  it('keeps short text on one line and balances long text on two', () => {
    expect(wrapLines('Short text', 42)).toBe('Short text');
    const wrapped = wrapLines('This sentence is definitely too long to fit on a single caption line', 42);
    const lines = wrapped.split('\n');
    expect(lines).toHaveLength(2);
    expect(Math.abs((lines[0]?.length ?? 0) - (lines[1]?.length ?? 0))).toBeLessThan(12);
  });

  it('collapses whitespace and line breaks', () => {
    expect(wrapLines('a \n  b', 42)).toBe('a b');
  });
});

describe('buildCues', () => {
  it('ends a cue at a sentence end once it has enough text, and uses the word times', () => {
    const text = 'This is the first sentence. And here comes another one right after it.';
    const cues = buildCues([{ text, words: timed(text), offsetMs: 0 }]);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.text).toBe('This is the first sentence.');
    expect(cues[0]?.startMs).toBe(0);
    expect(cues[1]?.text.replace('\n', ' ')).toBe('And here comes another one right after it.');
  });

  it('never joins the words of a long text into one cue', () => {
    const text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const cues = buildCues([{ text, words: timed(text), offsetMs: 0 }]);
    expect(cues.length).toBeGreaterThan(2);
    for (const cue of cues) {
      expect(cue.text.split('\n').length).toBeLessThanOrEqual(2);
      expect(cue.text.split('\n').every((line) => line.length <= 42)).toBe(true);
      expect(cue.endMs - cue.startMs).toBeLessThanOrEqual(6800);
    }
    expect(cues.map((c) => c.text.replace('\n', ' ')).join(' ')).toBe(text);
  });

  it('starts a new cue after a long silence', () => {
    const text = 'one two three four';
    const words = timed(text);
    words[2] = [words[2]![0], words[2]![1], words[2]![2] + 2000, words[2]![3] + 2000];
    words[3] = [words[3]![0], words[3]![1], words[3]![2] + 2000, words[3]![3] + 2000];
    expect(buildCues([{ text, words, offsetMs: 0 }]).map((c) => c.text)).toEqual(['one two', 'three four']);
  });

  it('puts the paragraphs after each other and never overlaps cues', () => {
    const a = 'First paragraph text here.';
    const b = 'Second paragraph follows.';
    const cues = buildCues([
      { text: a, words: timed(a), offsetMs: 0 },
      { text: b, words: timed(b), offsetMs: 5000 },
    ]);
    expect(cues).toHaveLength(2);
    expect(cues[1]?.startMs).toBe(5000);
    expect(cues[0]!.endMs).toBeLessThanOrEqual(cues[1]!.startMs);
  });

  it('gives a very short cue a little more time when there is room', () => {
    const cues = buildCues([{ text: 'Hi', words: [[0, 2, 1000, 1100]], offsetMs: 0 }]);
    expect(cues[0]?.endMs).toBe(1800);
  });

  it('works with estimated timing too', () => {
    const text = 'Estimated words spread over the duration of the clip.';
    const cues = buildCues([{ text, words: estimateWords(text, 4000), offsetMs: 0 }]);
    expect(cues[0]?.startMs).toBe(0);
    expect(cues[cues.length - 1]?.endMs).toBeLessThanOrEqual(4000);
  });

  it('gives no cues without words', () => {
    expect(buildCues([{ text: 'x', words: [], offsetMs: 0 }])).toEqual([]);
  });
});

describe('paragraphOffsets', () => {
  it('adds the pause between paragraphs', () => {
    expect(paragraphOffsets([1000, 2000, 500], 300)).toEqual([0, 1300, 3600]);
    expect(paragraphOffsets([1000, 2000], 0)).toEqual([0, 1000]);
  });
});

describe('formats', () => {
  const cues = [
    { startMs: 0, endMs: 1500, text: 'Hello & <welcome>' },
    { startMs: 3_723_004, endMs: 3_725_000, text: 'Line one\nLine two' },
  ];

  it('writes SubRip with comma milliseconds and numbered cues', () => {
    expect(toSrt(cues)).toBe(
      '1\n00:00:00,000 --> 00:00:01,500\nHello & <welcome>\n\n2\n01:02:03,004 --> 01:02:05,000\nLine one\nLine two\n',
    );
  });

  it('writes WebVTT with a header, dot milliseconds and escaped markup', () => {
    expect(toVtt(cues)).toBe(
      'WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nHello &amp; &lt;welcome&gt;\n\n01:02:03.004 --> 01:02:05.000\nLine one\nLine two\n',
    );
  });

  it('handles no cues', () => {
    expect(toSrt([])).toBe('');
    expect(toVtt([])).toBe('WEBVTT\n\n');
  });
});
