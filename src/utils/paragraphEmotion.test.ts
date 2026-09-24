import { describe, it, expect } from 'vitest';
import { effectiveParagraphEmotion, emotionMode, EMOTION_NEUTRAL, parseParagraphSettings, serializeParagraphSettings } from './paragraphEmotion';

const p = (emotion: string, segments: { start: number; end: number; emotion: string }[] = []) => ({ emotion, segments, marks: [] });

describe('emotionMode', () => {
  it('distinguishes the four ways a paragraph gets its emotion', () => {
    expect(emotionMode(p(''))).toBe('default');
    expect(emotionMode(p(EMOTION_NEUTRAL))).toBe('neutral');
    expect(emotionMode(p('sad'))).toBe('paragraph');
    expect(emotionMode(p('', [{ start: 0, end: 2, emotion: 'calm' }]))).toBe('highlights');
  });

  it('treats highlights as exclusive with a paragraph emotion', () => {
    expect(emotionMode(p('sad', [{ start: 0, end: 2, emotion: 'calm' }]))).toBe('highlights');
  });
});

describe('effectiveParagraphEmotion', () => {
  it('uses the default emotion only for paragraphs without their own setting', () => {
    expect(effectiveParagraphEmotion(p(''), 'warm')).toBe('warm');
    expect(effectiveParagraphEmotion(p(''), '')).toBeNull();
    expect(effectiveParagraphEmotion(p('sad'), 'warm')).toBe('sad');
  });

  it('is neutral when the paragraph is explicitly neutral or uses highlights', () => {
    expect(effectiveParagraphEmotion(p(EMOTION_NEUTRAL), 'warm')).toBeNull();
    expect(effectiveParagraphEmotion(p('', [{ start: 0, end: 2, emotion: 'calm' }]), 'warm')).toBeNull();
  });
});

describe('stored settings', () => {
  it('round-trips', () => {
    const paragraph = p('', [{ start: 2, end: 6, emotion: 'angry' }]);
    expect(parseParagraphSettings(serializeParagraphSettings(paragraph), 20)).toEqual(paragraph);
    expect(parseParagraphSettings(serializeParagraphSettings(p('calm')), 20)).toEqual(p('calm'));
  });

  it('falls back to defaults for missing or malformed data', () => {
    expect(parseParagraphSettings(null, 10)).toEqual(p(''));
    expect(parseParagraphSettings({}, 10)).toEqual(p(''));
    expect(parseParagraphSettings([1, 2], 10)).toEqual(p(''));
    expect(parseParagraphSettings({ emotion: 42, segments: 'x' }, 10)).toEqual(p(''));
  });

  it('drops unknown emotions and invalid segments', () => {
    expect(parseParagraphSettings({ emotion: 'evil"><x' }, 10)).toEqual(p(''));
    const parsed = parseParagraphSettings({
      segments: [
        { start: 0, end: 4, emotion: 'sad' },
        { start: 2, end: 3, emotion: 'not-real' },
        { start: 'a', end: 3, emotion: 'sad' },
        'junk',
        { start: 6, end: 99, emotion: 'calm' },
      ],
    }, 10);
    expect(parsed.segments).toEqual([{ start: 0, end: 4, emotion: 'sad' }, { start: 6, end: 10, emotion: 'calm' }]);
  });

  it('lets highlights win when both are stored', () => {
    expect(parseParagraphSettings({ emotion: 'sad', segments: [{ start: 0, end: 2, emotion: 'calm' }] }, 10)).toEqual(
      p('', [{ start: 0, end: 2, emotion: 'calm' }]),
    );
  });

  it('keeps an explicit neutral setting', () => {
    expect(parseParagraphSettings({ emotion: EMOTION_NEUTRAL }, 5)).toEqual(p(EMOTION_NEUTRAL));
  });
});
