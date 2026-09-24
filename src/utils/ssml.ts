import type { SsmlOptions } from '../types/models';
import { toRuns, type EmotionSegment } from './emotionSegments';
import { isValidMark, normalizeMarks, type TextMark } from './textMarks';

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
  const { prosody, emphasis, emotion, breaks, emotionSegments, marks } = options;

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

  for (const segment of emotionSegments ?? []) {
    if (!VALID_EMOTIONS.includes(segment.emotion)) errors.push(`Invalid emotion type: ${segment.emotion}`);
  }

  for (const mark of marks ?? []) {
    if (!isValidMark(mark)) errors.push(`Invalid ${mark.kind} value: ${mark.value}`);
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

const breakTagFor = (value: string): string =>
  value.endsWith('ms') ? `<break time="${value}"/>` : `<break strength="${value}"/>`;

/** An emotion boundary must not cut a pronunciation in two: it moves to the nearer edge of it. */
function snapSegments(segments: EmotionSegment[], subs: TextMark[]): EmotionSegment[] {
  if (subs.length === 0) return segments;
  const snap = (position: number): number => {
    const sub = subs.find((s) => position > s.start && position < s.end);
    return sub ? (position - sub.start < sub.end - position ? sub.start : sub.end) : position;
  };
  return segments.map((s) => ({ ...s, start: snap(s.start), end: snap(s.end) })).filter((s) => s.end > s.start);
}

interface Item {
  xml: string;
  emphasis: string;
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
    emotionSegments = [],
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

  const renderPiece = (piece: string): string => splitOnReplacements(piece, customReplacements)
    .map((part) => {
      const escaped = escapeXml(part.text);
      if (part.alias) return `<sub alias="${escapeXml(part.alias)}">${escaped}</sub>`;
      return breakTag ? escaped.replace(/([.!?])\s+/g, `$1${breakTag} `) : escaped;
    })
    .join('');

  const marks = normalizeMarks(options.marks ?? [], text.length);

  /** One stretch of text of a single emotion run: pronunciations, emphasis and pauses inside it. */
  const renderRange = (from: number, to: number, isLastRun: boolean): string => {
    const spans = marks.filter((m) => m.kind !== 'break' && m.end > from && m.start < to);
    const pauses = marks.filter((m) => m.kind === 'break' && m.start >= from && (m.start < to || (isLastRun && m.start === to)));
    if (spans.length === 0 && pauses.length === 0) return renderPiece(text.slice(from, to));

    const cuts = new Set<number>([from, to]);
    for (const span of spans) {
      cuts.add(Math.max(from, span.start));
      cuts.add(Math.min(to, span.end));
    }
    for (const pause of pauses) cuts.add(pause.start);
    const points = [...cuts].sort((a, b) => a - b);

    const items: Item[] = [];
    const pauseAt = (position: number): string =>
      pauses.filter((p) => p.start === position).map((p) => breakTagFor(p.value)).join('');

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i] ?? from;
      const b = points[i + 1] ?? to;
      if (b <= a) continue;
      const span = spans.find((m) => m.start <= a && m.end >= b);
      const level = span?.kind === 'emphasis' ? span.value : '';
      const body = span?.kind === 'sub'
        ? `<sub alias="${escapeXml(span.value)}">${escapeXml(text.slice(a, b))}</sub>`
        : renderPiece(text.slice(a, b));
      items.push({ xml: pauseAt(a) + body, emphasis: level });
    }
    if (isLastRun) {
      const trailing = pauseAt(to);
      if (trailing) items.push({ xml: trailing, emphasis: items[items.length - 1]?.emphasis ?? '' });
    }

    // Neighbours with the same emphasis share one tag.
    let xml = '';
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      let group = item.xml;
      while (item.emphasis && items[i + 1]?.emphasis === item.emphasis) {
        group += items[i + 1]?.xml ?? '';
        i++;
      }
      xml += item.emphasis ? `<emphasis level="${item.emphasis}">${group}</emphasis>` : group;
    }
    return xml;
  };

  // Highlighted parts get their own style tag; the rest of the text stays neutral.
  const segments = snapSegments(emotionSegments, marks.filter((m) => m.kind === 'sub'));
  const hasSegments = segments.length > 0;
  let content: string;
  if (hasSegments) {
    let position = 0;
    content = toRuns(text, segments)
      .map((run, index, runs) => {
        const from = position;
        position += run.text.length;
        const rendered = renderRange(from, position, index === runs.length - 1);
        return run.emotion ? `<speechify:style emotion="${run.emotion}">${rendered}</speechify:style>` : rendered;
      })
      .join('');
  } else {
    content = renderRange(0, text.length, true);
  }

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

  // Whole-text emotion and highlighted emotions exclude each other.
  if (!hasSegments && emotion.enabled && emotion.type) {
    content = `<speechify:style emotion="${emotion.type}">${content}</speechify:style>`;
  }

  return `<speak>${content}</speak>`;
}
