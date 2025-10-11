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

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { action, documents, message, conversationHistory, context, type } = await req.json();

    console.log('AI Document Analysis Request:', { 
      action, 
      type,
      documentsCount: documents?.length,
      hasContext: !!context,
      contextType: context?.type,
      contextDocumentId: context?.metadata?.documentId
    });

    // If context includes a documentId, fetch and analyze that specific document
    let contextualDocuments = documents || [];
    let inferredAction = action;
    
    if (context?.metadata?.documentId) {
      console.log('Fetching document from context:', context.metadata.documentId);
      
      // Auto-detect action for document context
      if (!inferredAction || inferredAction === 'chat') {
        inferredAction = 'analyze_policy';
      }
      
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .select('id, name, kind, category, mime_type, storage_path, storage_bucket')
        .eq('id', context.metadata.documentId)
        .single();

      if (docError) {
        console.error('Error fetching document:', docError);
      } else if (docData) {
        // Try to fetch document content from storage
        const bucket = docData.storage_bucket || 'documents';
        const { data: fileData, error: storageError } = await supabase.storage
          .from(bucket)
          .download(docData.storage_path);

        let docContent = `[Document: ${docData.name}, Type: ${docData.mime_type || 'unknown'}]`;
        
        if (!storageError && fileData) {
          // For text-based documents, try to extract text
          if (docData.mime_type?.includes('text/') || docData.mime_type?.includes('json')) {
            docContent = await fileData.text();
          } else {
            docContent += '\n[Binary file - visual analysis would be needed]';
          }
        } else {
          console.error('Storage error:', storageError);
          docContent += '\n[Note: File content could not be retrieved from storage]';
        }

        contextualDocuments = [{
          name: docData.name,
          type: docData.mime_type,
          category: docData.category,
          content: docContent
        }];
      }
    }

    let systemPrompt = '';
    let userPrompt = '';

    // Handle type-based requests (for AI insights card)
    if (type === 'business_insights') {
      systemPrompt = `You are an AI business analyst for insurance agencies. Analyze the provided business metrics and generate 3-4 actionable insights. Focus on:
- Revenue opportunities (policies expiring soon, underinsured accounts)
- Risk factors (pending tasks, coverage gaps)
- Action items (follow-ups needed, renewals to prioritize)

Return insights as a JSON array with objects containing: type (opportunity|risk|action), title, description.`;
      userPrompt = message || 'Analyze the business metrics and provide actionable insights.';
    } else {
      // Use action-based prompts
      switch (inferredAction) {
        case 'compare_quotes':
          systemPrompt = `You are an expert insurance analyst. Your role is to:
1. Compare insurance quotes and contracts
2. Identify key differences in coverage, premiums, deductibles, and terms
3. Highlight coverage gaps or exclusions
4. Summarize pros and cons of each option
5. Provide clear, actionable recommendations

Be concise but thorough. Use tables when comparing numerical data.
IMPORTANT: When answering questions without verified document data, keep responses brief, direct, and to the point - no more than 2-3 sentences unless specifically asked for detail.`;
          userPrompt = message || 'Please analyze and compare these insurance documents.';
          break;

        case 'analyze_policy':
          systemPrompt = `You are an expert insurance policy analyst. Your role is to:
1. Summarize policy coverage details
2. Identify key terms, conditions, and exclusions
3. Highlight important dates (effective, expiration, renewal)
4. Extract coverage limits and deductibles
5. Flag any unusual clauses or restrictions

Present information in a clear, organized format.
IMPORTANT: When answering questions without verified document data, keep responses brief, direct, and to the point - no more than 2-3 sentences unless specifically asked for detail.`;
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
        default:
          systemPrompt = `You are an AI assistant for insurance agents. You help with:
- Answering questions about policies, quotes, and insurance concepts
- Providing guidance on insurance workflows
- Helping draft communications
- Analyzing documents when provided

CRITICAL INSTRUCTIONS:
- When answering from verified knowledge base sources, provide the full answer with source attribution
- When answering general questions WITHOUT verified sources, be BRIEF and DIRECT - use 2-3 sentences maximum
- Avoid verbose explanations unless specifically requested
- Get straight to the point - no preambles or unnecessary context`;
          userPrompt = message || 'How can I help you today?';
          break;
      }
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
    if (contextualDocuments && contextualDocuments.length > 0) {
      const docContext = contextualDocuments.map((doc: any, idx: number) => 
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

    // Call OpenAI with streaming
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
        stream: true, // Enable streaming
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    // Return the streaming response directly
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

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
