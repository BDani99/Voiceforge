import type { SsmlOptions } from '../types/models';

const VALID_PITCH = ['x-low', 'low', 'medium', 'high', 'x-high'];
const VALID_RATE = ['x-slow', 'slow', 'medium', 'fast', 'x-fast'];
const VALID_VOLUME = ['silent', 'x-soft', 'soft', 'medium', 'loud', 'x-loud'];
const VALID_EMPHASIS = ['reduced', 'moderate', 'strong'];
const VALID_EMOTIONS = [
  'angry', 'cheerful', 'sad', 'terrified', 'relaxed', 'fearful', 'surprised',
  'calm', 'assertive', 'energetic', 'warm', 'direct', 'bright',
];
const VALID_PAUSE_STRENGTH = ['none', 'x-weak', 'weak', 'medium', 'strong', 'x-strong'];

const PERCENT_RE = /^[+-]?\d+(\.\d+)?%$/;
const VOLUME_RE = /^[+-]?\d+(\.\d+)?%$|^[+-]?\d+(\.\d+)?dB$/;

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Returns a list of human readable problems, empty if the options are valid. */
export function validateSSMLOptions(options: SsmlOptions = {}): string[] {
  const errors: string[] = [];
  const { prosody, emphasis, emotion, breaks } = options;

  if (prosody) {
    const { pitch, rate, volume } = prosody;
    if (pitch && !VALID_PITCH.includes(pitch) && !PERCENT_RE.test(pitch)) errors.push(`Invalid pitch value: ${pitch}`);
    if (rate && !VALID_RATE.includes(rate) && !PERCENT_RE.test(rate)) errors.push(`Invalid rate value: ${rate}`);
    if (volume && !VALID_VOLUME.includes(volume) && !VOLUME_RE.test(volume)) errors.push(`Invalid volume value: ${volume}`);
  }

  if (emphasis?.enabled && !VALID_EMPHASIS.includes(emphasis.level ?? '')) {
    errors.push(`Invalid emphasis level: ${emphasis.level}`);
  }

  if (emotion?.enabled && !VALID_EMOTIONS.includes(emotion.type ?? '')) {
    errors.push(`Invalid emotion type: ${emotion.type}`);
  }

  if (breaks) {
    const { pauseType, pauseStrength, pauseTime } = breaks;
    if (pauseType && !['strength', 'time'].includes(pauseType)) errors.push(`Invalid pause type: ${pauseType}`);
    if (pauseStrength && !VALID_PAUSE_STRENGTH.includes(pauseStrength)) errors.push(`Invalid pause strength: ${pauseStrength}`);
    if (pauseTime !== undefined && !(pauseTime >= 0 && pauseTime <= 10000)) {
      errors.push(`Invalid pause time: ${pauseTime}ms (must be between 0-10000)`);
    }
  }

  return errors;
}

interface TextPart {
  text: string;
  alias?: string;
}

/** Splits text on custom replacement words in a single pass (longest word wins). */
function splitOnReplacements(text: string, replacements: Record<string, string> | undefined): TextPart[] {
  const entries = Object.entries(replacements ?? {}).filter(([original, alias]) => original && alias);
  if (entries.length === 0) return [{ text }];

  const aliasByWord = new Map(entries.map(([original, alias]) => [original.toLowerCase(), alias]));
  const pattern = entries
    .map(([original]) => original)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');

  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(new RegExp(pattern, 'gi'))) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ text: match[0], alias: aliasByWord.get(match[0].toLowerCase()) });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

function sentenceBreakTag(breaks: SsmlOptions['breaks']): string | null {
  if (!breaks?.enabled) return null;
  if (breaks.pauseType === 'time') return `<break time="${Number(breaks.pauseTime ?? 750)}ms"/>`;
  const strength = breaks.pauseStrength || 'medium';
  return strength === 'none' ? null : `<break strength="${strength}"/>`;
}

/**
 * Builds the SSML document for one text block. All user text is XML-escaped, so
 * it can never inject tags; only the tags generated here end up in the output.
 */
export function buildSSML(text: string, options: SsmlOptions = {}): string {
  const {
    prosody = {},
    emphasis = {},
    emotion = {},
    customReplacements = {},
    breaks = {},
    addSilencePadding = false,
    silenceDuration = 50,
  } = options;

  if (!text || typeof text !== 'string') { // also guards callers that bypass the types
    throw new Error('Text input is required and must be a string');
  }

  const errors = validateSSMLOptions(options);
  if (errors.length > 0) throw new Error(`Invalid SSML options: ${errors.join('; ')}`);

  const breakTag = sentenceBreakTag(breaks);

  let content = splitOnReplacements(text, customReplacements)
    .map((part) => {
      const escaped = escapeXml(part.text);
      if (part.alias) return `<sub alias="${escapeXml(part.alias)}">${escaped}</sub>`;
      return breakTag ? escaped.replace(/([.!?])\s+/g, `$1${breakTag} `) : escaped;
    })
    .join('');

  if (addSilencePadding) {
    const pad = `<break time="${silenceDuration}ms"/>`;
    content = `${pad}${content}${pad}`;
  }

  if (emphasis.enabled && emphasis.level) {
    content = `<emphasis level="${emphasis.level}">${content}</emphasis>`;
  }

  const prosodyAttrs: string[] = [];
  if (prosody.pitch) prosodyAttrs.push(`pitch="${prosody.pitch}"`);
  if (prosody.rate) prosodyAttrs.push(`rate="${prosody.rate}"`);
  if (prosody.volume) {
    let volume = prosody.volume;
    // Slightly lower a custom volume when padding is used for smoother blending.
    if (addSilencePadding && volume.includes('%')) {
      const numeric = parseInt(volume, 10);
      if (!Number.isNaN(numeric)) {
        const adjusted = Math.max(-50, numeric - 5);
        volume = `${adjusted >= 0 ? '+' : ''}${adjusted}%`;
      }
    }
    prosodyAttrs.push(`volume="${volume}"`);
  }
  if (prosodyAttrs.length > 0) {
    content = `<prosody ${prosodyAttrs.join(' ')}>${content}</prosody>`;
  }

  if (emotion.enabled && emotion.type) {
    content = `<speechify:style emotion="${emotion.type}">${content}</speechify:style>`;
  }

  return `<speak>${content}</speak>`;
}
