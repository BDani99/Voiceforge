import { describe, it, expect } from 'vitest';
import { DEFAULT_GLOBAL_DEFAULTS } from '../constants/voiceConstants';
import {
  copyName,
  parsePresetSettings,
  presetNameKey,
  presetSettingsEqual,
  summarizePreset,
  validatePresetName,
} from './presets';

describe('parsePresetSettings', () => {
  it('reads a complete preset', () => {
    const parsed = parsePresetSettings({
      language: 'en-US', voice: 'alicia', model: 'simba-3.2', pauseStrength: 'weak', emotion: 'calm', globalEmphasis: 'strong',
      pauseCustomTime: 500, paragraphGapPause: 300, fadeInDuration: 50, fadeOutDuration: 70,
      usePauseCustom: true, useParagraphGap: false, useFadeTransitions: true,
      globalDefaults: { ...DEFAULT_GLOBAL_DEFAULTS, pitch: 'high' },
    });
    expect(parsed).toMatchObject({ voice: 'alicia', model: 'simba-3.2', pauseCustomTime: 500, useParagraphGap: false });
    expect(parsed.globalDefaults?.pitch).toBe('high');
  });

  it('drops wrongly typed, unknown and malformed values', () => {
    expect(parsePresetSettings({ voice: 5, pauseCustomTime: 'x', usePauseCustom: 'yes', evil: '<script>', globalDefaults: { pitch: 1 } }))
      .toEqual({});
    expect(parsePresetSettings(null as never)).toEqual({}); // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
    expect(parsePresetSettings([1] as never)).toEqual({});
    expect(parsePresetSettings({ pauseCustomTime: Number.POSITIVE_INFINITY as never })).toEqual({});
  });

  it('accepts old presets that have no model', () => {
    expect(parsePresetSettings({ voice: 'oliver', emotion: 'relaxed' })).toEqual({ voice: 'oliver', emotion: 'relaxed' });
  });
});

describe('presetSettingsEqual', () => {
  it('treats missing fields as their defaults', () => {
    expect(presetSettingsEqual({}, { model: 'auto', pauseStrength: 'medium', useParagraphGap: true, emotion: '' })).toBe(true);
  });

  it('is independent of key order and detects real differences', () => {
    expect(presetSettingsEqual({ voice: 'a', emotion: 'sad' }, { emotion: 'sad', voice: 'a' })).toBe(true);
    expect(presetSettingsEqual({ voice: 'a' }, { voice: 'b' })).toBe(false);
    expect(presetSettingsEqual({ globalDefaults: { ...DEFAULT_GLOBAL_DEFAULTS, rate: 'fast' } }, {})).toBe(false);
    expect(presetSettingsEqual({ model: 'simba-3.0' }, {})).toBe(false);
  });
});

describe('names', () => {
  it('validates length, emptiness and duplicates ignoring case and spaces', () => {
    expect(validatePresetName('  ', [])).toMatch(/name/);
    expect(validatePresetName('x'.repeat(61), [])).toMatch(/at most 60/);
    expect(validatePresetName(' basic ', ['Basic'])).toMatch(/already/);
    expect(validatePresetName('Fresh', ['Basic'])).toBeNull();
    expect(presetNameKey('  Hello  ')).toBe('hello');
  });

  it('finds a free name for a copy', () => {
    expect(copyName('Basic', ['Basic'])).toBe('Basic copy');
    expect(copyName('Basic', ['Basic', 'basic copy'])).toBe('Basic copy 2');
    expect(copyName('Basic', ['Basic', 'Basic copy', 'Basic copy 2'])).toBe('Basic copy 3');
    expect(copyName('x'.repeat(60), []).length).toBeLessThanOrEqual(60);
  });
});

describe('summarizePreset', () => {
  const voices = [{ id: 'alicia', display_name: 'Alicia', locale: 'en-US' }];

  it('describes voice, language, model and what differs from neutral', () => {
    const summary = summarizePreset({
      voice: 'alicia', language: 'en-US', model: 'simba-3.2', emotion: 'calm', globalEmphasis: 'strong', usePauseCustom: true, pauseCustomTime: 400,
      globalDefaults: { ...DEFAULT_GLOBAL_DEFAULTS, pitch: 'high', useRateCustom: true, rateCustom: 10 },
    }, voices);
    expect(summary).toMatchObject({ voice: 'Alicia', language: 'English (US)', model: 'Simba 3.2' });
    expect(summary.tuning).toEqual(['Pitch high', 'Speed +10%']);
    expect(summary.style).toEqual(['Emotion calm', 'Emphasis strong', 'Pauses 400 ms', 'Fade 100/100 ms']);
  });

  it('copes with old presets and voices that are gone', () => {
    const summary = summarizePreset({ voice: 'retired-voice' }, voices);
    expect(summary.voice).toBe('retired-voice');
    expect(summary.model).toBe('Auto model');
    expect(summary.tuning).toEqual(['Neutral pitch, speed and volume']);
    expect(summarizePreset({}, voices).voice).toBe('No voice saved');
  });
});
