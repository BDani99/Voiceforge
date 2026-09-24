import { describe, it, expect } from 'vitest';
import { pauseLabel, toDisplayRuns } from './displayRuns';

describe('toDisplayRuns', () => {
  it('is one plain run without any marks', () => {
    expect(toDisplayRuns('Hello', [], [])).toEqual({
      runs: [{ text: 'Hello', emotion: null, emphasis: null, alias: null, pause: null }],
      endPause: null,
    });
  });

  it('splits where emotion, emphasis, pronunciation and pauses change and keeps all text', () => {
    const text = 'one two three four';
    const { runs, endPause } = toDisplayRuns(
      text,
      [{ start: 4, end: 7, emotion: 'sad' }],
      [
        { kind: 'emphasis', start: 0, end: 7, value: 'strong' },
        { kind: 'sub', start: 8, end: 13, value: '3' },
        { kind: 'break', start: 13, end: 13, value: '500ms' },
        { kind: 'break', start: 18, end: 18, value: 'weak' },
      ],
    );
    expect(runs.map((r) => r.text).join('')).toBe(text);
    expect(runs[0]).toMatchObject({ text: 'one ', emotion: null, emphasis: 'strong' });
    expect(runs[1]).toMatchObject({ text: 'two', emotion: 'sad', emphasis: 'strong' });
    expect(runs.find((r) => r.alias)).toMatchObject({ text: 'three', alias: '3' });
    expect(runs.find((r) => r.pause === '500ms')?.text).toBe(' four');
    expect(endPause).toBe('weak');
  });
});

describe('pauseLabel', () => {
  it('formats times and leaves strengths alone', () => {
    expect(pauseLabel('500ms')).toBe('500 ms');
    expect(pauseLabel('2000ms')).toBe('2 s');
    expect(pauseLabel('1250ms')).toBe('1250 ms');
    expect(pauseLabel('strong')).toBe('strong');
  });
});
