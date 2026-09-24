import { describe, it, expect } from 'vitest';
import { SseParser } from './sse';

describe('SseParser', () => {
  it('reads events with a name and JSON data', () => {
    const events = new SseParser().push('event: speech.chunk\ndata: {"audio":"AAAA"}\n\nevent: speech.done\ndata: {"a":1}\n\n');
    expect(events).toEqual([
      { event: 'speech.chunk', data: '{"audio":"AAAA"}' },
      { event: 'speech.done', data: '{"a":1}' },
    ]);
  });

  it('waits for the blank line and copes with chunks that end anywhere', () => {
    const parser = new SseParser();
    expect(parser.push('event: speech.ch')).toEqual([]);
    expect(parser.push('unk\ndata: {"x"')).toEqual([]);
    expect(parser.push(':1}\n')).toEqual([]);
    expect(parser.push('\nevent: b\nda')).toEqual([{ event: 'speech.chunk', data: '{"x":1}' }]);
    expect(parser.push('ta: 2\n\n')).toEqual([{ event: 'b', data: '2' }]);
  });

  it('supports CRLF, comments, multi-line data and events without a name', () => {
    const events = new SseParser().push(': keep-alive\r\n\r\ndata: a\r\ndata: b\r\n\r\n');
    expect(events).toEqual([{ event: 'message', data: 'a\nb' }]);
  });

  it('ignores blocks without data', () => {
    expect(new SseParser().push('event: ping\n\n')).toEqual([]);
  });
});
