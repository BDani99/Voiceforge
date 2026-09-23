import { describe, expect, it } from 'vitest'
import {
  countBillableCharacters,
  mapReserveError,
  mapSpeechifyStatus,
  MAX_INPUT_LENGTH,
  parseGenerateRequest,
  resolveAllowedOrigin,
} from './logic.ts'

const valid = {
  input: '<speak>Hello</speak>',
  voice_id: 'henry',
  language: 'en-US',
  model: 'simba-english',
}

describe('countBillableCharacters', () => {
  it('ignores tags and counts entities once', () => {
    expect(countBillableCharacters('<speak>Hi<break time="50ms"/> there</speak>')).toBe(8)
    expect(countBillableCharacters('<speak>a &amp; b &lt;c&gt;</speak>')).toBe(9)
  })

  it('cannot be tricked into free characters by attribute content', () => {
    expect(countBillableCharacters('<sub alias="very long alias">ab</sub>')).toBe(2)
  })
})

describe('parseGenerateRequest', () => {
  it('accepts a valid request and applies defaults', () => {
    const result = parseGenerateRequest(valid)
    expect(result).toEqual({
      ok: true,
      value: {
        input: valid.input,
        voiceId: 'henry',
        language: 'en-US',
        model: 'simba-english',
        action: 'generation',
        projectId: null,
        billableCharacters: 5,
      },
    })
  })

  it('keeps only syntactically valid project ids', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000'
    expect(parseGenerateRequest({ ...valid, project_id: id })).toMatchObject({ ok: true, value: { projectId: id } })
    expect(parseGenerateRequest({ ...valid, project_id: "1' or '1'='1" })).toMatchObject({ ok: true, value: { projectId: null } })
  })

  it.each([
    [null, 'Invalid JSON body'],
    [[], 'Invalid JSON body'],
    [{ ...valid, input: '' }, 'Missing required fields'],
    [{ ...valid, voice_id: undefined }, 'Missing required fields'],
    [{ ...valid, input: 'x'.repeat(MAX_INPUT_LENGTH + 1) }, 'Input too long'],
    [{ ...valid, model: 'gpt' }, 'Unsupported model'],
    [{ ...valid, language: 'en US' }, 'Invalid language'],
    [{ ...valid, action: 'admin_topup' }, 'Invalid action'],
    [{ ...valid, input: '<speak></speak>' }, 'Nothing to synthesize'],
  ])('rejects %j', (body, error) => {
    expect(parseGenerateRequest(body)).toEqual({ ok: false, error })
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

describe('error mapping', () => {
  it('maps the credit function SQLSTATEs', () => {
    expect(mapReserveError({ code: 'P0402' }).status).toBe(402)
    expect(mapReserveError({ code: 'P0403' }).status).toBe(403)
    expect(mapReserveError({ code: 'P0404' }).status).toBe(404)
    expect(mapReserveError({ code: 'P0429' }).status).toBe(429)
    expect(mapReserveError({ code: '08006', message: 'db down' })).toEqual({ status: 500, message: 'Internal server error' })
  })

  it('passes Speechify 4xx through and masks everything else', () => {
    expect(mapSpeechifyStatus(400)).toBe(400)
    expect(mapSpeechifyStatus(404)).toBe(404)
    expect(mapSpeechifyStatus(500)).toBe(502)
    expect(mapSpeechifyStatus(302)).toBe(502)
  })
})
