import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      tests: {}
    };

    // Test 1: Environment Variables
    console.log('[Test 1] Checking environment variables...');
    diagnostics.tests.env_vars = {
      AZURE_DOC_ENDPOINT: !!Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT'),
      AZURE_DOC_KEY: !!Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY'),
      AZURE_OPENAI_ENDPOINT: !!Deno.env.get('AZURE_OPENAI_ENDPOINT'),
      AZURE_OPENAI_KEY: !!Deno.env.get('AZURE_OPENAI_KEY'),
      AZURE_OPENAI_DEPLOYMENT: !!Deno.env.get('AZURE_OPENAI_DEPLOYMENT'),
      SUPABASE_URL: !!Deno.env.get('SUPABASE_URL'),
      SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    };

    // Test 2: Azure Document Intelligence Connectivity
    console.log('[Test 2] Testing Azure Document Intelligence...');
    const azureDocEndpoint = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const azureDocKey = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');

    if (azureDocEndpoint && azureDocKey) {
      try {
        // Test with a minimal request
        const testUrl = `${azureDocEndpoint}/formrecognizer/documentModels/prebuilt-read?api-version=2023-07-31`;
        
        const testResponse = await fetch(testUrl, {
          method: 'GET',
          headers: {
            'Ocp-Apim-Subscription-Key': azureDocKey,
          }
        });

        diagnostics.tests.azure_doc_intelligence = {
          status: testResponse.status,
          statusText: testResponse.statusText,
          success: testResponse.status === 200 || testResponse.status === 405, // 405 means endpoint exists but wrong method
          endpoint: azureDocEndpoint.substring(0, 30) + '...',
        };

        if (!testResponse.ok && testResponse.status !== 405) {
          const errorText = await testResponse.text();
          diagnostics.tests.azure_doc_intelligence.error = errorText.substring(0, 500);
        }
      } catch (error) {
        diagnostics.tests.azure_doc_intelligence = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    } else {
      diagnostics.tests.azure_doc_intelligence = {
        success: false,
        error: 'Missing credentials'
      };
    }

    // Test 3: Azure OpenAI Connectivity
    console.log('[Test 3] Testing Azure OpenAI...');
    const azureOpenAIEndpoint = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const azureOpenAIKey = Deno.env.get('AZURE_OPENAI_KEY');
    const azureOpenAIDeployment = Deno.env.get('AZURE_OPENAI_DEPLOYMENT') || 'gpt-4';

    if (azureOpenAIEndpoint && azureOpenAIKey) {
      try {
        const openaiUrl = `${azureOpenAIEndpoint}/openai/deployments/${azureOpenAIDeployment}/chat/completions?api-version=2024-02-15-preview`;
        
        const openaiResponse = await fetch(openaiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': azureOpenAIKey,
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'test' }],
            max_tokens: 5
          })
        });

        diagnostics.tests.azure_openai = {
          status: openaiResponse.status,
          statusText: openaiResponse.statusText,
          success: openaiResponse.ok,
          endpoint: azureOpenAIEndpoint.substring(0, 30) + '...',
          deployment: azureOpenAIDeployment
        };

        if (!openaiResponse.ok) {
          const errorText = await openaiResponse.text();
          diagnostics.tests.azure_openai.error = errorText.substring(0, 500);
        }
      } catch (error) {
        diagnostics.tests.azure_openai = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    } else {
      diagnostics.tests.azure_openai = {
        success: false,
        error: 'Missing credentials'
      };
    }

    // Test 4: Supabase Connection
    console.log('[Test 4] Testing Supabase connection...');
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const { data, error } = await supabase
        .from('document_analysis')
        .select('id')
        .limit(1);

      diagnostics.tests.supabase = {
        success: !error,
        error: error?.message
      };
    } catch (error) {
      diagnostics.tests.supabase = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Summary
    diagnostics.summary = {
      all_tests_passed: Object.values(diagnostics.tests).every((test: any) => test.success !== false),
      failed_tests: Object.entries(diagnostics.tests)
        .filter(([_, test]: any) => test.success === false)
        .map(([name]) => name)
    };

    console.log('[Diagnostics Complete]', JSON.stringify(diagnostics, null, 2));

    return new Response(
      JSON.stringify(diagnostics, null, 2),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('[Diagnostics Error]', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, null, 2),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
