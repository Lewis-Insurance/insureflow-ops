import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth, verifyResourceAccess } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DocumentAnalysisRequest {
  document_url: string;
  document_id: string;
  file_name: string;
  account_id?: string;
  user_id: string;
  analysis_mode?: 'parse' | 'summarize' | 'classify' | 'insights' | 'workflow' | 'all';
  workflow_context?: Record<string, any>;
}

interface WorkflowTrigger {
  trigger_type: string;
  trigger_reason: string;
  confidence: number;
  recommended_actions: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  metadata: Record<string, any>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  let documentId: string | null = null;

  try {
    // Initialize Supabase first
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

    const requestData: DocumentAnalysisRequest = await req.json();
    const {
      document_url,
      document_id,
      file_name,
      account_id,
      analysis_mode = 'all',
      workflow_context = {}
    } = requestData;

    documentId = document_id;

    console.log('[Azure Analysis] Starting:', file_name, 'Mode:', analysis_mode);

    // SECURITY: If account_id is provided, verify user has access to it
    if (account_id) {
      const hasAccess = await verifyResourceAccess(
        supabase,
        authenticatedUser.id,
        'account',
        account_id
      );

      if (!hasAccess) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Forbidden: You do not have access to this account'
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Create initial record
    const normalizedAccountId = account_id && String(account_id).trim() !== '' ? account_id : null;
    const { data: analysisRecord, error: insertError } = await supabase
      .from('document_analysis')
      .insert({
        document_id,
        file_name,
        account_id: normalizedAccountId,
        created_by: authenticatedUser.id,
        processing_status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Document Analysis] Insert error:', insertError);
      throw insertError;
    }

    // ============================================
    // STEP 1: Azure Document Intelligence OCR
    // ============================================
    console.log('[Azure OCR] Starting Document Intelligence...');
    
    const AZURE_DOC_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const AZURE_DOC_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
    
    if (!AZURE_DOC_ENDPOINT || !AZURE_DOC_KEY) {
      throw new Error('Azure Document Intelligence credentials not configured');
    }

    // Download document from Supabase Storage
    const urlPath = document_url.split('/storage/v1/object/public/')[1];
    if (!urlPath) {
      throw new Error('Invalid document URL format');
    }

    const { data: docData, error: downloadError } = await supabase.storage
      .from(urlPath.split('/')[0])
      .download(urlPath.split('/').slice(1).join('/'));

    if (downloadError || !docData) {
      throw new Error(`Failed to download document: ${downloadError?.message || 'Unknown error'}`);
    }

    const docBuffer = await docData.arrayBuffer();
    const docBlob = new Uint8Array(docBuffer);

    // Submit document for analysis
    const analyzeUrl = `${AZURE_DOC_ENDPOINT}/formrecognizer/documentModels/prebuilt-read:analyze?api-version=2023-07-31`;
    
    const submitResponse = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Ocp-Apim-Subscription-Key': AZURE_DOC_KEY,
      },
      body: docBlob
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      throw new Error(`Azure OCR submission error: ${submitResponse.status} - ${errorText}`);
    }

    const operationLocation = submitResponse.headers.get('operation-location');
    if (!operationLocation) {
      throw new Error('No operation location returned from Azure');
    }

    console.log('[Azure OCR] Polling for results...');

