import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const SPEECHIFY_BASE = 'https://api.sws.speechify.com/v1'
const REQUEST_TIMEOUT_MS = 30_000
const MAX_INPUT_LENGTH = 20_000
const MAX_VOICE_ID_LENGTH = 128
const ALLOWED_MODELS = new Set(['simba-english', 'simba-multilingual'])
const ALLOWED_ACTIONS = new Set(['generation', 'preview'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LOCALE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/

// Comma separated list of allowed origins, e.g. "https://app.example.com,http://localhost:3000".
// Unset = any origin (the API is protected by a Bearer token, not by cookies).
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowOrigin = ALLOWED_ORIGINS.length === 0
    ? '*'
    : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
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
// Speechify helpers
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
// Credits
// ---------------------------------------------------------------------------

/**
 * Atomically changes the balance using optimistic concurrency: the UPDATE only
 * succeeds if the balance is still the one we read, so parallel requests can
 * never overdraw an account. Returns false if the balance is insufficient.
 */
async function adjustCredits(
  admin: ReturnType<typeof createClient>,
  userId: string,
  delta: number,
): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: profile, error } = await admin
      .from('users_profile')
      .select('available_characters')
      .eq('id', userId)
      .single()
    if (error || !profile) throw new Error('Profile lookup failed')

    const next = profile.available_characters + delta
    if (next < 0) return false

    const { data: updated, error: updateError } = await admin
      .from('users_profile')
      .update({ available_characters: next })
      .eq('id', userId)
      .eq('available_characters', profile.available_characters)
      .select('id')
    if (updateError) throw new Error('Credit update failed')
    if (updated && updated.length > 0) return true
    // Someone else changed the balance in between, retry.
  }
  throw new Error('Could not update credits, please retry')
}

/** Counts the billable characters of an SSML document (tags stripped, entities decoded). */
function countBillableCharacters(ssml: string): number {
  return ssml
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, '_')
    .length
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

    // Service client: bypasses RLS, used for credit bookkeeping only.
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

    // 3. POST: generate speech
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return json(req, { error: 'Invalid JSON body' }, 400)
    }

    const { input, voice_id, language, model, action = 'generation', project_id } = body

    if (typeof input !== 'string' || !input.trim() || typeof voice_id !== 'string' || !voice_id) {
      return json(req, { error: 'Missing required fields' }, 400)
    }
    if (input.length > MAX_INPUT_LENGTH || voice_id.length > MAX_VOICE_ID_LENGTH) {
      return json(req, { error: 'Input too long' }, 400)
    }
    if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) {
      return json(req, { error: 'Unsupported model' }, 400)
    }
    if (typeof language !== 'string' || !LOCALE_RE.test(language)) {
      return json(req, { error: 'Invalid language' }, 400)
    }
    if (typeof action !== 'string' || !ALLOWED_ACTIONS.has(action)) {
      return json(req, { error: 'Invalid action' }, 400)
    }

    const charCount = countBillableCharacters(input)
    if (charCount === 0) return json(req, { error: 'Nothing to synthesize' }, 400)

    // Only attach the project to the log if it really belongs to the caller.
    let projectId: string | null = null
    if (typeof project_id === 'string' && UUID_RE.test(project_id)) {
      const { data: project } = await admin
        .from('projects')
        .select('id')
        .eq('id', project_id)
        .eq('user_id', user.id)
        .maybeSingle()
      projectId = project?.id ?? null
    }

    const { data: profile, error: profileError } = await admin
      .from('users_profile')
      .select('is_banned')
      .eq('id', user.id)
      .single()
    if (profileError || !profile) return json(req, { error: 'User profile not found' }, 404)
    if (profile.is_banned) return json(req, { error: 'Account suspended' }, 403)

    // 4. Reserve credits first, refund if generation fails
    if (!(await adjustCredits(admin, user.id, -charCount))) {
      return json(req, { error: 'Insufficient credits' }, 402)
    }

    const refund = async () => {
      try {
        await adjustCredits(admin, user.id, charCount)
      } catch (e) {
        console.error(`Refund of ${charCount} characters failed for user ${user.id}:`, e)
      }
    }

    // 5. Call Speechify
    let audioData: unknown
    try {
      const accessToken = await getSpeechifyToken(apiKey)
      const speechifyRes = await fetch(`${SPEECHIFY_BASE}/audio/speech`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, voice_id, language, model }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!speechifyRes.ok) {
        await refund()
        const details = await speechifyRes.json().catch(() => ({}))
        // Keep 4xx (e.g. 400 for unsupported SSML) so the client can fall back; mask 5xx as 502.
        const status = speechifyRes.status >= 400 && speechifyRes.status < 500 ? speechifyRes.status : 502
        return json(req, { error: 'Speechify generation failed', details }, status)
      }
      audioData = await speechifyRes.json()
    } catch (err) {
      await refund()
      console.error('Speechify request failed:', err)
      return json(req, { error: 'Speech service unavailable' }, 502)
    }

    // 6. Usage log (best effort, must not fail the request)
    const { error: logError } = await admin.from('usage_logs').insert([{
      user_id: user.id,
      character_count: charCount,
      action_type: action,
      language,
      project_id: projectId,
    }])
    if (logError) console.error('Usage log insert failed:', logError)

    return json(req, audioData)
  } catch (err) {
    console.error('Function error:', err)
    return json(req, { error: 'Internal server error' }, 500)
  }
})
