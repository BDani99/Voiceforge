import { createClient } from 'npm:@supabase/supabase-js@2.107.0'
import {
  MAX_REQUESTS_PER_MINUTE,
  describeCloneFailure,
  mapReserveError,
  parseConsentRequest,
  resolveAllowedOrigin,
  validateCloneFields,
} from './logic.ts'

const SPEECHIFY_BASE = 'https://api.speechify.ai/v1'
const REQUEST_TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 60_000
const DEFAULT_CLONE_COST = 5000

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveAllowedOrigin(req.headers.get('Origin') ?? '', ALLOWED_ORIGINS),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

type AdminClient = ReturnType<typeof createClient>

/** The character cost of one cloned voice, from system_settings (falls back to a fixed default). */
async function cloneCost(admin: AdminClient): Promise<number> {
  const { data } = await admin.from('system_settings').select('value').eq('key', 'voice_clone_cost').maybeSingle()
  const parsed = Number(data?.value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_CLONE_COST
}

/** Consent challenge: no credits, no files — just asks Speechify for the phrase the speaker must read. */
async function handleConsent(req: Request, apiKey: string): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400)
  }
  const parsed = parseConsentRequest(body)
  if (!parsed.ok) return json(req, { error: parsed.error }, 400)

  let upstream: Response
  try {
    upstream = await fetch(`${SPEECHIFY_BASE}/voices/consent-challenges`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: parsed.value.fullName }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    console.error('Consent challenge request failed:', err)
    return json(req, { error: 'Speech service unavailable' }, 502)
  }

  const body2: unknown = await upstream.json().catch(() => ({}))
  if (!upstream.ok) {
    // Speechify itself rate-limits challenge creation (a few dozen per hour, workspace wide);
    // its status and Retry-After are passed straight through.
    return json(req, { error: describeCloneFailure(upstream.status, body2) }, upstream.status)
  }
  return json(req, body2, 201)
}

