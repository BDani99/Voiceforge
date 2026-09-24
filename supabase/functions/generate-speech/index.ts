import { createClient } from 'npm:@supabase/supabase-js@2.107.0'
import {
  MAX_REQUESTS_PER_MINUTE,
  STREAM_OUTPUT_FORMAT,
  StreamWatcher,
  type GenerateRequest,
  mapReserveError,
  mapSpeechifyStatus,
  parseGenerateRequest,
  resolveAllowedOrigin,
} from './logic.ts'

// The API key is sent directly (server side only); the older access-token exchange is deprecated by Speechify.
const SPEECHIFY_BASE = 'https://api.speechify.ai/v1'
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

let cachedVoices: { value: unknown; expiresAt: number } | null = null

type AdminClient = ReturnType<typeof createClient>

/** Turns a reservation into a charge. If this fails it is retried; what still fails is refunded by the scheduled reconciliation. */
async function settleReservation(admin: AdminClient, reservationId: string): Promise<void> {
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt++) {
    const { error } = await admin.rpc('settle_credits', { p_reservation_id: reservationId })
    if (!error) return
    console.error(`Settling reservation ${reservationId} failed (attempt ${attempt + 1}):`, error)
  }
}

/** Usage log (best effort, must not fail the request). */
async function logUsage(admin: AdminClient, userId: string, request: GenerateRequest, projectId: string | null): Promise<void> {
  const { error } = await admin.from('usage_logs').insert([{
    user_id: userId,
    character_count: request.billableCharacters,
    action_type: request.action,
    language: request.language,
    project_id: projectId,
  }])
  if (error) console.error('Usage log insert failed:', error)
}

interface StreamContext {
  req: Request
  apiKey: string
  request: GenerateRequest
  admin: AdminClient
  userId: string
  projectId: string | null
  reservationId: string
  refund: () => Promise<void>
}

/**
 * Streams synthesized speech to the browser: audio (raw PCM) and word timings as server-sent events,
 * passed through from Speechify while the audio is still being made. The API key never leaves the server.
 * Credits are reserved before, and settled or refunded when the stream ends.
 */
async function streamSpeech(ctx: StreamContext): Promise<Response> {
  const { req, apiKey, request, admin, userId, projectId, reservationId, refund } = ctx

  // Only the wait for the first bytes is limited; the stream itself may take as long as the text needs.
  const connect = new AbortController()
  const connectTimer = setTimeout(() => connect.abort(), REQUEST_TIMEOUT_MS)
  let upstream: Response
  try {
    upstream = await fetch(`${SPEECHIFY_BASE}/audio/stream/with-timestamps`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify({
        input: request.input,
        voice_id: request.voiceId,
        language: request.language,
        model: request.model,
        output_format: STREAM_OUTPUT_FORMAT,
      }),
      signal: connect.signal,
    })
  } catch (err) {
    await refund()
    console.error('Speechify stream request failed:', err)
    return json(req, { error: 'Speech service unavailable' }, 502)
  } finally {
    clearTimeout(connectTimer)
  }

  if (!upstream.ok || !upstream.body) {
    await refund()
    const details = await upstream.json().catch(() => ({}))
    return json(req, { error: 'Speechify generation failed', details }, mapSpeechifyStatus(upstream.status))
  }

  const watcher = new StreamWatcher()
  const reader = upstream.body.getReader()
  let finished = false

  const finalize = async (): Promise<void> => {
    if (finished) return
    finished = true
    if (watcher.billable) {
      await settleReservation(admin, reservationId)
      await logUsage(admin, userId, request, projectId)
    } else {
      await refund()
    }
  }

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          // Speechify closed the stream without saying it was finished: that is a failure, not a completed audio.
          if (!watcher.done) watcher.failed = true
          await finalize()
          controller.close()
          return
        }
        watcher.push(value)
        controller.enqueue(value)
      } catch (err) {
        console.error('Speechify stream failed:', err)
        watcher.failed = true
        await finalize()
        controller.error(err)
      }
    },
    async cancel(reason) {
      // The listener left: stop the upstream, and charge for the audio that was delivered.
      const work = (async () => {
        await reader.cancel(reason).catch(() => undefined)
        await finalize()
      })()
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime
      if (runtime?.waitUntil) runtime.waitUntil(work)
      else await work
    },
  })

  return new Response(body, {
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
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

      const voicesRes = await fetch(`${SPEECHIFY_BASE}/voices`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
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

    // 5a. Streaming: audio and word timings are passed on while they are made
    if (request.stream) {
      return await streamSpeech({ req, apiKey, request, admin, userId: user.id, projectId, reservationId, refund })
    }

    // 5. Call Speechify
    let audioData: unknown
    try {
      const speechifyRes = await fetch(`${SPEECHIFY_BASE}/audio/speech`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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
    await settleReservation(admin, reservationId)

    // 7. Usage log
    await logUsage(admin, user.id, request, projectId)

    return json(req, audioData)
  } catch (err) {
    console.error('Function error:', err)
    return json(req, { error: 'Internal server error' }, 500)
  }
})
