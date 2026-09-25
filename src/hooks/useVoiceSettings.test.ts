import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { parseCustomReplacements, useVoiceSettings } from './useVoiceSettings';
import { DEFAULT_GLOBAL_DEFAULTS } from '../constants/voiceConstants';

beforeEach(() => {
  localStorage.clear();
});

describe('parseCustomReplacements', () => {
  it('parses "word -> pronunciation" lines and skips malformed ones', () => {
    expect(parseCustomReplacements('GIF -> jif\n\nbroken line\nSQL -> sequel\n -> empty\nlonely ->')).toEqual({
      GIF: 'jif',
      SQL: 'sequel',
    });
  });

  it('returns an empty table for blank input', () => {
    expect(parseCustomReplacements('  \n ')).toEqual({});
  });
});

describe('useVoiceSettings', () => {
  it('starts with defaults', () => {
    const { result } = renderHook(() => useVoiceSettings());
    expect(result.current.globalDefaults).toEqual(DEFAULT_GLOBAL_DEFAULTS);
    expect(result.current.pauseStrength).toBe('medium');
    expect(result.current.useFadeTransitions).toBe(true);
    expect(result.current.dictionaryLoaded).toBe(false);
  });

  it('restores valid stored settings', () => {
    localStorage.setItem('voiceforge_pauseCustomTime', '1200');
    localStorage.setItem('voiceforge_emotion', JSON.stringify('calm'));
    const { result } = renderHook(() => useVoiceSettings());
    expect(result.current.pauseCustomTime).toBe(1200);
    expect(result.current.emotion).toBe('calm');
  });

  it('falls back to defaults for corrupt or wrongly typed stored values', () => {
    localStorage.setItem('voiceforge_pauseCustomTime', JSON.stringify('not a number'));
    localStorage.setItem('voiceforge_useFadeTransitions', '{broken json');
    localStorage.setItem('voiceforge_globalDefaults', JSON.stringify({ pitch: 5 }));
    const { result } = renderHook(() => useVoiceSettings());
    expect(result.current.pauseCustomTime).toBe(750);
    expect(result.current.useFadeTransitions).toBe(true);
    expect(result.current.globalDefaults).toEqual(DEFAULT_GLOBAL_DEFAULTS);
  });

  it('updates a single default and persists the change', () => {
    const { result } = renderHook(() => useVoiceSettings());
    act(() => result.current.updateGlobalDefaults('pitch', 'high'));
    expect(result.current.globalDefaults.pitch).toBe('high');
    expect(result.current.globalDefaults.rate).toBe('medium');
    expect(JSON.parse(localStorage.getItem('voiceforge_globalDefaults') ?? '{}')).toMatchObject({ pitch: 'high' });
  });

  it('streams while generating by default, remembers the choice and resets to on', () => {
    const { result } = renderHook(() => useVoiceSettings());
    expect(result.current.streamingEnabled).toBe(true);

    act(() => result.current.setStreamingEnabled(false));
    expect(localStorage.getItem('voiceforge_streamingEnabled')).toBe('false');
    expect(renderHook(() => useVoiceSettings()).result.current.streamingEnabled).toBe(false);

    act(() => result.current.resetSettings());
    expect(result.current.streamingEnabled).toBe(true);
  });

  it('keeps the same object when a value does not change', () => {
    const { result } = renderHook(() => useVoiceSettings());
    const before = result.current.globalDefaults;
    act(() => result.current.updateGlobalDefaults('pitch', 'medium'));
    expect(result.current.globalDefaults).toBe(before);
  });

  it('marks the dictionary as loaded once it is applied', () => {
    const { result } = renderHook(() => useVoiceSettings());
    act(() => result.current.applyDictionary('GIF -> jif'));
    expect(result.current.dictionaryLoaded).toBe(true);
    expect(result.current.globalCustomReplacements).toBe('GIF -> jif');
  });

  it('does not persist the dictionary locally and keeps it on reset', () => {
    const { result } = renderHook(() => useVoiceSettings());
    act(() => result.current.applyDictionary('GIF -> jif'));
    act(() => result.current.setEmotion('sad'));
    expect(localStorage.getItem('voiceforge_globalCustomReplacements')).toBeNull();

    act(() => result.current.resetSettings());
    expect(result.current.emotion).toBe('');
    expect(result.current.globalCustomReplacements).toBe('GIF -> jif');
  });

  it('survives unavailable storage', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota exceeded');
    };
    try {
      const { result } = renderHook(() => useVoiceSettings());
      expect(() => act(() => result.current.setEmotion('calm'))).not.toThrow();
      expect(result.current.emotion).toBe('calm');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
