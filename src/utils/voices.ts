import { SUPPORTED_LANGUAGES } from '../constants/voiceConstants';
import type { Voice } from '../types/models';

/** Value of the model selector when the app should pick the model itself. */
export const AUTO_MODEL = 'auto';

export interface ModelInfo {
  id: string;
  label: string;
  description: string;
  /** Older model that Speechify is retiring; still offered because some languages need it. */
  legacy: boolean;
  supportsEmotion: boolean;
}

// https://docs.speechify.ai/build/guides/concepts/models.md
export const MODEL_CATALOG: Record<string, ModelInfo> = {
  'simba-3.2': {
    id: 'simba-3.2',
    label: 'Simba 3.2',
    description: 'English only. Lowest latency and the most expressive model.',
    legacy: false,
    supportsEmotion: true,
  },
  'simba-3.0': {
    id: 'simba-3.0',
    label: 'Simba 3.0',
    description: 'English, German, Spanish, French, Italian and Portuguese.',
    legacy: false,
    supportsEmotion: true,
  },
  'simba-multilingual': {
    id: 'simba-multilingual',
    label: 'Simba Multilingual',
    description: '30+ languages (legacy model). No emotion control.',
    legacy: true,
    supportsEmotion: false,
  },
  'simba-english': {
    id: 'simba-english',
    label: 'Simba English',
    description: 'English only (legacy model).',
    legacy: true,
    supportsEmotion: true,
  },
};

/** Non-English locales the Simba 3.0 model handles. */
const SIMBA_3_LOCALES = new Set(['de-DE', 'es-ES', 'es-MX', 'fr-FR', 'it-IT', 'pt-BR']);

export const isEnglish = (locale: string): boolean => locale.toLowerCase().startsWith('en');

export const modelLabel = (model: string): string => MODEL_CATALOG[model]?.label ?? model;

export const supportsEmotion = (model: string): boolean => MODEL_CATALOG[model]?.supportsEmotion ?? false;

/** Names of the models a voice can be used with. */
export function voiceModels(voice: Voice | undefined): string[] {
  return voice?.models?.map((m) => m.name) ?? [];
}

/** Whether a model can speak the given language at all. */
function modelSpeaks(model: string, language: string): boolean {
  switch (model) {
    case 'simba-3.2':
    case 'simba-english':
      return isEnglish(language);
    case 'simba-3.0':
      return isEnglish(language) || SIMBA_3_LOCALES.has(language);
    default:
      return true;
  }
}

/** Models that can be chosen for this voice and text language, best first. */
export function compatibleModels(voice: Voice | undefined, language: string): string[] {
  const offered = voiceModels(voice);
  // Without model information (voice list not loaded) fall back to the current models.
  const pool = offered.length > 0 ? offered : Object.keys(MODEL_CATALOG);
  const preference = ['simba-3.2', 'simba-3.0', 'simba-multilingual', 'simba-english'];
  return preference.filter((m) => pool.includes(m) && modelSpeaks(m, language));
}

/** The model used when the user leaves the choice on "Auto". */
export function autoModel(voice: Voice | undefined, language: string): string {
  const [best] = compatibleModels(voice, language);
  if (best) return best;
  return isEnglish(language) ? 'simba-3.2' : 'simba-multilingual';
}

/** The model that is really used: the user's choice if it is valid for this voice and language, else auto. */
export function resolveModel(voice: Voice | undefined, language: string, choice: string): string {
  if (choice !== AUTO_MODEL && compatibleModels(voice, language).includes(choice)) return choice;
  return autoModel(voice, language);
}

// ------------------------------------------------------------------ languages

const displayNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames(['en'], { type: 'language' })
  : null;

export function localeLabel(locale: string): string {
  const known = SUPPORTED_LANGUAGES.find((l) => l.code === locale);
  if (known) return known.name;
  try {
    return displayNames?.of(locale) ?? locale;
  } catch {
    return locale;
  }
}

export interface LanguageOption {
  locale: string;
  label: string;
  count: number;
}

/** Locales that have voices, most voices first. */
export function languageOptions(voices: Voice[]): LanguageOption[] {
  const counts = new Map<string, number>();
  for (const voice of voices) {
    if (voice.locale) counts.set(voice.locale, (counts.get(voice.locale) ?? 0) + 1);
  }
  return [...counts]
    .map(([locale, count]) => ({ locale, label: localeLabel(locale), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Voices for a language; languages without voices fall back to the English ones. */
export function voicesForLanguage(voices: Voice[], language: string): Voice[] {
  const exact = voices.filter((v) => v.locale === language);
  if (exact.length > 0) return exact;
  return voices.filter((v) => v.locale === 'en-US' || v.locale === 'en-GB' || !v.locale);
}

// ------------------------------------------------------------ names and tags

export const voiceName = (voice: Voice | undefined): string => voice?.display_name ?? voice?.name ?? voice?.id ?? '';

export function voiceInitials(voice: Voice | undefined): string {
  const name = voiceName(voice).trim();
  return name ? name.slice(0, 2).toUpperCase() : '?';
}

export const genderLabel = (gender: string | undefined): string => {
  if (gender === 'male') return 'Male';
  if (gender === 'female') return 'Female';
  return '';
};

/** "use-case:customer-service-ivr" to "Customer service ivr". */
export function tagLabel(tag: string): string {
  const value = tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag;
  const spaced = value.replace(/[-_]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Use-case tags of a voice, e.g. ["Audiobook", "Podcast"]. */
export function useCases(voice: Voice): string[] {
  return (voice.tags ?? []).filter((t) => t.startsWith('use-case:')).map(tagLabel);
}

/** Every use case that occurs in the list, most common first. */
export function useCaseOptions(voices: Voice[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const voice of voices) {
    for (const tag of new Set(voice.tags ?? [])) {
      if (tag.startsWith('use-case:')) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

// ------------------------------------------------------------------ filtering

export interface VoiceFilters {
  query: string;
  locale: string;
  gender: string;
  model: string;
  useCase: string;
}

export const EMPTY_FILTERS: VoiceFilters = { query: '', locale: '', gender: '', model: '', useCase: '' };

export function filterVoices(voices: Voice[], filters: VoiceFilters): Voice[] {
  const query = filters.query.trim().toLowerCase();

  return voices
    .filter((voice) => {
      if (filters.locale && voice.locale !== filters.locale) return false;
      if (filters.gender && voice.gender !== filters.gender) return false;
      if (filters.model && !voiceModels(voice).includes(filters.model)) return false;
      if (filters.useCase && !(voice.tags ?? []).includes(filters.useCase)) return false;
      if (!query) return true;

      const haystack = [voiceName(voice), voice.id, voice.locale ?? '', voice.locale ? localeLabel(voice.locale) : '', ...(voice.tags ?? []).map(tagLabel)]
        .join(' ')
        .toLowerCase();
      return query.split(/\s+/).every((word) => haystack.includes(word));
    })
    .sort((a, b) => voiceName(a).localeCompare(voiceName(b)));
}

// ------------------------------------------------------------------ previews

/** Sample recording of a voice, preferring the one for the given locale. */
export function voicePreviewUrl(voice: Voice, locale?: string): string | null {
  const wanted = locale ?? voice.locale;
  for (const model of voice.models ?? []) {
    const match = model.languages.find((l) => l.locale === wanted && l.preview_audio);
    if (match?.preview_audio) return match.preview_audio;
  }
  return voice.preview_audio ?? null;
}