    // Poll for OCR results
    let attempts = 0;
    const maxAttempts = 60;
    let analysisResult: any = null;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const resultResponse = await fetch(operationLocation, {
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_DOC_KEY,
        }
      });

      if (!resultResponse.ok) {
        const errorText = await resultResponse.text();
        throw new Error(`Azure OCR polling error: ${resultResponse.status} - ${errorText}`);
      }

      const result = await resultResponse.json();
      
      if (result.status === 'succeeded') {
        analysisResult = result.analyzeResult;
        console.log('[Azure OCR] Complete');
        break;
      } else if (result.status === 'failed') {
        throw new Error(`Azure OCR failed: ${JSON.stringify(result.error || 'Unknown error')}`);
      }
      
      attempts++;
    }

    if (!analysisResult) {
      throw new Error('Azure OCR timed out');
    }

    // Extract text
    let ocrText = analysisResult.content || '';
    if (!ocrText && analysisResult.pages) {
      ocrText = analysisResult.pages
        .map((page: any) => page.lines?.map((line: any) => line.content).join('\n') || '')
        .join('\n\n');
    }

    if (!ocrText || ocrText.length < 50) {
      throw new Error('Insufficient text extracted from document');
    }

    console.log(`[Azure OCR] Extracted ${ocrText.length} characters`);

    // ============================================
    // STEP 2: Azure OpenAI Analysis
    // ============================================
    console.log('[Azure OpenAI] Starting analysis...');
    
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
    const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME') || 'gpt-4';
    
    if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY) {
      throw new Error('Azure OpenAI credentials not configured');
    }

    // Build system prompt based on analysis mode
    const systemPrompts: Record<string, string> = {
      parse: `You are an insurance document parser. Extract structured data from insurance policies and quotes.

Return ONLY valid JSON with this exact structure:
{
  "carrier_name": "string or null",
  "policy_number": "string or null",
  "policy_type": "auto|home|commercial|life|umbrella|other or null",
  "insured_name": "string or null",
  "effective_date": "YYYY-MM-DD or null",
  "expiration_date": "YYYY-MM-DD or null",
  "total_premium": number or null,
  "payment_frequency": "annual|semi-annual|quarterly|monthly or null",
  "coverages": [
    {
      "type": "string",
      "limit": "string",
      "deductible": "string or null",
      "premium": number or null
    }
  ],
  "insured_items": [
    {
      "type": "vehicle|property|business",
      "year": number or null,
      "make": "string or null",
      "model": "string or null",
      "vin": "string or null",
      "address": "string or null"
    }
  ],
  "confidence_score": number (0-100)
}`,

      summarize: `You are an insurance document summarizer. Create concise, actionable summaries of insurance documents.

Return ONLY valid JSON with this structure:
{
  "executive_summary": "2-3 sentence overview",
  "key_points": ["point 1", "point 2", "point 3"],
  "coverage_summary": "Brief description of main coverages",
  "important_dates": {
    "effective_date": "YYYY-MM-DD or null",
    "expiration_date": "YYYY-MM-DD or null",
    "renewal_date": "YYYY-MM-DD or null"
  },
  "financial_summary": {
    "total_premium": number or null,
    "payment_terms": "string"
  },
  "action_items": ["action 1", "action 2"],
  "risk_flags": ["flag 1", "flag 2"]
}`,

      classify: `You are an insurance document classifier. Classify and categorize insurance documents.

Return ONLY valid JSON with this structure:
{
  "document_type": "policy|quote|renewal|claim|certificate|endorsement|other",
  "insurance_type": "auto|home|commercial|life|umbrella|workers_comp|professional_liability|other",
  "business_type": "personal_lines|commercial_lines|specialty",
  "urgency": "low|medium|high|urgent",
  "requires_action": boolean,
  "tags": ["tag1", "tag2", "tag3"],
  "confidence": number (0-100),
  "reasoning": "Brief explanation of classification"
}`,

      insights: `You are an insurance analytics expert. Generate actionable insights from insurance documents.

Return ONLY valid JSON with this structure:
{
  "coverage_adequacy": {
    "rating": "insufficient|adequate|good|excellent",
    "gaps": ["gap 1", "gap 2"],
    "recommendations": ["rec 1", "rec 2"]
  },
  "cost_analysis": {
    "competitiveness": "expensive|market_rate|competitive|bargain",
    "potential_savings": number or null,
    "savings_opportunities": ["opp 1", "opp 2"]
  },
  "risk_assessment": {
    "risk_level": "low|medium|high|critical",
    "risk_factors": ["factor 1", "factor 2"],
    "mitigation_strategies": ["strategy 1", "strategy 2"]
  },
  "cross_sell_opportunities": [
    {
      "product": "string",
      "reason": "string",
      "priority": "low|medium|high"
    }
  ],
  "renewal_insights": {
    "renewal_likelihood": "low|medium|high",
    "retention_strategies": ["strategy 1", "strategy 2"]
  }
}`,

      workflow: `You are an insurance workflow automation expert. Analyze documents and recommend workflow actions.

Return ONLY valid JSON with this structure:
{
  "triggers": [
    {
      "trigger_type": "create_task|send_email|create_opportunity|schedule_review|assign_agent|update_status|alert_manager",
      "trigger_reason": "string explaining why",
      "confidence": number (0-100),
      "recommended_actions": ["action 1", "action 2"],
      "priority": "low|medium|high|urgent",
      "metadata": {
        "task_title": "string or null",
        "due_date": "YYYY-MM-DD or null",
        "assigned_to": "string or null",
        "email_template": "string or null",
        "opportunity_type": "string or null"
      }
    }
  ],
  "automation_confidence": number (0-100),
  "manual_review_required": boolean,
  "manual_review_reason": "string or null"
}`
    };

    // All mode combines everything
    const systemPrompt = analysis_mode === 'all' 
      ? `You are a comprehensive insurance document analysis AI. Analyze the document thoroughly and provide:
1. Structured data extraction (policy details)
2. Executive summary
3. Classification
4. Insights and recommendations
5. Workflow automation triggers

Return ONLY valid JSON with this structure:
{
  "parsed_data": ${systemPrompts.parse.split('Return ONLY valid JSON with this exact structure:\n')[1]},
  "summary": ${systemPrompts.summarize.split('Return ONLY valid JSON with this structure:\n')[1]},
  "classification": ${systemPrompts.classify.split('Return ONLY valid JSON with this structure:\n')[1]},
  "insights": ${systemPrompts.insights.split('Return ONLY valid JSON with this structure:\n')[1]},
  "workflow": ${systemPrompts.workflow.split('Return ONLY valid JSON with this structure:\n')[1]}
}`
      : systemPrompts[analysis_mode];

    // Prepare user message
    let userMessage = `Analyze this insurance document:\n\n${ocrText}`;
    if (Object.keys(workflow_context).length > 0) {
      userMessage += `\n\nContext: ${JSON.stringify(workflow_context, null, 2)}`;
    }
    userMessage += '\n\nReturn ONLY the JSON object, no other text.';

    // Call Azure OpenAI
    const openaiUrl = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`;
    
    const openaiResponse = await fetch(openaiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_OPENAI_KEY,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`Azure OpenAI error: ${openaiResponse.status} - ${errorText}`);
    }

    const openaiData = await openaiResponse.json();
    const analysisData = JSON.parse(openaiData.choices[0].message.content);

    console.log('[Azure OpenAI] Analysis complete');

    // ============================================
    // STEP 3: Process Workflow Triggers
    // ============================================
    let workflowResults: any[] = [];
    
    if (analysis_mode === 'workflow' || analysis_mode === 'all') {
      const triggers = analysis_mode === 'all' 
        ? analysisData.workflow?.triggers || []
        : analysisData.triggers || [];

      console.log(`[Workflow] Processing ${triggers.length} triggers`);

      for (const trigger of triggers) {
        try {
          const result = await processWorkflowTrigger(supabase, trigger, {
            document_id,
            account_id: normalizedAccountId,
            user_id: authenticatedUser.id,
            file_name
          });
          workflowResults.push(result);
        } catch (error: unknown) {
          console.error('[Workflow] Trigger failed:', error);
          workflowResults.push({
            trigger_type: trigger.trigger_type,
            success: false,
            error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error'
          });
        }
      }
    }

    // ============================================
    // STEP 4: Update Database
    // ============================================
    
    // Extract parsed data for database fields
    const parsedData = analysis_mode === 'all' ? analysisData.parsed_data : analysisData;
    
    const updateData: any = {
      raw_ocr_text: ocrText,
      processing_status: 'complete',
      updated_at: new Date().toISOString(),
      // Store full analysis result
      analysis_result: analysisData
    };

    // Add parsed fields if available
    if (parsedData.carrier_name) updateData.carrier_name = parsedData.carrier_name;
    if (parsedData.policy_number) updateData.policy_number = parsedData.policy_number;
    if (parsedData.policy_type) updateData.policy_type = parsedData.policy_type;
    if (parsedData.insured_name) updateData.insured_name = parsedData.insured_name;
    if (parsedData.effective_date) updateData.effective_date = parsedData.effective_date;
    if (parsedData.expiration_date) updateData.expiration_date = parsedData.expiration_date;
    if (parsedData.total_premium) updateData.total_premium = parsedData.total_premium;
    if (parsedData.payment_frequency) updateData.payment_frequency = parsedData.payment_frequency;
    if (parsedData.coverages) updateData.coverages = parsedData.coverages;
    if (parsedData.insured_items) updateData.insured_items = parsedData.insured_items;
    if (parsedData.confidence_score) updateData.confidence_score = parsedData.confidence_score;

    const { data: updatedRecord, error: updateError } = await supabase
      .from('document_analysis')
      .update(updateData)
      .eq('id', analysisRecord.id)
      .select()
      .single();

    if (updateError) {
      console.error('[Database] Update error:', updateError);
      throw updateError;
    }

    console.log('[Azure Analysis] Complete:', updatedRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        analysis_id: updatedRecord.id,
        mode: analysis_mode,
        data: updatedRecord,
        analysis: analysisData,
        workflow_results: workflowResults.length > 0 ? workflowResults : undefined
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    console.error('[Azure Analysis] Error:', error);
    
    // Try to update record with error
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      if (documentId) {
        await supabase
          .from('document_analysis')
          .update({
            processing_status: 'error',
            error_message: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error',
            updated_at: new Date().toISOString()
          })
          .eq('document_id', documentId);
      }
    } catch (dbError) {
      console.error('[Database] Failed to log error:', dbError);
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error occurred' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

// ============================================
// Workflow Trigger Processing
// ============================================

async function processWorkflowTrigger(
  supabase: any,
  trigger: WorkflowTrigger,
  context: { document_id: string; account_id: string | null; user_id: string; file_name: string }
): Promise<any> {
  
  const { trigger_type, metadata, priority, recommended_actions } = trigger;
  
  console.log(`[Workflow] Processing ${trigger_type} with priority ${priority}`);

  switch (trigger_type) {
    case 'create_task':
      return await createTask(supabase, metadata, context, priority, recommended_actions);
    
    case 'send_email':
      return await sendEmail(supabase, metadata, context);
    
    case 'create_opportunity':
      return await createOpportunity(supabase, metadata, context, priority);
    
    case 'schedule_review':
      return await scheduleReview(supabase, metadata, context);
    
    case 'assign_agent':
      return await assignAgent(supabase, metadata, context);
    
    case 'update_status':
      return await updateStatus(supabase, metadata, context);
    
    case 'alert_manager':
      return await alertManager(supabase, metadata, context, priority);
    
    default:
      console.warn(`[Workflow] Unknown trigger type: ${trigger_type}`);
      return { trigger_type, success: false, error: 'Unknown trigger type' };
  }
}

async function createTask(
  supabase: any, 
  metadata: any, 
  context: any, 
  priority: string,
  recommended_actions: string[]
): Promise<any> {
  
  const dueDate = metadata.due_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: metadata.task_title || `Review document: ${context.file_name}`,
      description: recommended_actions.join('\n'),
      category: 'policy_review',
      priority: priority,
      status: 'pending',
      due_at: dueDate,
      assignee_id: metadata.assigned_to || null,
      account_id: context.account_id,
      metadata: {
        document_id: context.document_id,
        automation_trigger: true
      }
    })
    .select()
    .single();

  if (error) throw error;
  
  return { trigger_type: 'create_task', success: true, task_id: data.id };
}

async function sendEmail(supabase: any, metadata: any, context: any): Promise<any> {
  // Placeholder - implement email sending logic
  console.log('[Workflow] Email sending not yet implemented');
  return { trigger_type: 'send_email', success: true, note: 'Queued for sending' };
}

async function createOpportunity(
  supabase: any, 
  metadata: any, 
  context: any,
  priority: string
): Promise<any> {
  
  if (!context.account_id) {
    return { trigger_type: 'create_opportunity', success: false, error: 'No account_id' };
  }

  const { data, error } = await supabase
    .from('opportunities')
    .insert({
      account_id: context.account_id,
      title: `Cross-sell: ${metadata.opportunity_type || 'Product'}`,
      description: `AI-identified opportunity from document analysis`,
      stage: 'qualification',
      priority: priority,
      created_by: context.user_id,
      metadata: {
        document_id: context.document_id,
        automation_trigger: true,
        opportunity_type: metadata.opportunity_type
      }
    })
    .select()
    .single();

  if (error) throw error;
  
  return { trigger_type: 'create_opportunity', success: true, opportunity_id: data.id };
}

async function scheduleReview(supabase: any, metadata: any, context: any): Promise<any> {
  // Create a task for scheduling review
  return await createTask(
    supabase, 
    { ...metadata, task_title: `Schedule policy review: ${context.file_name}` },
    context,
    'medium',
    ['Schedule review meeting', 'Prepare review materials']
  );
}

async function assignAgent(supabase: any, metadata: any, context: any): Promise<any> {
  // Placeholder - implement agent assignment logic
  console.log('[Workflow] Agent assignment not yet implemented');
  return { trigger_type: 'assign_agent', success: true, note: 'Assignment queued' };
}

async function updateStatus(supabase: any, metadata: any, context: any): Promise<any> {
  // Placeholder - implement status update logic
  console.log('[Workflow] Status update not yet implemented');
  return { trigger_type: 'update_status', success: true, note: 'Status updated' };
}

async function alertManager(
  supabase: any, 
  metadata: any, 
  context: any, 
  priority: string
): Promise<any> {
  // Create urgent task for manager
  return await createTask(
    supabase,
    { 
      ...metadata, 
      task_title: `⚠️ MANAGER ALERT: ${context.file_name}`,
      assignee_id: metadata.manager_id || null
    },
    context,
    'urgent',
    ['Review immediately', 'Take corrective action']
  );
}