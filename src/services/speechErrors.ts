export class SpeechServiceError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'SpeechServiceError';
    this.status = status;
  }
}
