import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const { action, documents, message, conversationHistory } = await req.json();

    console.log('AI Document Analysis Request:', { action, documentsCount: documents?.length });

    let systemPrompt = '';
    let userPrompt = '';

    switch (action) {
      case 'compare_quotes':
        systemPrompt = `You are an expert insurance analyst. Your role is to:
1. Compare insurance quotes and contracts
2. Identify key differences in coverage, premiums, deductibles, and terms
3. Highlight coverage gaps or exclusions
4. Summarize pros and cons of each option
5. Provide clear, actionable recommendations

Be concise but thorough. Use tables when comparing numerical data.`;
        userPrompt = message || 'Please analyze and compare these insurance documents.';
        break;

      case 'analyze_policy':
        systemPrompt = `You are an expert insurance policy analyst. Your role is to:
1. Summarize policy coverage details
2. Identify key terms, conditions, and exclusions
3. Highlight important dates (effective, expiration, renewal)
4. Extract coverage limits and deductibles
5. Flag any unusual clauses or restrictions

Present information in a clear, organized format.`;
        userPrompt = message || 'Please analyze this policy document and provide a comprehensive summary.';
        break;

      case 'extract_info':
        systemPrompt = `You are a document information extraction specialist. Extract and structure key information from insurance documents including:
- Policy numbers
- Effective and expiration dates
- Coverage types and limits
- Premiums and deductibles
- Insured parties
- Contact information

Format as JSON where possible.`;
        userPrompt = message || 'Please extract all key information from these documents.';
        break;

      case 'chat':
        systemPrompt = `You are an AI assistant for insurance agents. You help with:
- Answering questions about policies, quotes, and insurance concepts
- Providing guidance on insurance workflows
- Helping draft communications
- Analyzing documents when provided

Be helpful, professional, and concise.`;
        userPrompt = message || 'How can I help you today?';
        break;

      default:
        throw new Error('Invalid action specified');
    }

    // Build messages array
    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history if provided
    if (conversationHistory && Array.isArray(conversationHistory)) {
      messages.push(...conversationHistory);
    }

    // Add current message with document context
    if (documents && documents.length > 0) {
      const docContext = documents.map((doc: any, idx: number) => 
        `Document ${idx + 1} (${doc.name}):\n${doc.content || 'Content not provided'}`
      ).join('\n\n---\n\n');

      messages.push({
        role: 'user',
        content: `${userPrompt}\n\nDocuments:\n${docContext}`
      });
    } else {
      messages.push({
        role: 'user',
        content: userPrompt
      });
    }

    console.log('Calling OpenAI with', messages.length, 'messages');

    // Call OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_completion_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    console.log('AI Response generated successfully');

    return new Response(
      JSON.stringify({ 
        response: aiResponse,
        model: 'gpt-4o-mini',
        tokens: data.usage 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error in ai-document-analysis:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
