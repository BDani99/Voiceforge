import { describe, it, expect } from 'vitest';
import { buildSSML, validateSSMLOptions } from './ssml';

describe('buildSSML', () => {
  it('wraps plain text in <speak>', () => {
    expect(buildSSML('Hello')).toBe('<speak>Hello</speak>');
  });

  it('escapes user text so it cannot inject tags', () => {
    const ssml = buildSSML('a <break time="9s"/> & b');
    expect(ssml).not.toContain('<break');
    expect(ssml).toContain('&lt;break time=&quot;9s&quot;/&gt; &amp; b');
  });

  it('inserts pauses only after sentence enders', () => {
    const ssml = buildSSML('One. Two! Three', {
      breaks: { enabled: true, pauseType: 'strength', pauseStrength: 'weak' },
    });
    expect(ssml).toBe('<speak>One.<break strength="weak"/> Two!<break strength="weak"/> Three</speak>');
  });

  it('supports time based pauses and disabled pauses', () => {
    const timed = buildSSML('A. B', { breaks: { enabled: true, pauseType: 'time', pauseTime: 300 } });
    expect(timed).toContain('<break time="300ms"/>');
    const none = buildSSML('A. B', { breaks: { enabled: true, pauseType: 'strength', pauseStrength: 'none' } });
    expect(none).not.toContain('<break');
  });

  it('applies custom replacements in one pass, longest word first, case-insensitive', () => {
    const ssml = buildSSML('Dr. Smith met dr Jones', {
      customReplacements: { Dr: 'Doctor', 'Dr. Smith': 'Dock Smith' },
    });
    expect(ssml).toBe('<speak><sub alias="Dock Smith">Dr. Smith</sub> met <sub alias="Doctor">dr</sub> Jones</speak>');
  });

  it('escapes replacement aliases', () => {
    const ssml = buildSSML('AT&T', { customReplacements: { 'AT&T': 'a "t" and t' } });
    expect(ssml).toContain('<sub alias="a &quot;t&quot; and t">AT&amp;T</sub>');
  });

  it('nests emotion > prosody > emphasis and adds silence padding', () => {
    const ssml = buildSSML('Hi', {
      prosody: { pitch: 'high', rate: '+10%', volume: '-20%' },
      emphasis: { enabled: true, level: 'strong' },
      emotion: { enabled: true, type: 'calm' },
      addSilencePadding: true,
    });
    expect(ssml).toBe(
      '<speak><speechify:style emotion="calm"><prosody pitch="high" rate="+10%" volume="-25%">'
      + '<emphasis level="strong"><break time="50ms"/>Hi<break time="50ms"/></emphasis>'
      + '</prosody></speechify:style></speak>',
    );
  });

  it('rejects invalid attribute values instead of emitting them', () => {
    expect(() => buildSSML('x', { prosody: { pitch: '"><evil' } })).toThrow(/Invalid pitch/);
    expect(() => buildSSML('')).toThrow();
  });
});

describe('validateSSMLOptions', () => {
  it('accepts empty and valid options', () => {
    expect(validateSSMLOptions()).toEqual([]);
    expect(validateSSMLOptions({ prosody: { pitch: '+5%', rate: 'fast', volume: '3dB' } })).toEqual([]);
  });

  it('reports out of range pauses', () => {
    expect(validateSSMLOptions({ breaks: { pauseTime: 99999 } })).toHaveLength(1);
  });
});

describe('emotion segments', () => {
  const segments = [{ start: 6, end: 11, emotion: 'angry' }];

  it('wraps only the highlighted part in a style tag', () => {
    expect(buildSSML('Hello brave world', { emotionSegments: segments })).toBe(
      '<speak>Hello <speechify:style emotion="angry">brave</speechify:style> world</speak>',
    );
  });

  it('supports several segments with different emotions', () => {
    const ssml = buildSSML('Oh no yes', { emotionSegments: [{ start: 0, end: 2, emotion: 'sad' }, { start: 6, end: 9, emotion: 'cheerful' }] });
    expect(ssml).toBe('<speak><speechify:style emotion="sad">Oh</speechify:style> no <speechify:style emotion="cheerful">yes</speechify:style></speak>');
  });

  it('ignores the whole-text emotion when segments exist (they exclude each other)', () => {
    const ssml = buildSSML('Hello brave world', { emotion: { enabled: true, type: 'calm' }, emotionSegments: segments });
    expect(ssml.match(/speechify:style emotion="calm"/)).toBeNull();
    expect(ssml).toContain('emotion="angry"');
  });

  it('still applies replacements, pauses and escaping inside and outside segments', () => {
    const ssml = buildSSML('Fish & chips. Dr Who', {
      emotionSegments: [{ start: 0, end: 13, emotion: 'warm' }],
      customReplacements: { Dr: 'Doctor' },
      breaks: { enabled: true, pauseType: 'strength', pauseStrength: 'weak' },
    });
    expect(ssml).toBe('<speak><speechify:style emotion="warm">Fish &amp; chips.</speechify:style> <sub alias="Doctor">Dr</sub> Who</speak>');
  });

  it('rejects unknown emotions instead of emitting them', () => {
    expect(() => buildSSML('abc', { emotionSegments: [{ start: 0, end: 2, emotion: 'x"><evil' }] })).toThrow(/Invalid emotion/);
  });

  it('keeps every letter of the text', () => {
    const text = 'Some <b>markup</b> & "quotes"';
    const ssml = buildSSML(text, { emotionSegments: [{ start: 5, end: 18, emotion: 'sad' }] });
    expect(ssml.replace(/<[^>]*>/g, '')).toBe('Some &lt;b&gt;markup&lt;/b&gt; &amp; &quot;quotes&quot;');
  });
});
