export const MAX_CHARS_PER_REQUEST = 2000;

export interface TextRange {
  start: number;
  end: number;
}

/**
 * Cuts text into consecutive ranges of at most `maxLength` characters, preferring sentence
 * boundaries. The ranges cover the whole text without gaps, so positions inside a chunk
 * (for example emotion highlights) can be mapped back with simple arithmetic.
 */
export function splitIntoChunkRanges(text: string, maxLength = MAX_CHARS_PER_REQUEST): TextRange[] {
  const ranges: TextRange[] = [];
  let chunkStart = 0;
  let position = 0;

  for (const match of text.matchAll(/[^.!?]+[.!?]+|[^.!?]+$/g)) {
    const sentence = match[0];
    const sentenceStart = match.index;

    if (sentenceStart + sentence.length - chunkStart > maxLength && sentenceStart > chunkStart) {
      ranges.push({ start: chunkStart, end: sentenceStart });
      chunkStart = sentenceStart;
    }
    // A single sentence longer than the limit has to be cut hard.
    while (sentenceStart + sentence.length - chunkStart > maxLength) {
      ranges.push({ start: chunkStart, end: chunkStart + maxLength });
      chunkStart += maxLength;
    }
    position = sentenceStart + sentence.length;
  }

  // Anything the sentence pattern skipped (e.g. text that is only punctuation) belongs to the last chunk.
  position = Math.max(position, text.length);
  if (position > chunkStart) ranges.push({ start: chunkStart, end: position });
  return ranges;
}

/** The chunk texts, without surrounding whitespace. Empty chunks are dropped. */
export function splitIntoChunks(text: string, maxLength = MAX_CHARS_PER_REQUEST): string[] {
  return splitIntoChunkRanges(text, maxLength)
    .map((r) => text.slice(r.start, r.end).trim())
    .filter(Boolean);
}
