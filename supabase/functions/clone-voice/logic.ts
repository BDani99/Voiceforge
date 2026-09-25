// Pure request logic of the clone-voice Edge Function (see generate-speech/logic.ts for the
// same split). No Deno or network dependencies, so it is unit tested with the regular runner.
//
// resolveAllowedOrigin, HttpFailure and mapReserveError are byte-for-byte the same helpers as in
// generate-speech/logic.ts, duplicated rather than imported: each Edge Function is deployed as its
// own self-contained bundle, so a relative import across function directories would not resolve.

export const MAX_REQUESTS_PER_MINUTE = 60
export const MAX_NAME_LENGTH = 200
export const MAX_CHALLENGE_ID_LENGTH = 200
// Speechify's own limits (see docs/features/voice-cloning): sample 10-30s under 5MB,
// consent recording 5-30s under 25MB. Duration cannot be checked without decoding the audio, so
// only the size and the declared type are validated here; Speechify rejects a bad recording itself.
export const MAX_SAMPLE_BYTES = 5 * 1024 * 1024
export const MAX_CONSENT_BYTES = 25 * 1024 * 1024

const GENDERS = new Set(['male', 'female', 'not_specified'])
const LOCALE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/

export interface ConsentRequest {
  fullName: string
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export function parseConsentRequest(body: unknown): ParseResult<ConsentRequest> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Invalid JSON body' }
  }
  const { full_name } = body as Record<string, unknown>
  if (typeof full_name !== 'string' || !full_name.trim()) {
    return { ok: false, error: 'The speaker\'s full name is required' }
  }
  if (full_name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: 'Name is too long' }
  }
  return { ok: true, value: { fullName: full_name.trim() } }
}

export interface CloneFields {
  name: string
  consentChallengeId: string
  gender: string
  locale: string | null
  sampleBytes: number
  sampleType: string
  consentBytes: number
  consentType: string
}

/** Validates the multipart fields of a create-voice request before any file is forwarded to Speechify. */
export function validateCloneFields(fields: Partial<CloneFields>): ParseResult<CloneFields> {
  const { name, consentChallengeId, gender, locale, sampleBytes, sampleType, consentBytes, consentType } = fields

  if (typeof name !== 'string' || !name.trim()) return { ok: false, error: 'Voice name is required' }
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: 'Voice name is too long' }

  if (typeof consentChallengeId !== 'string' || !consentChallengeId.trim()) {
    return { ok: false, error: 'Missing consent challenge' }
  }
  if (consentChallengeId.length > MAX_CHALLENGE_ID_LENGTH) return { ok: false, error: 'Invalid consent challenge' }

  if (typeof gender !== 'string' || !GENDERS.has(gender)) return { ok: false, error: 'Invalid gender' }

  if (locale !== undefined && locale !== null && locale !== '' && !LOCALE_RE.test(locale)) {
    return { ok: false, error: 'Invalid language' }
  }

  if (typeof sampleBytes !== 'number' || sampleBytes <= 0) return { ok: false, error: 'A voice sample is required' }
  if (sampleBytes > MAX_SAMPLE_BYTES) return { ok: false, error: 'The voice sample must be under 5 MB' }
  if (typeof sampleType !== 'string' || !sampleType.startsWith('audio/')) return { ok: false, error: 'The voice sample must be an audio file' }

  if (typeof consentBytes !== 'number' || consentBytes <= 0) return { ok: false, error: 'The consent recording is required' }
  if (consentBytes > MAX_CONSENT_BYTES) return { ok: false, error: 'The consent recording must be under 25 MB' }
  if (typeof consentType !== 'string' || !consentType.startsWith('audio/')) return { ok: false, error: 'The consent recording must be an audio file' }

  return {
    ok: true,
    value: {
      name: name.trim(),
      consentChallengeId: consentChallengeId.trim(),
      gender,
      locale: locale?.trim() ? locale.trim() : null,
      sampleBytes,
      sampleType,
      consentBytes,
      consentType,
    },
  }
}

/** Speechify's 422 (and a few 409/404/502) reason codes for a failed consent verification, in plain language. */
const CONSENT_REASONS: Record<string, string> = {
  consent_phrase_mismatch: 'The recording did not match the phrase you were shown. Please read it exactly as written and try again.',
  consent_speaker_mismatch: 'The consent recording does not sound like the same person as the voice sample. The person being cloned must record the consent phrase themselves.',
  consent_recording_unusable: 'The consent recording could not be understood. Please re-record it in a quiet place.',
  consent_challenge_expired: 'This consent request expired. Please start again.',
  consent_challenge_already_used: 'This consent request was already used. Please start again.',
  consent_challenge_not_found: 'This consent request could not be found. Please start again.',
  consent_verification_unavailable: 'Consent verification is temporarily unavailable. Please try again in a moment (no need to re-record).',
}

/** Picks the value for Access-Control-Allow-Origin. No configured origins means any origin. */
export function resolveAllowedOrigin(requestOrigin: string, allowedOrigins: string[]): string {
  if (allowedOrigins.length === 0) return '*'
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : (allowedOrigins[0] ?? '*')
}

export interface HttpFailure {
  status: number
  message: string
}

/**
 * Maps an error of the reserve_credits SQL function (custom SQLSTATEs, see the migration)
 * to an HTTP response. Anything unknown is an internal error.
 */
export function mapReserveError(error: { code?: string; message?: string }): HttpFailure {
  switch (error.code) {
    case 'P0402':
      return { status: 402, message: 'Insufficient credits' }
    case 'P0403':
      return { status: 403, message: 'Account suspended' }
    case 'P0404':
      return { status: 404, message: 'User profile not found' }
    case 'P0429':
      return { status: 429, message: 'Too many requests, please slow down' }
    default:
      return { status: 500, message: 'Internal server error' }
  }
}

/** A friendly message for a failed voice creation, from Speechify's error body if it has a known reason code. */
export function describeCloneFailure(status: number, body: unknown): string {
  const errorField = typeof body === 'object' && body !== null && 'error' in body
    ? (body as { error?: unknown }).error
    : undefined
  // The error can be a plain string, or an object with a `code`, depending on the endpoint.
  const reason = typeof errorField === 'string'
    ? errorField
    : (typeof errorField === 'object' && errorField !== null && 'code' in errorField
      ? (errorField as { code?: unknown }).code
      : undefined)

  if (typeof reason === 'string' && CONSENT_REASONS[reason]) return CONSENT_REASONS[reason]
  if (status === 402) return 'Voice cloning is not available on the current plan.'
  if (status === 413) return 'One of the files is too large.'
  return 'The voice could not be created. Please check the recordings and try again.'
}
