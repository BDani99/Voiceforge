import { describe, it, expect } from 'vitest';
import {
  AUTO_MODEL,
  autoModel,
  compatibleModels,
  filterVoices,
  EMPTY_FILTERS,
  languageOptions,
  localeLabel,
  resolveModel,
  supportsEmotion,
  tagLabel,
  voiceUseCaseOptions,
  voiceUseCases,
  voiceInitials,
  voicePreviewUrl,
  voicesForLanguage,
} from './voices';
import type { Voice } from '../types/models';

const models = (...names: string[]) => names.map((name) => ({ name, languages: [{ locale: 'x', preview_audio: `https://cdn/${name}.mp3` }] }));

const alicia: Voice = {
  id: 'alicia', display_name: 'Alicia', gender: 'female', locale: 'en-US',
  tags: ['use-case:audiobook', 'use-case:podcast', 'age:young-adult'],
  preview_audio: 'https://cdn/alicia.mp3',
  models: models('simba-english', 'simba-multilingual', 'simba-3.0', 'simba-3.2'),
};
const hans: Voice = {
  id: 'hans', display_name: 'Hans', gender: 'male', locale: 'de-DE',
  tags: ['use-case:news'], models: models('simba-multilingual', 'simba-3.0'),
};
const aadi: Voice = {
  id: 'aadi', display_name: 'Aadi', gender: 'male', locale: 'hi-IN',
  tags: ['use-case:audiobook'], models: models('simba-multilingual', 'simba-3.0'),
};
const voices = [hans, alicia, aadi];

describe('model resolution', () => {
  it('prefers the newest English model for English voices', () => {
    expect(autoModel(alicia, 'en-US')).toBe('simba-3.2');
    expect(compatibleModels(alicia, 'en-US')).toEqual(['simba-3.2', 'simba-3.0', 'simba-multilingual', 'simba-english']);
  });

  it('uses Simba 3.0 for German, Spanish, French, Italian and Portuguese', () => {
    expect(autoModel(hans, 'de-DE')).toBe('simba-3.0');
    expect(compatibleModels(hans, 'de-DE')).toEqual(['simba-3.0', 'simba-multilingual']);
  });

  it('falls back to the multilingual model for other languages', () => {
    expect(autoModel(aadi, 'hi-IN')).toBe('simba-multilingual');
    expect(compatibleModels(aadi, 'hi-IN')).toEqual(['simba-multilingual']);
  });

  it('never offers English-only models for other languages, even with an English voice', () => {
    expect(compatibleModels(alicia, 'hu-HU')).toEqual(['simba-multilingual']);
  });

  it('only offers models the voice actually has', () => {
    const limited: Voice = { ...alicia, models: models('simba-3.0') };
    expect(compatibleModels(limited, 'en-US')).toEqual(['simba-3.0']);
  });

  it('has sensible defaults when the voice list is not loaded yet', () => {
    expect(autoModel(undefined, 'en-US')).toBe('simba-3.2');
    expect(autoModel(undefined, 'ja-JP')).toBe('simba-multilingual');
  });

  it('honours a valid manual choice and ignores an invalid one', () => {
    expect(resolveModel(alicia, 'en-US', 'simba-3.0')).toBe('simba-3.0');
    expect(resolveModel(alicia, 'en-US', AUTO_MODEL)).toBe('simba-3.2');
    expect(resolveModel(hans, 'de-DE', 'simba-3.2')).toBe('simba-3.0'); // English only model for German text
    expect(resolveModel(alicia, 'en-US', 'does-not-exist')).toBe('simba-3.2');
  });

  it('knows which models support emotion', () => {
    expect(supportsEmotion('simba-3.2')).toBe(true);
    expect(supportsEmotion('simba-3.0')).toBe(true);
    expect(supportsEmotion('simba-multilingual')).toBe(false);
    expect(supportsEmotion('unknown')).toBe(false);
  });
});

