/**
 * Prism API Edge Function
 * 
 * Proxy/wrapper for the Prism AI orchestration API
 * Handles authentication, rate limiting, and request forwarding
 * 
 * Endpoints:
 * - POST /run - Start a new Prism reasoning run
 * - GET /run/:id - Get run status and results
 * - GET /usage - Get API key usage statistics
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAuth } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// API KEY VALIDATION
// =============================================================================

interface PrismAPIKey {
  key: string;
  user_id: string | null; // null for system-wide keys
  rate_limit_per_hour: number;
  daily_token_limit: number;
  daily_cost_limit: number;
  is_active: boolean;
}

async function validateAPIKey(apiKey: string, supabase: any): Promise<PrismAPIKey | null> {
  // Check if it's a valid Prism API key format
  if (!apiKey.startsWith('sk_prism_')) {
    return null;
  }

  // Check user-specific keys in profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, prism_api_key')
    .eq('prism_api_key', apiKey)
    .eq('status', 'active')
    .single();

  if (profile?.prism_api_key === apiKey) {
    return {
      key: apiKey,
      user_id: profile.id,
      rate_limit_per_hour: 100,
      daily_token_limit: 1000000,
      daily_cost_limit: 10.0,
      is_active: true,
    };
  }

  // Check system-wide keys (stored in environment or a config table)
  // For now, we'll check environment variable
  const systemKey = Deno.env.get('PRISM_SYSTEM_API_KEY');
  if (systemKey && apiKey === systemKey) {
    return {
      key: apiKey,
      user_id: null, // System-wide
      rate_limit_per_hour: 1000,
      daily_token_limit: 10000000,
      daily_cost_limit: 100.0,
      is_active: true,
    };
  }

  return null;
}

// =============================================================================
// RATE LIMITING & USAGE TRACKING
// =============================================================================

async function checkRateLimit(
  apiKey: PrismAPIKey,
  supabase: any
): Promise<{ allowed: boolean; reason?: string }> {
  // System-wide keys have higher limits and may skip rate limiting
  if (!apiKey.user_id) {
    // For system-wide keys, we still check but with higher thresholds
    // You can adjust this logic based on your needs
    return { allowed: true };
  }

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const todayStart = new Date(now.setHours(0, 0, 0, 0));

  // Check hourly rate limit
  const { data: recentRuns } = await supabase
    .from('prism_runs')
    .select('id')
    .eq('user_id', apiKey.user_id)
    .gte('created_at', oneHourAgo.toISOString());

  if (recentRuns && recentRuns.length >= apiKey.rate_limit_per_hour) {
    return {
      allowed: false,
      reason: 'Rate limit exceeded. Please try again later.',
    };
  }

  // Check daily token limit
  const { data: todayRuns } = await supabase
    .from('prism_runs')
    .select('tokens_used')
    .eq('user_id', apiKey.user_id)
    .gte('created_at', todayStart.toISOString())
    .not('tokens_used', 'is', null);

  const todayTokens = todayRuns?.reduce((sum, run) => sum + (run.tokens_used || 0), 0) || 0;
  if (todayTokens >= apiKey.daily_token_limit) {
    return {
      allowed: false,
      reason: 'Daily token limit exceeded.',
    };
  }

  // Check daily cost limit
  const todayCost = todayRuns?.reduce((sum, run) => sum + (run.cost || 0), 0) || 0;
  if (todayCost >= apiKey.daily_cost_limit) {
    return {
      allowed: false,
      reason: 'Daily cost limit exceeded.',
    };
  }

  return { allowed: true };
}

// =============================================================================
// PRISM API IMPLEMENTATION
// =============================================================================

// This is a placeholder - you'll need to implement the actual Prism logic
// or forward to your Prism service URL
const PRISM_SERVICE_URL = Deno.env.get('PRISM_SERVICE_URL'); // Optional: external Prism service

async function runPrismAnalysis(
  prompt: string,
  mode: string,
  depth: string
): Promise<{
  run_id: string;
  status: string;
  cycles_completed?: number;
  final_output?: string;
  usage?: { total_tokens: number; estimated_cost: number };
}> {
  // TODO: Implement Prism multi-agent reasoning logic here
  // OR forward to external Prism service if PRISM_SERVICE_URL is set

  if (PRISM_SERVICE_URL) {
    // Forward to external Prism service
    // Get the API key to forward (use system key or the validated key)
    const apiKeyToForward = Deno.env.get('PRISM_SYSTEM_API_KEY') || '';
    
    const response = await fetch(`${PRISM_SERVICE_URL}/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeyToForward}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, mode, depth }),
    });

    const responseData = await response.json().catch(() => null);

    // Check for HTTP errors
    if (!response.ok) {
      const errorMessage = responseData?.error || responseData?.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }

    // Check if response indicates an error even with 200 status
    if (responseData && responseData.status === 'error') {
      const errorMessage = responseData.error || 'Unknown error from Prism service';
      throw new Error(errorMessage);
    }

    return responseData;
  }

  // Placeholder implementation - replace with actual Prism logic
  const runId = crypto.randomUUID();
  
  // Simulate processing (replace with actual Prism agent loop)
  const cycles = depth === 'insight' ? 1 : depth === 'synthesis' ? 2 : 3;
  
  // For now, return a placeholder response
  // You'll need to implement the actual Prism reasoning loop
  return {
    run_id: runId,
    status: 'complete',
    cycles_completed: cycles,
    final_output: `[Prism Analysis Placeholder]\n\nPrompt: ${prompt}\n\nMode: ${mode}\nDepth: ${depth}\n\nThis is a placeholder. Implement the actual Prism multi-agent reasoning logic here.`,
    usage: {
      total_tokens: 1000,
      estimated_cost: 0.03,
    },
  };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Extract token from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Try to authenticate as Supabase user first (for UI access)
    const authResult = await verifyAuth(req, supabase);
    let validatedKey: PrismAPIKey | null = null;
    let authenticatedUserId: string | null = null;

    if (authResult.user && !authResult.error) {
      // Authenticated Supabase user - use system key automatically
      authenticatedUserId = authResult.user.id;
      const systemKey = Deno.env.get('PRISM_SYSTEM_API_KEY');
      if (systemKey) {
        validatedKey = {
          key: systemKey,
          user_id: authenticatedUserId,
          rate_limit_per_hour: 100,
          daily_token_limit: 1000000,
          daily_cost_limit: 10.0,
          is_active: true,
        };
      }
    }

    // If not authenticated user, try API key validation (for external API access)
    if (!validatedKey) {
      validatedKey = await validateAPIKey(token, supabase);
    }

    if (!validatedKey || !validatedKey.is_active) {
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive API key. Please authenticate or provide a valid Prism API key.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use authenticated user ID if available, otherwise use from validated key
    if (authenticatedUserId && validatedKey.user_id !== authenticatedUserId) {
      validatedKey.user_id = authenticatedUserId;
    }

    const url = new URL(req.url);
    const path = url.pathname;

    // Route handling
    if (req.method === 'POST' && path.endsWith('/run')) {
      // Check rate limits
      const rateLimitCheck = await checkRateLimit(validatedKey, supabase);
      if (!rateLimitCheck.allowed) {
        return new Response(
          JSON.stringify({ error: rateLimitCheck.reason }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { prompt, mode = 'sequential', depth = 'synthesis', webhook_url } = await req.json();

      if (!prompt || typeof prompt !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Missing or invalid prompt' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (prompt.length > 50000) {
        return new Response(
          JSON.stringify({ error: 'Prompt too large. Maximum 50,000 characters.' }),
          { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!['sequential', 'parallel', 'debate'].includes(mode)) {
        return new Response(
          JSON.stringify({ error: 'Invalid mode. Must be sequential, parallel, or debate.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!['insight', 'synthesis', 'mastery'].includes(depth)) {
        return new Response(
          JSON.stringify({ error: 'Invalid depth. Must be insight, synthesis, or mastery.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Run Prism analysis
      let result;
      let errorMessage: string | null = null;
      
      try {
        result = await runPrismAnalysis(prompt, mode, depth);
      } catch (error) {
        // If analysis fails, create a failed run record
        errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorRunId = crypto.randomUUID();
        
        // Store failed run in database
        if (validatedKey.user_id) {
          await supabase.from('prism_runs').insert({
            user_id: validatedKey.user_id,
            prompt,
            mode,
            depth,
            run_id: errorRunId,
            status: 'failed',
            cycles_completed: 0,
            final_output: null,
            tokens_used: null,
            cost: null,
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
          });
        }
        
        // Re-throw to return error response
        throw error;
      }

      // Store in database
      if (validatedKey.user_id) {
        await supabase.from('prism_runs').insert({
          user_id: validatedKey.user_id,
          prompt,
          mode,
          depth,
          run_id: result.run_id,
          status: result.status,
          cycles_completed: result.cycles_completed || 0,
          final_output: result.final_output || null,
          tokens_used: result.usage?.total_tokens || null,
          cost: result.usage?.estimated_cost || null,
          error_message: result.status === 'error' ? (result.error || null) : null,
          completed_at: result.status === 'complete' || result.status === 'error' ? new Date().toISOString() : null,
        });
      }

      // Call webhook if provided
      if (webhook_url && result.status === 'complete') {
        // Fire and forget webhook call with HMAC signature
        const webhookPayload = JSON.stringify({
          event: 'run.completed',
          run_id: result.run_id,
          status: result.status,
          final_output: result.final_output,
          completed_at: new Date().toISOString(),
        });
        
        const timestamp = Date.now().toString();
        const webhookSecret = Deno.env.get('PRISM_WEBHOOK_SECRET') || '';
        
        // Generate HMAC signature if secret is configured
        let signature = '';
        if (webhookSecret) {
          const encoder = new TextEncoder();
          const keyData = encoder.encode(webhookSecret);
          const messageData = encoder.encode(`${timestamp}.${webhookPayload}`);
          const key = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
          );
          const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData);
          signature = Array.from(new Uint8Array(signatureBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        }
        
        fetch(webhook_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Prism-Signature': signature,
            'X-Prism-Timestamp': timestamp,
            'X-Prism-Version': '1.0',
          },
          body: webhookPayload,
        }).catch((err) => {
          console.error('Webhook call failed:', err);
        });
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /run/:id
    if (req.method === 'GET' && path.includes('/run/')) {
      const runId = path.split('/run/')[1];

      if (!runId) {
        return new Response(
          JSON.stringify({ error: 'Missing run ID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get from database
      const { data: run, error } = await supabase
        .from('prism_runs')
        .select('*')
        .eq('run_id', runId)
        .single();

      if (error || !run) {
        return new Response(
          JSON.stringify({ error: 'Run not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check access (user can only see their own runs, or admins can see all)
      if (validatedKey.user_id && run.user_id !== validatedKey.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', validatedKey.user_id)
          .single();

        if (profile?.role !== 'admin' && profile?.role !== 'owner') {
          return new Response(
            JSON.stringify({ error: 'Forbidden' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      return new Response(
        JSON.stringify({
          run_id: run.run_id,
          status: run.status,
          mode: run.mode,
          depth: run.depth,
          cycles_completed: run.cycles_completed,
          final_output: run.final_output,
          created_at: run.created_at,
          completed_at: run.completed_at,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /usage
    if (req.method === 'GET' && path.endsWith('/usage')) {
      if (!validatedKey.user_id) {
        return new Response(
          JSON.stringify({ error: 'Usage stats only available for user-specific keys' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: runs } = await supabase
        .from('prism_runs')
        .select('id, run_id, prompt, mode, depth, status, tokens_used, cost, created_at, completed_at')
        .eq('user_id', validatedKey.user_id)
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      const totalRequests = runs?.length || 0;
      const totalTokens = runs?.reduce((sum, r) => sum + (r.tokens_used || 0), 0) || 0;
      const totalCost = runs?.reduce((sum, r) => sum + (r.cost || 0), 0) || 0;

      // Format recent logs to match API spec
      const recentLogs = (runs || []).slice(0, 20).map((run) => ({
        run_id: run.run_id,
        prompt: run.prompt.substring(0, 100), // Truncate for logs
        mode: run.mode,
        depth: run.depth,
        status: run.status,
        tokens_used: run.tokens_used || 0,
        cost: run.cost || 0,
        created_at: run.created_at,
        completed_at: run.completed_at || undefined,
      }));

      return new Response(
        JSON.stringify({
          total_requests: totalRequests,
          total_tokens: totalTokens,
          total_cost: totalCost,
          recent_logs: recentLogs,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 404 for unknown routes
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Prism API error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

