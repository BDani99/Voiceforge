import { FunctionsHttpError } from '@supabase/supabase-js';
import { SpeechServiceError } from './speechErrors';

/** Turns a supabase.functions.invoke error into a SpeechServiceError carrying the HTTP status. */
export async function toServiceError(error: Error): Promise<SpeechServiceError> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    let message = error.message;
    try {
      const body = (await response.clone().json()) as { error?: unknown };
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // body was not JSON, keep the generic message
    }
    return new SpeechServiceError(message, response.status);
  }
  return new SpeechServiceError(error.message || 'Network error');
}