describe('languages', () => {
  it('lists locales with their voice counts, largest first', () => {
    const options = languageOptions([...voices, { ...alicia, id: 'b' }]);
    expect(options[0]).toMatchObject({ locale: 'en-US', count: 2, label: 'English (US)' });
    expect(options.map((o) => o.locale)).toContain('hi-IN');
  });

  it('labels unknown locales with the browser language names', () => {
    expect(localeLabel('de-DE')).toBe('German');
    expect(localeLabel('ta-IN')).not.toBe('');
  });

  it('falls back to English voices for languages without voices', () => {
    expect(voicesForLanguage(voices, 'de-DE').map((v) => v.id)).toEqual(['hans']);
    expect(voicesForLanguage(voices, 'hu-HU').map((v) => v.id)).toEqual(['alicia']);
  });
});

describe('labels', () => {
  it('humanises tags and extracts use cases', () => {
    expect(tagLabel('use-case:customer-service-ivr')).toBe('Customer service ivr');
    expect(tagLabel('plain')).toBe('Plain');
    expect(voiceUseCases(alicia)).toEqual(['Audiobook', 'Podcast']);
  });

  it('counts use cases across voices', () => {
    expect(voiceUseCaseOptions(voices)[0]).toEqual({ value: 'use-case:audiobook', count: 2 });
  });

  it('builds initials for avatars', () => {
    expect(voiceInitials(alicia)).toBe('AL');
    expect(voiceInitials(undefined)).toBe('?');
  });
});

describe('filterVoices', () => {
  it('returns everything sorted by name for empty filters', () => {
    expect(filterVoices(voices, EMPTY_FILTERS).map((v) => v.id)).toEqual(['aadi', 'alicia', 'hans']);
  });

  it('filters by language, gender, model and use case', () => {
    expect(filterVoices(voices, { ...EMPTY_FILTERS, locale: 'de-DE' }).map((v) => v.id)).toEqual(['hans']);
    expect(filterVoices(voices, { ...EMPTY_FILTERS, gender: 'female' }).map((v) => v.id)).toEqual(['alicia']);
    expect(filterVoices(voices, { ...EMPTY_FILTERS, model: 'simba-3.2' }).map((v) => v.id)).toEqual(['alicia']);
    expect(filterVoices(voices, { ...EMPTY_FILTERS, useCase: 'use-case:audiobook' }).map((v) => v.id)).toEqual(['aadi', 'alicia']);
  });

  it('searches names, ids, tags and language names, all words must match', () => {
    expect(filterVoices(voices, { ...EMPTY_FILTERS, query: 'ali' }).map((v) => v.id)).toEqual(['alicia']);
    expect(filterVoices(voices, { ...EMPTY_FILTERS, query: 'podcast' }).map((v) => v.id)).toEqual(['alicia']);
    expect(filterVoices(voices, { ...EMPTY_FILTERS, query: 'german' }).map((v) => v.id)).toEqual(['hans']);
    expect(filterVoices(voices, { ...EMPTY_FILTERS, query: 'audiobook hindi' }).map((v) => v.id)).toEqual(['aadi']);
    expect(filterVoices(voices, { ...EMPTY_FILTERS, query: 'alicia hans' })).toEqual([]);
  });

  it('combines filters', () => {
    expect(filterVoices(voices, { ...EMPTY_FILTERS, gender: 'male', query: 'a' }).map((v) => v.id)).toEqual(['aadi', 'hans']);
  });
});

describe('voicePreviewUrl', () => {
  it('prefers the sample for the requested locale', () => {
    const multi: Voice = { ...alicia, models: [{ name: 'simba-3.0', languages: [{ locale: 'en-US', preview_audio: 'https://cdn/en.mp3' }, { locale: 'fr-FR', preview_audio: 'https://cdn/fr.mp3' }] }] };
    expect(voicePreviewUrl(multi, 'fr-FR')).toBe('https://cdn/fr.mp3');
    expect(voicePreviewUrl(multi)).toBe('https://cdn/en.mp3');
  });

  it('falls back to the general sample and to nothing', () => {
    expect(voicePreviewUrl({ id: 'x', preview_audio: 'https://cdn/x.mp3' })).toBe('https://cdn/x.mp3');
    expect(voicePreviewUrl({ id: 'x' })).toBeNull();
  });
});
