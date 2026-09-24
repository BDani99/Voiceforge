export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Reads server-sent events from a stream of text: chunks may end anywhere, an event is complete at
 * the blank line. Comment lines (":") and fields other than event and data are ignored.
 */
export class SseParser {
  private buffer = '';

  push(text: string): SseEvent[] {
    this.buffer += text;
    const events: SseEvent[] = [];

    for (;;) {
      const match = /\r?\n\r?\n/.exec(this.buffer);
      if (!match) break;
      const block = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);

      let event = 'message';
      const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith(':')) continue;
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'event') event = value;
        else if (field === 'data') data.push(value);
      }
      if (data.length > 0) events.push({ event, data: data.join('\n') });
    }
    return events;
  }
}
