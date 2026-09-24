/**
 * What the workspace needs to know about audio that plays: where it is and how long it is. Both an
 * audio element and a live stream can be played, paused and (for the element) moved to a position.
 */
export interface PlaybackSource {
  /** Position in seconds. Setting it moves a normal audio; a live stream ignores it. */
  currentTime: number;
  /** Length in seconds; NaN while a stream is still being received. */
  readonly duration: number;
  pause: () => void;
  play: () => Promise<void>;
}
