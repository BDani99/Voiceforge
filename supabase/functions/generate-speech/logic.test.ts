import { describe, expect, it } from 'vitest'
import {
  StreamWatcher,
  canUseVoice,
  countBillableCharacters,
  filterPersonalVoices,
  hasPersonalVoices,
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
  it.each(['simba-3.2', 'simba-3.0', 'simba-english', 'simba-multilingual'])('accepts the model %s', (model) => {
    expect(parseGenerateRequest({ ...valid, model })).toMatchObject({ ok: true, value: { model } });
  });

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
        stream: false,
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

describe('stream flag', () => {
  it('defaults to false and accepts a boolean', () => {
    expect(parseGenerateRequest(valid)).toMatchObject({ ok: true, value: { stream: false } })
    expect(parseGenerateRequest({ ...valid, stream: true })).toMatchObject({ ok: true, value: { stream: true } })
  })

  it('rejects anything else', () => {
    expect(parseGenerateRequest({ ...valid, stream: 'yes' })).toEqual({ ok: false, error: 'Invalid stream flag' })
  })
})

describe('StreamWatcher', () => {
  const bytes = (text: string) => new TextEncoder().encode(text)

  it('is not billable before audio arrives', () => {
    const watcher = new StreamWatcher()
    expect(watcher.billable).toBe(false)
    watcher.push(bytes('event: speech.done\ndata: {}\n\n'))
    expect(watcher.done).toBe(true)
    expect(watcher.billable).toBe(false)
  })

  it('is billable once audio arrived, also when the stream is not finished (the listener left)', () => {
    const watcher = new StreamWatcher()
    watcher.push(bytes('event: speech.chunk\ndata: {"audio":"AAAA"}\n\n'))
    expect(watcher.sawAudio).toBe(true)
    expect(watcher.done).toBe(false)
    expect(watcher.billable).toBe(true)
  })

  it('is not billable when the stream fails', () => {
    const watcher = new StreamWatcher()
    watcher.push(bytes('event: speech.chunk\ndata: {}\n\n'))
    watcher.push(bytes('event: speech.error\ndata: {"error":{"code":"upstream_failure"}}\n\n'))
    expect(watcher.failed).toBe(true)
    expect(watcher.billable).toBe(false)
  })

  it('recognises an event name that is split between two chunks', () => {
    const watcher = new StreamWatcher()
    watcher.push(bytes('data: {}\n\nevent: speech.ch'))
    expect(watcher.sawAudio).toBe(false)
    watcher.push(bytes('unk\ndata: {}\n\n'))
    expect(watcher.sawAudio).toBe(true)
  })
})

describe('cloned voices: who may see and use them', () => {
  const shared = { id: 'henry', type: 'shared' }
  const mine = { id: 'mine', type: 'personal' }
  const theirs = { id: 'theirs', type: 'personal' }

  it('knows whether a list contains cloned voices at all', () => {
    expect(hasPersonalVoices([shared, mine])).toBe(true)
    expect(hasPersonalVoices([shared])).toBe(false)
    expect(hasPersonalVoices([])).toBe(false)
    expect(hasPersonalVoices('nope')).toBe(false)
    expect(hasPersonalVoices([{ type: 'personal' }, null, 5])).toBe(false) // no usable id
  })

  it('keeps the whole catalog and only the cloned voices the user owns', () => {
    expect(filterPersonalVoices([shared, mine, theirs], new Set(['mine']))).toEqual([shared, mine])
  })

  it('hides every cloned voice from a user who owns none (also when ownership could not be read)', () => {
    expect(filterPersonalVoices([shared, mine, theirs], new Set())).toEqual([shared])
  })

  it('leaves the list alone when there is nothing to hide, and anything it does not understand', () => {
    expect(filterPersonalVoices([shared], new Set())).toEqual([shared])
    const odd = [shared, null, 'x', { id: 7, type: 'personal' }]
    expect(filterPersonalVoices(odd, new Set())).toEqual(odd) // an unrecognisable shape never hides the catalog
    expect(filterPersonalVoices({ not: 'a list' }, new Set())).toEqual({ not: 'a list' })
  })

  it('does not change the original list', () => {
    const list = [shared, theirs]
    filterPersonalVoices(list, new Set())
    expect(list).toHaveLength(2)
  })

  it('lets a user use built-in voices and their own cloned voices, nobody else\'s', () => {
    expect(canUseVoice(null, 'u1')).toBe(true) // no owner: a built-in voice
    expect(canUseVoice(undefined, 'u1')).toBe(true)
    expect(canUseVoice('u1', 'u1')).toBe(true)
    expect(canUseVoice('u2', 'u1')).toBe(false)
  })
})
