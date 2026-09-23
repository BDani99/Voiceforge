import { createClient } from 'npm:@supabase/supabase-js@2.107.0'
import {
  MAX_REQUESTS_PER_MINUTE,
  mapReserveError,
  mapSpeechifyStatus,
  parseGenerateRequest,
  resolveAllowedOrigin,
} from './logic.ts'

const SPEECHIFY_BASE = 'https://api.sws.speechify.com/v1'
const REQUEST_TIMEOUT_MS = 30_000
const SETTLE_ATTEMPTS = 3

// Comma separated list of allowed origins, e.g. "https://app.example.com,http://localhost:3000".
// Unset = any origin (the API is protected by a Bearer token, not by cookies).
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveAllowedOrigin(req.headers.get('Origin') ?? '', ALLOWED_ORIGINS),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// Speechify
// ---------------------------------------------------------------------------

let cachedToken: { value: string; expiresAt: number } | null = null
let cachedVoices: { value: unknown; expiresAt: number } | null = null

async function getSpeechifyToken(apiKey: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value

  const res = await fetch(`${SPEECHIFY_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', scope: 'audio:all voices:read' }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Speechify auth failed (${res.status})`)

  const { access_token, expires_in } = await res.json()
  if (!access_token) throw new Error('Speechify auth returned no token')

  const ttlMs = Math.max(30, (Number(expires_in) || 3600) - 60) * 1000
  cachedToken = { value: access_token, expiresAt: Date.now() + ttlMs }
  return access_token
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'GET' && req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  try {
    // 1. Authenticate (required for every method)
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return json(req, { error: 'Missing Authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const apiKey = Deno.env.get('SPEECHIFY_API_KEY')
    if (!supabaseUrl || !serviceKey || !apiKey) {
      console.error('Edge Function is missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SPEECHIFY_API_KEY')
      return json(req, { error: 'Server configuration error' }, 500)
    }

    // Service client: bypasses RLS, used for credit bookkeeping and logging only.
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return json(req, { error: 'Unauthorized' }, 401)

    // 2. GET: list voices
    if (req.method === 'GET') {
      if (cachedVoices && cachedVoices.expiresAt > Date.now()) return json(req, cachedVoices.value)

      const accessToken = await getSpeechifyToken(apiKey)
      const voicesRes = await fetch(`${SPEECHIFY_BASE}/voices`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!voicesRes.ok) return json(req, { error: 'Failed to load voices' }, 502)

      const voices = await voicesRes.json()
      cachedVoices = { value: voices, expiresAt: Date.now() + 10 * 60 * 1000 }
      return json(req, voices)
    }

    // 3. POST: validate
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return json(req, { error: 'Invalid JSON body' }, 400)
    }

    const parsed = parseGenerateRequest(body)
    if (!parsed.ok) return json(req, { error: parsed.error }, 400)
    const request = parsed.value

    // Only attach the project to the log if it really belongs to the caller.
    let projectId: string | null = null
    if (request.projectId) {
      const { data: project } = await admin
        .from('projects')
        .select('id')
        .eq('id', request.projectId)
        .eq('user_id', user.id)
        .maybeSingle()
      projectId = project?.id ?? null
    }

    // 4. Reserve credits atomically (also checks suspension and the per-minute rate limit)
    const { data: reservationId, error: reserveError } = await admin.rpc('reserve_credits', {
      p_user_id: user.id,
      p_amount: request.billableCharacters,
      p_max_per_minute: MAX_REQUESTS_PER_MINUTE,
    })
    if (reserveError || !reservationId) {
      const failure = mapReserveError(reserveError ?? {})
      if (failure.status === 500) console.error('reserve_credits failed:', reserveError)
      return json(req, { error: failure.message }, failure.status)
    }

    // Idempotent in SQL; anything that still fails is refunded by the scheduled reconciliation.
    const refund = async () => {
      const { error } = await admin.rpc('refund_credits', { p_reservation_id: reservationId })
      if (error) console.error(`Refund of reservation ${reservationId} failed:`, error)
    }

    // 5. Call Speechify
    let audioData: unknown
    try {
      const accessToken = await getSpeechifyToken(apiKey)
      const speechifyRes = await fetch(`${SPEECHIFY_BASE}/audio/speech`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: request.input,
          voice_id: request.voiceId,
          language: request.language,
          model: request.model,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!speechifyRes.ok) {
        await refund()
        const details = await speechifyRes.json().catch(() => ({}))
        return json(req, { error: 'Speechify generation failed', details }, mapSpeechifyStatus(speechifyRes.status))
      }
      audioData = await speechifyRes.json()
    } catch (err) {
      await refund()
      console.error('Speechify request failed:', err)
      return json(req, { error: 'Speech service unavailable' }, 502)
    }

    // 6. Settle. If this fails the reservation stays pending and would be refunded later,
    //    so it is retried before the response is returned.
    let settled = false
    for (let attempt = 0; attempt < SETTLE_ATTEMPTS && !settled; attempt++) {
      const { error } = await admin.rpc('settle_credits', { p_reservation_id: reservationId })
      settled = !error
      if (error) console.error(`Settling reservation ${reservationId} failed (attempt ${attempt + 1}):`, error)
    }

    // 7. Usage log (best effort, must not fail the request)
    const { error: logError } = await admin.from('usage_logs').insert([{
      user_id: user.id,
      character_count: request.billableCharacters,
      action_type: request.action,
      language: request.language,
      project_id: projectId,
    }])
    if (logError) console.error('Usage log insert failed:', logError)

    return json(req, audioData)
  } catch (err) {
    console.error('Function error:', err)
    return json(req, { error: 'Internal server error' }, 500)
  }
})
