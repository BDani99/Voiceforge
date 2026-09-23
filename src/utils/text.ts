export const MAX_CHARS_PER_REQUEST = 2000;

/** Splits text into chunks of at most `maxLength`, preferring sentence boundaries. */
export function splitIntoChunks(text: string, maxLength = MAX_CHARS_PER_REQUEST): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const sentence of sentences) {
    if ((current + sentence).length <= maxLength) {
      current += sentence;
      continue;
    }
    flush();
    // A single sentence longer than the limit has to be cut hard.
    let rest = sentence;
    while (rest.length > maxLength) {
      chunks.push(rest.slice(0, maxLength).trim());
      rest = rest.slice(maxLength);
    }
    current = rest;
  }
  flush();

  return chunks;
}
