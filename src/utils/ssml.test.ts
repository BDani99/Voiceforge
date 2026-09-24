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
    expect(ssml).not.toMatch(/speechify:style emotion="calm"/);
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

describe('marks: emphasis, pronunciation and pauses', () => {
  const text = 'It costs 3/4 of a dollar today. Really.';
  const at = (needle: string) => ({ start: text.indexOf(needle), end: text.indexOf(needle) + needle.length });

  it('leaves the output unchanged without marks', () => {
    expect(buildSSML(text, { marks: [] })).toBe(buildSSML(text));
  });

  it('wraps an emphasised span in an emphasis tag', () => {
    const ssml = buildSSML(text, { marks: [{ kind: 'emphasis', ...at('dollar'), value: 'strong' }] });
    expect(ssml).toBe('<speak>It costs 3/4 of a <emphasis level="strong">dollar</emphasis> today. Really.</speak>');
  });

  it('reads a span as its alias with a sub tag (the documented way to say numbers and units)', () => {
    const ssml = buildSSML(text, { marks: [{ kind: 'sub', ...at('3/4'), value: 'three quarters' }] });
    expect(ssml).toContain('<sub alias="three quarters">3/4</sub>');
    expect(ssml.replace(/<[^>]+>/g, '')).toBe(text);
  });

  it('escapes the alias and the text and never lets user input create tags', () => {
    const ssml = buildSSML('a <b> c', { marks: [{ kind: 'sub', start: 2, end: 5, value: '"x" & <y>' }] });
    expect(ssml).toContain('<sub alias="&quot;x&quot; &amp; &lt;y&gt;">&lt;b&gt;</sub>');
  });

  it('inserts a pause at its position, by time or by strength', () => {
    const time = buildSSML('One. Two.', { marks: [{ kind: 'break', start: 4, end: 4, value: '750ms' }] });
    expect(time).toBe('<speak>One.<break time="750ms"/> Two.</speak>');
    const strength = buildSSML('One. Two.', { marks: [{ kind: 'break', start: 4, end: 4, value: 'strong' }] });
    expect(strength).toContain('<break strength="strong"/>');
  });

  it('puts a pause at the very end after the text', () => {
    expect(buildSSML('One', { marks: [{ kind: 'break', start: 3, end: 3, value: '500ms' }] })).toBe('<speak>One<break time="500ms"/></speak>');
  });

  it('shares one emphasis tag between neighbours and keeps a pause inside it', () => {
    const ssml = buildSSML('abcdef', {
      marks: [{ kind: 'emphasis', start: 0, end: 6, value: 'moderate' }, { kind: 'break', start: 3, end: 3, value: '300ms' }],
    });
    expect(ssml).toBe('<speak><emphasis level="moderate">abc<break time="300ms"/>def</emphasis></speak>');
  });

  it('combines with emotions: emphasis is split at the edge of an emotion, tags stay nested correctly', () => {
    const ssml = buildSSML('one two three', {
      emotionSegments: [{ start: 4, end: 7, emotion: 'sad' }],
      marks: [{ kind: 'emphasis', start: 0, end: 13, value: 'reduced' }],
    });
    expect(ssml).toBe(
      '<speak><emphasis level="reduced">one </emphasis>'
      + '<speechify:style emotion="sad"><emphasis level="reduced">two</emphasis></speechify:style>'
      + '<emphasis level="reduced"> three</emphasis></speak>',
    );
  });

  it('never cuts a pronunciation at an emotion boundary', () => {
    const ssml = buildSSML('say 3/4 now', {
      emotionSegments: [{ start: 6, end: 11, emotion: 'calm' }],
      marks: [{ kind: 'sub', start: 4, end: 7, value: 'three quarters' }],
    });
    expect(ssml).toContain('<sub alias="three quarters">3/4</sub>');
    expect(ssml.match(/<sub /g)).toHaveLength(1);
    // the emotion moved to the edge of the replacement, so the document is still well nested
    expect(ssml).toBe('<speak>say <sub alias="three quarters">3/4</sub><speechify:style emotion="calm"> now</speechify:style></speak>');
  });

  it('works next to dictionary replacements and sentence pauses', () => {
    const ssml = buildSSML('Hi NASA. Bye.', {
      customReplacements: { NASA: 'N A S A' },
      breaks: { enabled: true, pauseType: 'strength', pauseStrength: 'weak' },
      marks: [{ kind: 'emphasis', start: 0, end: 2, value: 'strong' }],
    });
    expect(ssml).toContain('<emphasis level="strong">Hi</emphasis>');
    expect(ssml).toContain('<sub alias="N A S A">NASA</sub>');
    expect(ssml).toContain('<break strength="weak"/>');
  });

  it('rejects invalid mark values', () => {
    expect(() => buildSSML('abc', { marks: [{ kind: 'emphasis', start: 0, end: 2, value: 'huge' }] })).toThrow(/Invalid emphasis/);
    expect(() => buildSSML('abc', { marks: [{ kind: 'break', start: 1, end: 1, value: '99999ms' }] })).toThrow(/Invalid break/);
  });

  it('produces well-formed XML for every combination', () => {
    const ssml = buildSSML('One two three four. Five six seven.', {
      prosody: { pitch: 'high' },
      emphasis: { enabled: true, level: 'moderate' },
      emotionSegments: [{ start: 4, end: 12, emotion: 'calm' }],
      marks: [
        { kind: 'emphasis', start: 0, end: 8, value: 'strong' },
        { kind: 'sub', start: 14, end: 18, value: 'four' },
        { kind: 'break', start: 19, end: 19, value: '500ms' },
      ],
    });
    const doc = new DOMParser().parseFromString(ssml.replace(/speechify:style/g, 'style'), 'application/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
  });
});
