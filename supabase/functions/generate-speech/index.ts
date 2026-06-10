import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Handle GET request for voices (Public, no auth required)
    if (req.method === 'GET') {
      const SPEECHIFY_API_KEY = Deno.env.get('SPEECHIFY_API_KEY')
      if (!SPEECHIFY_API_KEY) {
        console.error('SPEECHIFY_API_KEY is missing in Edge Function secrets')
        return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const tokenRes = await fetch("https://api.sws.speechify.com/v1/auth/token", {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${SPEECHIFY_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ grant_type: 'client_credentials', scope: 'audio:all voices:read' })
      });
      const { access_token } = await tokenRes.json();
      const voicesRes = await fetch("https://api.sws.speechify.com/v1/voices", {
          headers: { 'Authorization': `Bearer ${access_token}` }
      });
      const voicesData = await voicesRes.json();
      return new Response(JSON.stringify(voicesData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- AUTHENTICATION REQUIRED BELOW THIS POINT ---

    // 1. Get auth token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const token = authHeader.replace('Bearer ', '').trim()

    // 2. Initialize Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    // Client for auth check
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)

    // Service client for DB admin operations (bypassing triggers and RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 3. Verify user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', details: authError }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Handle GET request for voices
    if (req.method === 'GET') {
      const SPEECHIFY_API_KEY = Deno.env.get('SPEECHIFY_API_KEY')
      const tokenRes = await fetch("https://api.sws.speechify.com/v1/auth/token", {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${SPEECHIFY_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ grant_type: 'client_credentials', scope: 'audio:all voices:read' })
      });
      const { access_token } = await tokenRes.json();
      const voicesRes = await fetch("https://api.sws.speechify.com/v1/voices", {
          headers: { 'Authorization': `Bearer ${access_token}` }
      });
      const voicesData = await voicesRes.json();
      return new Response(JSON.stringify(voicesData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4. Parse request body for POST
    const body = await req.json()
    const { input, voice_id, language, model } = body

    if (!input || !voice_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Rough character count for credit deduction (assuming input is SSML, strip tags)
    const textOnly = input.replace(/<[^>]*>?/gm, '');
    const charCount = textOnly.length;

    // 5. Check user credits
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users_profile')
      .select('available_characters, is_banned')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (profile.is_banned) {
      return new Response(JSON.stringify({ error: 'Account suspended' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (profile.available_characters < charCount) {
      return new Response(JSON.stringify({ error: 'Insufficient credits' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 6. Call Speechify API
    const SPEECHIFY_API_KEY = Deno.env.get('SPEECHIFY_API_KEY')
    if (!SPEECHIFY_API_KEY) {
      console.error('SPEECHIFY_API_KEY is missing in Edge Function secrets')
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Get Speechify Token
    const tokenRes = await fetch("https://api.sws.speechify.com/v1/auth/token", {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SPEECHIFY_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            grant_type: 'client_credentials',
            scope: 'audio:all voices:read'
        })
    });

    if (!tokenRes.ok) {
        return new Response(JSON.stringify({ error: 'Speechify auth failed' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { access_token } = await tokenRes.json();

    const speechifyRes = await fetch("https://api.sws.speechify.com/v1/audio/speech", {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            input,
            voice_id,
            language,
            model
        })
    });

    if (!speechifyRes.ok) {
        const errorData = await speechifyRes.json().catch(() => ({}));
        return new Response(JSON.stringify({ error: 'Speechify generation failed', details: errorData }), { status: speechifyRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const audioData = await speechifyRes.json();

    // 7. Deduct credits & Log usage
    const newBalance = profile.available_characters - charCount;
    
    await supabaseAdmin
      .from('users_profile')
      .update({ available_characters: newBalance })
      .eq('id', user.id);

    await supabaseAdmin
      .from('usage_logs')
      .insert([{
        user_id: user.id,
        character_count: charCount,
        action_type: 'generation',
        voice_id: voice_id
      }]);

    // 8. Return audio data
    return new Response(JSON.stringify(audioData), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (err) {
    console.error('Function error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
