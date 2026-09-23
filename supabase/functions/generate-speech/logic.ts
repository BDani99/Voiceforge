// Pure request logic of the generate-speech Edge Function. It has no Deno or network
// dependencies, so it is unit tested with the regular test runner (see logic.test.ts).

export const MAX_INPUT_LENGTH = 20_000
export const MAX_VOICE_ID_LENGTH = 128
export const MAX_REQUESTS_PER_MINUTE = 60

const ALLOWED_MODELS = new Set(['simba-english', 'simba-multilingual'])
const ALLOWED_ACTIONS = new Set(['generation', 'preview'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LOCALE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/

export type GenerateAction = 'generation' | 'preview'

export interface GenerateRequest {
  input: string
  voiceId: string
  language: string
  model: string
  action: GenerateAction
  /** Only present when the client sent a syntactically valid UUID; ownership is checked later. */
  projectId: string | null
  billableCharacters: number
}

export type ParseResult =
  | { ok: true; value: GenerateRequest }
  | { ok: false; error: string }

/** Counts the billable characters of an SSML document: tags are free, entities count once. */
export function countBillableCharacters(ssml: string): number {
  return ssml
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, '_')
    .length
}

export function parseGenerateRequest(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Invalid JSON body' }
  }
  const { input, voice_id, language, model, action = 'generation', project_id } =
    body as Record<string, unknown>

  if (typeof input !== 'string' || !input.trim() || typeof voice_id !== 'string' || !voice_id) {
    return { ok: false, error: 'Missing required fields' }
  }
  if (input.length > MAX_INPUT_LENGTH || voice_id.length > MAX_VOICE_ID_LENGTH) {
    return { ok: false, error: 'Input too long' }
  }
  if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) {
    return { ok: false, error: 'Unsupported model' }
  }
  if (typeof language !== 'string' || !LOCALE_RE.test(language)) {
    return { ok: false, error: 'Invalid language' }
  }
  if (typeof action !== 'string' || !ALLOWED_ACTIONS.has(action)) {
    return { ok: false, error: 'Invalid action' }
  }

  const billableCharacters = countBillableCharacters(input)
  if (billableCharacters === 0) return { ok: false, error: 'Nothing to synthesize' }

  return {
    ok: true,
    value: {
      input,
      voiceId: voice_id,
      language,
      model,
      action: action as GenerateAction,
      projectId: typeof project_id === 'string' && UUID_RE.test(project_id) ? project_id : null,
      billableCharacters,
    },
  }
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

/** Speechify 4xx answers (e.g. unsupported SSML) are passed on so the client can react; 5xx become 502. */
export function mapSpeechifyStatus(status: number): number {
  return status >= 400 && status < 500 ? status : 502
}
