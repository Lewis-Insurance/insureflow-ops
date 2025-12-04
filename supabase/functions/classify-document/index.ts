import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DocumentClassificationRequest {
  document_id?: string;
  document_url?: string;
  file_name?: string;
  extracted_text?: string;
}

interface ClassificationResult {
  document_type: DocumentType;
  line_of_business?: LineOfBusiness;
  urgency_level: UrgencyLevel;
  required_actions: string[];
  confidence_score: number;
  suggested_tags: string[];
  related_entity_type?: 'account' | 'policy' | 'quote' | 'claim';
  metadata: Record<string, any>;
}

type DocumentType =
  | 'policy'
  | 'quote'
  | 'dec_page'
  | 'endorsement'
  | 'claim_form'
  | 'coi'
  | 'bill'
  | 'loss_run'
  | 'application'
  | 'renewal'
  | 'cancellation'
  | 'binder'
  | 'certificate'
  | 'inspection'
  | 'unknown';

type LineOfBusiness =
  | 'auto'
  | 'home'
  | 'commercial'
  | 'workers_comp'
  | 'general_liability'
  | 'professional_liability'
  | 'cyber'
  | 'umbrella'
  | 'property'
  | 'unknown';

type UrgencyLevel = 'immediate' | 'high' | 'normal' | 'low';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const requestData: DocumentClassificationRequest = await req.json();
    const { document_id, document_url, file_name, extracted_text } = requestData;

    if (!document_id && !document_url && !extracted_text) {
      throw new Error('document_id, document_url, or extracted_text is required');
    }

    let textContent = extracted_text || '';
    let fileName = file_name || '';

    // If document_id provided, fetch from database
    if (document_id && !extracted_text) {
      const { data: docData, error: docError } = await supabaseClient
        .from('documents')
        .select('file_name, extracted_text, file_path')
        .eq('id', document_id)
        .single();

      if (docError) throw docError;

      fileName = docData.file_name;
      textContent = docData.extracted_text || '';
    }

    // Classify the document
    const classification = classifyDocument(textContent, fileName);

    // If document_id provided, update the document record
    if (document_id) {
      const updateData = {
        document_type: classification.document_type,
        line_of_business: classification.line_of_business,
        urgency_level: classification.urgency_level,
        tags: classification.suggested_tags,
        metadata: {
          ...classification.metadata,
          classification_confidence: classification.confidence_score,
          classified_at: new Date().toISOString(),
        },
      };

      const { error: updateError } = await supabaseClient
        .from('documents')
        .update(updateData)
        .eq('id', document_id);

      if (updateError) console.error('Error updating document:', updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        classification,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: unknown) {
    console.error('Error in classify-document:', error);
    return new Response(
      JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

function classifyDocument(text: string, fileName: string): ClassificationResult {
  const textLower = text.toLowerCase();
  const fileNameLower = fileName.toLowerCase();

  // Initialize result
  const result: ClassificationResult = {
    document_type: 'unknown',
    urgency_level: 'normal',
    required_actions: [],
    confidence_score: 0,
    suggested_tags: [],
    metadata: {},
  };

  // Document Type Classification
  const documentTypePatterns: Record<DocumentType, RegExp[]> = {
    policy: [
      /policy\s+number/i,
      /insurance\s+policy/i,
      /policyholder/i,
      /declarations\s+page/i,
      /coverage\s+summary/i,
    ],
    dec_page: [
      /declarations\s+page/i,
      /dec\s+page/i,
      /declaration\s+sheet/i,
      /policy\s+declarations/i,
    ],
    quote: [
      /quote\s+number/i,
      /premium\s+quote/i,
      /estimated\s+premium/i,
      /quote\s+summary/i,
      /proposed\s+premium/i,
    ],
    endorsement: [
      /endorsement/i,
      /policy\s+change/i,
      /amendment/i,
      /modification/i,
    ],
    claim_form: [
      /claim\s+number/i,
      /loss\s+notice/i,
      /accident\s+report/i,
      /claim\s+form/i,
      /notice\s+of\s+loss/i,
    ],
    coi: [
      /certificate\s+of\s+insurance/i,
      /evidence\s+of\s+insurance/i,
      /cert\s+holder/i,
      /additional\s+insured/i,
    ],
    bill: [
      /invoice/i,
      /bill\s+due/i,
      /amount\s+due/i,
      /payment\s+due/i,
      /premium\s+due/i,
      /billing\s+statement/i,
    ],
    loss_run: [
      /loss\s+run/i,
      /loss\s+history/i,
      /claims\s+history/i,
      /loss\s+experience/i,
    ],
    application: [
      /insurance\s+application/i,
      /application\s+for\s+insurance/i,
      /new\s+business\s+application/i,
      /applicant/i,
    ],
    renewal: [
      /renewal/i,
      /policy\s+renewal/i,
      /renewal\s+offer/i,
      /expiration\s+date/i,
    ],
    cancellation: [
      /cancellation/i,
      /notice\s+of\s+cancellation/i,
      /cancel\s+policy/i,
      /termination/i,
    ],
    binder: [
      /binder/i,
      /insurance\s+binder/i,
      /temporary\s+coverage/i,
    ],
    certificate: [
      /certificate/i,
      /cert\s+of\s+liability/i,
    ],
    inspection: [
      /inspection\s+report/i,
      /risk\s+inspection/i,
      /underwriting\s+inspection/i,
    ],
    unknown: [],
  };

  // Score each document type
  let maxScore = 0;
  let detectedType: DocumentType = 'unknown';

  for (const [type, patterns] of Object.entries(documentTypePatterns)) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(textLower)) score += 1;
      if (pattern.test(fileNameLower)) score += 0.5;
    }

    if (score > maxScore) {
      maxScore = score;
      detectedType = type as DocumentType;
    }
  }

  result.document_type = detectedType;
  result.confidence_score = Math.min((maxScore / 3) * 100, 100);

  // Line of Business Classification
  const lobPatterns: Record<LineOfBusiness, RegExp[]> = {
    auto: [/auto/i, /vehicle/i, /automobile/i, /motor/i],
    home: [/homeowners/i, /home\s+insurance/i, /dwelling/i, /ho-3/i, /ho-5/i],
    commercial: [
      /commercial/i,
      /business/i,
      /general\s+liability/i,
      /cgl/i,
    ],
    workers_comp: [
      /workers\s+comp/i,
      /workers\s+compensation/i,
      /wc\s+policy/i,
      /employee\s+injury/i,
    ],
    general_liability: [/general\s+liability/i, /gl\s+policy/i, /cgl/i],
    professional_liability: [
      /professional\s+liability/i,
      /errors\s+and\s+omissions/i,
      /e&o/i,
    ],
    cyber: [/cyber/i, /data\s+breach/i, /cybersecurity/i],
    umbrella: [/umbrella/i, /excess\s+liability/i],
    property: [/property/i, /building/i, /commercial\s+property/i],
    unknown: [],
  };

  let maxLobScore = 0;
  let detectedLob: LineOfBusiness = 'unknown';

  for (const [lob, patterns] of Object.entries(lobPatterns)) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(textLower)) score += 1;
    }

    if (score > maxLobScore) {
      maxLobScore = score;
      detectedLob = lob as LineOfBusiness;
    }
  }

  if (maxLobScore > 0) {
    result.line_of_business = detectedLob;
  }

  // Urgency Level Classification
  if (
    /cancellation/i.test(textLower) ||
    /urgent/i.test(textLower) ||
    /immediate/i.test(textLower) ||
    /action\s+required/i.test(textLower)
  ) {
    result.urgency_level = 'immediate';
  } else if (
    /renewal/i.test(textLower) ||
    /expiring/i.test(textLower) ||
    /due\s+date/i.test(textLower)
  ) {
    result.urgency_level = 'high';
  } else if (/claim/i.test(textLower) || /bill/i.test(textLower)) {
    result.urgency_level = 'high';
  } else {
    result.urgency_level = 'normal';
  }

  // Required Actions
  switch (result.document_type) {
    case 'claim_form':
      result.required_actions = ['Review claim', 'Notify carrier', 'Document in system'];
      break;
    case 'cancellation':
      result.required_actions = ['Contact customer', 'Review reason', 'Attempt retention'];
      break;
    case 'renewal':
      result.required_actions = ['Review coverage', 'Get quotes', 'Contact customer'];
      break;
    case 'bill':
      result.required_actions = ['Process payment', 'Update account'];
      break;
    case 'quote':
      result.required_actions = ['Review quote', 'Compare with others', 'Present to customer'];
      break;
    case 'coi':
      result.required_actions = ['Verify coverage', 'Send to cert holder'];
      break;
    default:
      result.required_actions = ['Review document', 'File appropriately'];
  }

  // Suggested Tags
  result.suggested_tags = [];

  if (result.document_type !== 'unknown') {
    result.suggested_tags.push(result.document_type);
  }

  if (result.line_of_business && result.line_of_business !== 'unknown') {
    result.suggested_tags.push(result.line_of_business);
  }

  result.suggested_tags.push(result.urgency_level);

  // Extract metadata
  result.metadata = {
    has_policy_number: /policy\s*#?\s*:?\s*\d+/i.test(textLower),
    has_claim_number: /claim\s*#?\s*:?\s*\d+/i.test(textLower),
    has_quote_number: /quote\s*#?\s*:?\s*\d+/i.test(textLower),
    has_premium_amount: /premium\s*:?\s*\$?[\d,]+/i.test(textLower),
    has_effective_date: /effective\s+date/i.test(textLower),
    has_expiration_date: /expiration\s+date/i.test(textLower),
    word_count: text.split(/\s+/).length,
    file_name: fileName,
  };

  // Related Entity Type
  if (result.metadata.has_policy_number) {
    result.related_entity_type = 'policy';
  } else if (result.metadata.has_quote_number) {
    result.related_entity_type = 'quote';
  } else if (result.metadata.has_claim_number) {
    result.related_entity_type = 'claim';
  }

  return result;
}
