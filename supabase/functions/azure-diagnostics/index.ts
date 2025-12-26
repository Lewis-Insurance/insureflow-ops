import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult; // Return 401 if auth failed
    }
    const authenticatedUser = authResult;

    const results: {
      env_check: Record<string, any>;
      tests: Record<string, any>;
      summary: { all_tests_passed: boolean; failed_tests: string[] };
    } = {
      env_check: {},
      tests: {},
      summary: { all_tests_passed: false, failed_tests: [] }
    };

    // Check environment variables
    const envVars = {
      'AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT': Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT'),
      'AZURE_DOCUMENT_INTELLIGENCE_KEY': Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY'),
      'AZURE_OPENAI_ENDPOINT': Deno.env.get('AZURE_OPENAI_ENDPOINT'),
      'AZURE_OPENAI_KEY': Deno.env.get('AZURE_OPENAI_KEY'),
      'AZURE_OPENAI_DEPLOYMENT_NAME': Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME'),
    };

    for (const [key, value] of Object.entries(envVars)) {
      results.env_check[key] = {
        configured: !!value,
        value: value ? `${value.substring(0, 10)}...` : null
      };
    }

    // Test 1: Azure Document Intelligence Connection
    if (envVars.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && envVars.AZURE_DOCUMENT_INTELLIGENCE_KEY) {
      try {
        const endpoint = envVars.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT.replace(/\/$/, '');
        const response = await fetch(`${endpoint}/documentintelligence/documentModels?api-version=2024-02-29-preview`, {
          method: 'GET',
          headers: {
            'Ocp-Apim-Subscription-Key': envVars.AZURE_DOCUMENT_INTELLIGENCE_KEY,
          },
        });

        results.tests['document_intelligence_connection'] = {
          success: response.ok,
          status: response.status,
          error: response.ok ? null : `Status ${response.status}: ${await response.text()}`,
        };
      } catch (error: any) {
        results.tests['document_intelligence_connection'] = {
          success: false,
          error: (error instanceof Error ? error.message : String(error)),
        };
      }
    } else {
      results.tests['document_intelligence_connection'] = {
        success: false,
        error: 'Missing Azure Document Intelligence credentials',
      };
    }

    // Test 2: Azure OpenAI Connection
    if (envVars.AZURE_OPENAI_ENDPOINT && envVars.AZURE_OPENAI_KEY && envVars.AZURE_OPENAI_DEPLOYMENT_NAME) {
      try {
        const endpoint = envVars.AZURE_OPENAI_ENDPOINT.replace(/\/$/, '');
        const deploymentName = envVars.AZURE_OPENAI_DEPLOYMENT_NAME;
        
        const response = await fetch(
          `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': envVars.AZURE_OPENAI_KEY,
            },
            body: JSON.stringify({
              messages: [{ role: 'user', content: 'test' }],
              max_tokens: 5,
            }),
          }
        );

        results.tests['azure_openai_connection'] = {
          success: response.ok,
          status: response.status,
          error: response.ok ? null : `Status ${response.status}: ${await response.text()}`,
        };
      } catch (error: any) {
        results.tests['azure_openai_connection'] = {
          success: false,
          error: (error instanceof Error ? error.message : String(error)),
        };
      }
    } else {
      results.tests['azure_openai_connection'] = {
        success: false,
        error: 'Missing Azure OpenAI credentials',
      };
    }

    // Test 3: Supabase Connection
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      if (supabaseUrl) {
        results.tests['supabase_connection'] = {
          success: true,
          details: { url: supabaseUrl },
        };
      } else {
        results.tests['supabase_connection'] = {
          success: false,
          error: 'SUPABASE_URL not found',
        };
      }
    } catch (error: any) {
      results.tests['supabase_connection'] = {
        success: false,
        error: (error instanceof Error ? error.message : String(error)),
      };
    }

    // Summary
    const failedTests = Object.entries(results.tests)
      .filter(([_, test]: [string, any]) => !test.success)
      .map(([name, _]) => name);

    results.summary = {
      all_tests_passed: failedTests.length === 0,
      failed_tests: failedTests,
      total_tests: Object.keys(results.tests).length,
    };

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Diagnostics error:', error);
    return new Response(
      JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