/** Creates the cloned voice: validates the multipart upload, charges credits, calls Speechify, records ownership. */
async function handleCreate(req: Request, apiKey: string, admin: AdminClient, userId: string): Promise<Response> {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json(req, { error: 'Invalid form data' }, 400)
  }

  const sample = form.get('sample')
  const consentRecording = form.get('consent_recording')
  const parsed = validateCloneFields({
    name: form.get('name')?.toString(),
    consentChallengeId: form.get('consent_challenge_id')?.toString(),
    gender: form.get('gender')?.toString(),
    locale: form.get('locale')?.toString() ?? null,
    sampleBytes: sample instanceof File ? sample.size : undefined,
    sampleType: sample instanceof File ? (sample.type || 'audio/unknown') : undefined,
    consentBytes: consentRecording instanceof File ? consentRecording.size : undefined,
    consentType: consentRecording instanceof File ? (consentRecording.type || 'audio/unknown') : undefined,
  })
  if (!parsed.ok || !(sample instanceof File) || !(consentRecording instanceof File)) {
    return json(req, { error: parsed.ok ? 'Missing recordings' : parsed.error }, 400)
  }
  const fields = parsed.value

  const cost = await cloneCost(admin)
  const { data: reservationId, error: reserveError } = await admin.rpc('reserve_credits', {
    p_user_id: userId,
    p_amount: cost,
    p_max_per_minute: MAX_REQUESTS_PER_MINUTE,
  })
  if (reserveError || !reservationId) {
    const failure = mapReserveError(reserveError ?? {})
    if (failure.status === 500) console.error('reserve_credits failed:', reserveError)
    return json(req, { error: failure.message }, failure.status)
  }
  const refund = async () => {
    const { error } = await admin.rpc('refund_credits', { p_reservation_id: reservationId })
    if (error) console.error(`Refund of reservation ${reservationId} failed:`, error)
  }

  const upstreamForm = new FormData()
  upstreamForm.set('name', fields.name)
  upstreamForm.set('consent_challenge_id', fields.consentChallengeId)
  upstreamForm.set('gender', fields.gender)
  if (fields.locale) upstreamForm.set('locale', fields.locale)
  upstreamForm.set('sample', sample, sample.name || 'sample.wav')
  upstreamForm.set('consent_recording', consentRecording, consentRecording.name || 'consent.webm')

  let upstream: Response
  try {
    upstream = await fetch(`${SPEECHIFY_BASE}/voices`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` }, // no Content-Type: fetch sets the multipart boundary itself
      body: upstreamForm,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    })
  } catch (err) {
    await refund()
    console.error('Voice creation request failed:', err)
    return json(req, { error: 'Speech service unavailable' }, 502)
  }

  const upstreamBody: unknown = await upstream.json().catch(() => ({}))
  if (!upstream.ok) {
    await refund()
    return json(req, { error: describeCloneFailure(upstream.status, upstreamBody) }, upstream.status)
  }

  const voice = upstreamBody as { id?: unknown; display_name?: unknown }
  const speechifyVoiceId = typeof voice.id === 'string' ? voice.id : null
  if (!speechifyVoiceId) {
    await refund()
    console.error('Speechify returned no voice id:', upstreamBody)
    return json(req, { error: 'The voice service returned an unexpected response' }, 502)
  }

  const { data: row, error: insertError } = await admin
    .from('cloned_voices')
    .insert({
      user_id: userId,
      speechify_voice_id: speechifyVoiceId,
      display_name: typeof voice.display_name === 'string' && voice.display_name ? voice.display_name : fields.name,
      gender: fields.gender,
      locale: fields.locale,
      consent_challenge_id: fields.consentChallengeId,
    })
    .select()
    .single()

  if (insertError || !row) {
    console.error('Failed to record ownership of the cloned voice, removing it again:', insertError)
    await refund()
    // Nobody could ever see or manage this voice otherwise (it is invisible without an ownership row): remove it.
    await fetch(`${SPEECHIFY_BASE}/voices/${speechifyVoiceId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch((err) => console.error('Failed to roll back the orphaned cloned voice:', err))
    return json(req, { error: 'The voice could not be saved. Please try again.' }, 500)
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await admin.rpc('settle_credits', { p_reservation_id: reservationId })
    if (!error) break
    console.error(`Settling reservation ${reservationId} failed (attempt ${attempt + 1}):`, error)
  }

  const { error: logError } = await admin.from('usage_logs').insert([{
    user_id: userId,
    character_count: cost,
    action_type: 'voice_clone',
    language: fields.locale,
    project_id: null,
    reason: fields.name,
  }])
  if (logError) console.error('Usage log insert failed:', logError)

  return json(req, row, 201)
}

/** Removes a cloned voice: only its owner may do this, and it is removed from Speechify too. */
async function handleDelete(req: Request, apiKey: string, admin: AdminClient, userId: string): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400)
  }
  const id = typeof body === 'object' && body !== null && 'id' in body ? (body as { id?: unknown }).id : undefined
  if (typeof id !== 'string' || !id) return json(req, { error: 'Missing voice id' }, 400)

  const { data: row, error } = await admin
    .from('cloned_voices')
    .select('id, speechify_voice_id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('Failed to load cloned voice for deletion:', error)
    return json(req, { error: 'Could not delete the voice' }, 500)
  }
  if (!row) return json(req, { error: 'Voice not found' }, 404)

  try {
    const upstream = await fetch(`${SPEECHIFY_BASE}/voices/${row.speechify_voice_id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    // A voice that is already gone on Speechify's side is still fine to remove here.
    if (!upstream.ok && upstream.status !== 404) {
      const details: unknown = await upstream.json().catch(() => ({}))
      return json(req, { error: describeCloneFailure(upstream.status, details) }, upstream.status)
    }
  } catch (err) {
    console.error('Voice deletion request failed:', err)
    return json(req, { error: 'Speech service unavailable' }, 502)
  }

  const { error: deleteError } = await admin.from('cloned_voices').delete().eq('id', row.id)
  if (deleteError) {
    console.error('Failed to remove the ownership row after deleting the voice:', deleteError)
    return json(req, { error: 'The voice was deleted, but could not be removed from your list. Reload the page.' }, 500)
  }
  return json(req, { success: true })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST' && req.method !== 'DELETE') return json(req, { error: 'Method not allowed' }, 405)

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return json(req, { error: 'Missing Authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const apiKey = Deno.env.get('SPEECHIFY_API_KEY')
    if (!supabaseUrl || !serviceKey || !apiKey) {
      console.error('Edge Function is missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SPEECHIFY_API_KEY')
      return json(req, { error: 'Server configuration error' }, 500)
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return json(req, { error: 'Unauthorized' }, 401)

    if (req.method === 'DELETE') return await handleDelete(req, apiKey, admin, user.id)

    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) return await handleCreate(req, apiKey, admin, user.id)
    if (contentType.includes('application/json')) return await handleConsent(req, apiKey)
    return json(req, { error: 'Unsupported content type' }, 400)
  } catch (err) {
    console.error('Function error:', err)
    return json(req, { error: 'Internal server error' }, 500)
  }
})
