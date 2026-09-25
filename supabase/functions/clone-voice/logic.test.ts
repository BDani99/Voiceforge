import { describe, expect, it } from 'vitest'
import {
  MAX_CONSENT_BYTES,
  MAX_SAMPLE_BYTES,
  describeCloneFailure,
  mapReserveError,
  parseConsentRequest,
  resolveAllowedOrigin,
  validateCloneFields,
} from './logic.ts'

describe('parseConsentRequest', () => {
  it('accepts and trims a full name', () => {
    expect(parseConsentRequest({ full_name: '  Jane Doe  ' })).toEqual({ ok: true, value: { fullName: 'Jane Doe' } })
  })

  it('rejects a missing, blank or malformed body', () => {
    expect(parseConsentRequest({ full_name: '' })).toEqual({ ok: false, error: 'The speaker\'s full name is required' })
    expect(parseConsentRequest({ full_name: '   ' })).toEqual({ ok: false, error: 'The speaker\'s full name is required' })
    expect(parseConsentRequest({})).toEqual({ ok: false, error: 'The speaker\'s full name is required' })
    expect(parseConsentRequest(null)).toEqual({ ok: false, error: 'Invalid JSON body' })
    expect(parseConsentRequest([1])).toEqual({ ok: false, error: 'Invalid JSON body' })
    expect(parseConsentRequest({ full_name: 'x'.repeat(201) })).toEqual({ ok: false, error: 'Name is too long' })
  })
})

const validFields = () => ({
  name: 'My Voice',
  consentChallengeId: 'chal_123',
  gender: 'male',
  locale: 'en-US',
  sampleBytes: 1000,
  sampleType: 'audio/wav',
  consentBytes: 2000,
  consentType: 'audio/webm',
})

describe('validateCloneFields', () => {
  it('accepts a complete set of fields and trims strings', () => {
    const result = validateCloneFields({ ...validFields(), name: '  My Voice  ' })
    expect(result).toEqual({ ok: true, value: validFields() })
  })

  it('allows an empty locale', () => {
    const result = validateCloneFields({ ...validFields(), locale: '' })
    expect(result).toEqual({ ok: true, value: { ...validFields(), locale: null } })
  })

  it.each([
    [{ name: '' }, 'Voice name is required'],
    [{ name: '  ' }, 'Voice name is required'],
    [{ name: 'x'.repeat(201) }, 'Voice name is too long'],
    [{ consentChallengeId: '' }, 'Missing consent challenge'],
    [{ consentChallengeId: 'x'.repeat(201) }, 'Invalid consent challenge'],
    [{ gender: 'other' }, 'Invalid gender'],
    [{ gender: undefined }, 'Invalid gender'],
    [{ locale: 'not a locale' }, 'Invalid language'],
    [{ sampleBytes: 0 }, 'A voice sample is required'],
    [{ sampleBytes: undefined }, 'A voice sample is required'],
    [{ sampleBytes: MAX_SAMPLE_BYTES + 1 }, 'The voice sample must be under 5 MB'],
    [{ sampleType: 'text/plain' }, 'The voice sample must be an audio file'],
    [{ consentBytes: 0 }, 'The consent recording is required'],
    [{ consentBytes: MAX_CONSENT_BYTES + 1 }, 'The consent recording must be under 25 MB'],
    [{ consentType: 'text/plain' }, 'The consent recording must be an audio file'],
  ])('rejects %j', (patch, error) => {
    expect(validateCloneFields({ ...validFields(), ...patch })).toEqual({ ok: false, error })
  })

  it('accepts sizes exactly at the limit', () => {
    const result = validateCloneFields({ ...validFields(), sampleBytes: MAX_SAMPLE_BYTES, consentBytes: MAX_CONSENT_BYTES })
    expect(result.ok).toBe(true)
  })
})

describe('describeCloneFailure', () => {
  it('translates known consent reason codes (object shape)', () => {
    expect(describeCloneFailure(422, { error: { code: 'consent_phrase_mismatch' } })).toMatch(/did not match the phrase/)
    expect(describeCloneFailure(422, { error: { code: 'consent_speaker_mismatch' } })).toMatch(/same person/)
    expect(describeCloneFailure(422, { error: { code: 'consent_recording_unusable' } })).toMatch(/could not be understood/)
    expect(describeCloneFailure(409, { error: { code: 'consent_challenge_expired' } })).toMatch(/expired/)
    expect(describeCloneFailure(409, { error: { code: 'consent_challenge_already_used' } })).toMatch(/already used/)
    expect(describeCloneFailure(404, { error: { code: 'consent_challenge_not_found' } })).toMatch(/could not be found/)
    expect(describeCloneFailure(502, { error: { code: 'consent_verification_unavailable' } })).toMatch(/temporarily unavailable/)
  })

  it('also reads a plain string error field', () => {
    expect(describeCloneFailure(422, { error: 'consent_phrase_mismatch' })).toMatch(/did not match the phrase/)
  })

  it('falls back for unknown reasons, and gives a specific message for plan and size limits', () => {
    expect(describeCloneFailure(422, { error: { code: 'something_new' } })).toMatch(/could not be created/)
    expect(describeCloneFailure(402, {})).toMatch(/not available on the current plan/)
    expect(describeCloneFailure(413, {})).toMatch(/too large/)
    expect(describeCloneFailure(500, undefined)).toMatch(/could not be created/)
  })
})

describe('resolveAllowedOrigin', () => {
  it('allows any origin when none is configured', () => {
    expect(resolveAllowedOrigin('https://x.example', [])).toBe('*')
  })

  it('echoes an allowed origin and falls back to the first one otherwise', () => {
    const allowed = ['https://app.example', 'http://localhost:3000']
    expect(resolveAllowedOrigin('http://localhost:3000', allowed)).toBe('http://localhost:3000')
    expect(resolveAllowedOrigin('https://evil.example', allowed)).toBe('https://app.example')
  })
})

describe('mapReserveError', () => {
  it.each([
    ['P0402', 402, 'Insufficient credits'],
    ['P0403', 403, 'Account suspended'],
    ['P0404', 404, 'User profile not found'],
    ['P0429', 429, 'Too many requests, please slow down'],
    ['unknown', 500, 'Internal server error'],
  ])('maps %s', (code, status, message) => {
    expect(mapReserveError({ code })).toEqual({ status, message })
  })
})
