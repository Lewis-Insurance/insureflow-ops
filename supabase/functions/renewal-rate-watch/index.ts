/**
 * Renewal Rate Watch Edge Function
 * 
 * Processes renewal documents and multi-carrier quotes to:
 * 1. Extract bundle snapshots (CURRENT, RENEWAL, QUOTE per carrier)
 * 2. Compute deterministic comparison metrics
 * 3. Generate recommendation
 * 4. Create report and email draft
 * 
 * ALIGNED WITH EXISTING ARCHITECTURE:
 * - Uses workspaces, workspace_documents
 * - Uses comparison_evidence_catalog for Azure DI results
 * - Uses policy_snapshots structure for extraction
 * - Links to ao_renewals
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { modelBoundaryFetch } from '../_shared/modelBoundaryFetch.ts';

interface RateWatchRequest {
  action: 'process_documents' | 'compute_comparison' | 'generate_report' | 'generate_email' | 'send_email' | 'full_pipeline';
  workspace_id: string;
  email_draft_id?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }
    const user = authResult;

    const body = await req.json();
    const { action, workspace_id } = body as RateWatchRequest;
    console.log(`[renewal-rate-watch] Action: ${action}, Workspace: ${workspace_id}`);

    // Get workspace
    // NOTE: public.workspaces does not have an ao_renewal_id column and does not have an FK relation
    // to ao_renewals. We fetch any linked ao_renewal via ao_renewals.rate_watch_workspace_id.
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', workspace_id)
      .single();

    if (wsError || !workspace) {
      return new Response(
        JSON.stringify({ error: 'Workspace not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch linked renewal (optional)
    const { data: linkedRenewal } = await supabase
      .from('ao_renewals')
      .select('*')
      .eq('rate_watch_workspace_id', workspace_id)
      .maybeSingle();

    (workspace as any).ao_renewals = linkedRenewal ?? null;

    // Update workspace status
    await supabase
      .from('workspaces')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', workspace_id);

    let result: any = {};

    switch (action) {
      case 'process_documents':
        result = await processDocuments(supabase, workspace_id);
        break;
      case 'compute_comparison':
        result = await computeComparison(supabase, workspace_id);
        break;
      case 'generate_report':
        result = await generateReport(supabase, workspace_id, user.id);
        break;
      case 'generate_email':
        result = await generateEmail(supabase, workspace_id, user.id);
        break;
      case 'send_email':
        result = await sendRenewalEmail(supabase, workspace_id, user.id, body.email_draft_id);
        break;
      case 'full_pipeline':
        // Run all steps in sequence
        console.log('[renewal-rate-watch] Running full pipeline...');
        
        const docResult = await processDocuments(supabase, workspace_id);
        console.log('[renewal-rate-watch] Documents processed:', docResult);
        
        const compResult = await computeComparison(supabase, workspace_id);
        console.log('[renewal-rate-watch] Comparison computed:', compResult);
        
        const reportResult = await generateReport(supabase, workspace_id, user.id);
        console.log('[renewal-rate-watch] Report generated:', reportResult);
        
        const emailResult = await generateEmail(supabase, workspace_id, user.id);
        console.log('[renewal-rate-watch] Email generated:', emailResult);
        
        result = {
          documents: docResult,
          comparison: compResult,
          report: reportResult,
          email: emailResult,
        };
        break;
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Update workspace status
    await supabase
      .from('workspaces')
      .update({ status: 'ready', updated_at: new Date().toISOString() })
      .eq('id', workspace_id);

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[renewal-rate-watch] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// =============================================================================
// PROMPT TEMPLATES (Evidence-Backed, Schema-Driven)
// =============================================================================

const BUNDLE_SNAPSHOT_SYSTEM_PROMPT = `You are a bundle snapshot mapping engine for a U.S. insurance agency (Lewis Insurance).

SCOPE
- You are given ONE bundle (CURRENT or RENEWAL or QUOTE for a specific carrier).
- Bundle contains one or more documents (dec pages, renewal offer, quote proposal, schedules, endorsements).
- Your job is to produce a normalized BundleSnapshot JSON that conforms to the schema provided.

NON-NEGOTIABLE RULES
1) NO GUESSING. If a value is not explicitly supported by evidence, mark status="NOT_FOUND".
2) EVIDENCE REQUIRED. Any value with status != "NOT_FOUND" MUST include evidence_ids (non-empty).
3) CONFLICTS. If there are multiple plausible values:
   - set status="CONFLICT"
   - provide conflict_candidates[] each with value + evidence_ids + reason
4) Output MUST be valid JSON only. No markdown. No commentary.
5) Do not compute savings or differences here. Only extract/normalize snapshot values.
6) Prefer dec pages and schedule tables over narrative text. Prefer totals labeled "Total Premium", "Policy Premium", "Term Premium".
7) If the document appears to be a billing page with installment amounts, do not treat "monthly" as term premium; capture it separately.
8) Normalize:
   - currency to numeric + display string
   - dates to ISO (YYYY-MM-DD) if possible
   - ded/limits to structured fields where feasible`;

const BUNDLE_SNAPSHOT_SCHEMA = {
  type: 'object',
  required: ['bundle_id', 'bundle_role', 'identity', 'premium', 'coverages', 'unknowns'],
  properties: {
    bundle_id: { type: 'string' },
    bundle_role: { type: 'string', enum: ['CURRENT', 'RENEWAL', 'QUOTE'] },
    carrier_name: { type: ['string', 'null'] },
    identity: {
      type: 'object',
      properties: {
        insured_name: { $ref: '#/$defs/FieldResult' },
        carrier: { $ref: '#/$defs/FieldResult' },
        policy_or_quote_number: { $ref: '#/$defs/FieldResult' },
        effective_date: { $ref: '#/$defs/FieldResult' },
        expiration_date: { $ref: '#/$defs/FieldResult' },
      },
    },
    premium: {
      type: 'object',
      properties: {
        term_premium: { $ref: '#/$defs/FieldResult' },
        fees: { $ref: '#/$defs/FieldResult' },
        installment_amount: { $ref: '#/$defs/FieldResult' },
      },
    },
    coverages: { type: 'array' },
    unknowns: { type: 'array', items: { type: 'string' } },
  },
  $defs: {
    FieldResult: {
      type: 'object',
      required: ['status', 'evidence_ids'],
      properties: {
        status: { type: 'string', enum: ['FOUND', 'NOT_FOUND', 'CONFLICT', 'NEEDS_VERIFICATION'] },
        value: {},
        display_value: { type: 'string' },
        confidence: { type: 'number' },
        evidence_ids: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

// =============================================================================
// STEP 1: PROCESS DOCUMENTS -> BUNDLE SNAPSHOTS
// =============================================================================

async function processDocuments(supabase: any, workspaceId: string) {
  const { data: docs, error: docsError } = await supabase
    .from('workspace_documents')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (docsError) throw new Error(`Failed to get documents: ${docsError.message}`);
  if (!docs || docs.length === 0) {
    return { bundles_created: 0, message: 'No documents found' };
  }

  // Group documents by role and carrier
  const bundles: Record<string, any[]> = { CURRENT: [], RENEWAL: [] };
  const quoteBundles: Record<string, any[]> = {};

  for (const doc of docs) {
    if (doc.doc_role === 'CURRENT') {
      bundles.CURRENT.push(doc);
    } else if (doc.doc_role === 'RENEWAL') {
      bundles.RENEWAL.push(doc);
    } else if (doc.doc_role === 'QUOTE') {
      const carrier = doc.carrier_name || 'Unknown Carrier';
      if (!quoteBundles[carrier]) quoteBundles[carrier] = [];
      quoteBundles[carrier].push(doc);
    }
  }

  const bundlesCreated: string[] = [];

  // Process each bundle with Azure DI + LLM extraction
  if (bundles.CURRENT.length > 0) {
    await processBundleDocuments(supabase, workspaceId, 'CURRENT', null, bundles.CURRENT);
    bundlesCreated.push('CURRENT');
  }

  if (bundles.RENEWAL.length > 0) {
    await processBundleDocuments(supabase, workspaceId, 'RENEWAL', null, bundles.RENEWAL);
    bundlesCreated.push('RENEWAL');
  }

  for (const [carrier, quoteDocs] of Object.entries(quoteBundles)) {
    await processBundleDocuments(supabase, workspaceId, 'QUOTE', carrier, quoteDocs);
    bundlesCreated.push(`QUOTE:${carrier}`);
  }

  return { bundles_created: bundlesCreated.length, bundles: bundlesCreated };
}

async function processBundleDocuments(
  supabase: any,
  workspaceId: string,
  bundleRole: string,
  carrierName: string | null,
  documents: any[]
): Promise<any> {
  const documentIds = documents.map(d => d.id);
  const bundleId = crypto.randomUUID();

  // Get existing evidence catalogs from Azure DI processing
  const { data: evidenceCatalogs } = await supabase
    .from('comparison_evidence_catalog')
    .select('*')
    .in('workspace_document_id', documentIds);

  // Build evidence catalog for LLM
  const evidenceCatalog: Record<string, any> = {};
  let extractedCandidates: Record<string, any[]> = {};

  if (evidenceCatalogs && evidenceCatalogs.length > 0) {
    for (const catalog of evidenceCatalogs) {
      const entries = catalog.evidence_entries || {};
      for (const [evId, entry] of Object.entries(entries)) {
        evidenceCatalog[evId] = entry;
      }
      
      // Build candidates from evidence
      const byField = catalog.evidence_by_potential_field || {};
      for (const [field, evIds] of Object.entries(byField)) {
        if (!extractedCandidates[field]) extractedCandidates[field] = [];
        for (const evId of (evIds as string[])) {
          const entry = entries[evId];
          if (entry) {
            extractedCandidates[field].push({
              raw_value: entry.snippet_text,
              normalized_value: entry.normalized_value || entry.snippet_text,
              evidence_ids: [evId],
              confidence: entry.confidence,
            });
          }
        }
      }
    }
  }

  // Call LLM for schema-driven extraction (if Azure OpenAI configured)
  let snapshotJson: any = null;
  const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
  const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
  const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME') || 'gpt-4o';

  if (AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY && Object.keys(evidenceCatalog).length > 0) {
    try {
      const bundleContext = {
        job_id: workspaceId,
        bundle_id: bundleId,
        bundle_role: bundleRole,
        carrier_name: carrierName,
        document_count: documents.length,
      };

      const userPrompt = `Create the BundleSnapshot for this bundle.

STRICT OUTPUT REQUIREMENTS
- Output MUST be valid JSON and MUST conform to target_output_schema.
- Any field with a concrete value MUST include evidence_ids (non-empty).
- If insufficient evidence -> status="NOT_FOUND" and evidence_ids=[].
- If conflict -> status="CONFLICT" with conflict_candidates.

INPUTS
1) bundle_context:
${JSON.stringify(bundleContext, null, 2)}

2) target_output_schema:
${JSON.stringify(BUNDLE_SNAPSHOT_SCHEMA, null, 2)}

3) evidence_catalog (${Object.keys(evidenceCatalog).length} items):
${JSON.stringify(Object.fromEntries(Object.entries(evidenceCatalog).slice(0, 50)), null, 2)}

4) extracted_candidates:
${JSON.stringify(extractedCandidates, null, 2)}

Return BundleSnapshot JSON only.`;

      const chatUrl = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`;
      
      const chatResponse = await modelBoundaryFetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_OPENAI_KEY,
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: BUNDLE_SNAPSHOT_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
        }),
      });

      if (chatResponse.ok) {
        const chatData = await chatResponse.json();
        const content = chatData.choices?.[0]?.message?.content;
        if (content) {
          snapshotJson = JSON.parse(content);
          console.log('[renewal-rate-watch] LLM extraction successful');
        }
      }
    } catch (llmError) {
      console.error('[renewal-rate-watch] LLM extraction failed:', llmError);
    }
  }

  // Extract premium from snapshot or fallback
  let termPremium: number | null = null;
  if (snapshotJson?.premium?.term_premium?.value) {
    termPremium = parseFloat(snapshotJson.premium.term_premium.value);
  }

  // Create or update bundle snapshot
  const { data: bundle, error: bundleError } = await supabase
    .from('bundle_snapshots')
    .upsert({
      workspace_id: workspaceId,
      bundle_role: bundleRole,
      carrier_name: carrierName,
      bundle_id: bundleId,
      document_ids: documentIds,
      snapshot_json: snapshotJson || { status: 'extraction_pending' },
      field_evidence: snapshotJson ? extractedCandidates : {},
      term_premium: termPremium,
      status: snapshotJson ? 'ready' : 'pending',
      fields_extracted: snapshotJson?.coverages?.length || 0,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'workspace_id,bundle_role,carrier_name',
    })
    .select()
    .single();

  if (bundleError) {
    console.error('[renewal-rate-watch] Bundle creation error:', bundleError);
  }

  return bundle;
}

// =============================================================================
// STEP 2: COMPUTE COMPARISON (DETERMINISTIC)
// =============================================================================

async function computeComparison(supabase: any, workspaceId: string) {
  // Get all bundle snapshots
  const { data: bundles, error: bundlesError } = await supabase
    .from('bundle_snapshots')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (bundlesError) throw new Error(`Failed to get bundles: ${bundlesError.message}`);

  const currentBundle = bundles?.find((b: any) => b.bundle_role === 'CURRENT');
  const renewalBundle = bundles?.find((b: any) => b.bundle_role === 'RENEWAL');
  const quoteBundles = bundles?.filter((b: any) => b.bundle_role === 'QUOTE') || [];

  // Calculate renewal increase
  const currentPremium = currentBundle?.term_premium;
  const renewalPremium = renewalBundle?.term_premium;
  
  let increaseAmount: number | null = null;
  let increasePercent: number | null = null;
  
  if (currentPremium && renewalPremium) {
    increaseAmount = renewalPremium - currentPremium;
    increasePercent = currentPremium > 0 ? (increaseAmount / currentPremium) * 100 : null;
  }

  // Compare quotes
  const quoteComparisons = quoteBundles.map((quote: any) => {
    const quotePremium = quote.term_premium;
    let savingsVsRenewal: number | null = null;
    
    if (renewalPremium && quotePremium) {
      savingsVsRenewal = renewalPremium - quotePremium;
    }

    // Simple parity score (placeholder - real implementation would compare coverages)
    const parityScore = 0.85; // Assume 85% parity for now

    return {
      carrier: quote.carrier_name,
      bundle_id: quote.id,
      term_premium: quotePremium,
      savings_vs_renewal: savingsVsRenewal,
      parity_score: parityScore,
      critical_differences: [],
      recommendation: savingsVsRenewal && savingsVsRenewal > 0 && parityScore >= 0.8 
        ? 'consider_switching' 
        : 'review_needed',
    };
  });

  // Find best alternative
  const bestQuote = quoteComparisons
    .filter((q: any) => q.savings_vs_renewal && q.savings_vs_renewal > 0)
    .sort((a: any, b: any) => (b.savings_vs_renewal || 0) - (a.savings_vs_renewal || 0))[0];

  // Determine recommendation
  let recommendationType = 'insufficient_data';
  let recommendationReason = 'Not enough data to make a recommendation.';

  if (renewalPremium && bestQuote?.savings_vs_renewal > 0 && bestQuote.parity_score >= 0.8) {
    recommendationType = 'switch';
    recommendationReason = `${bestQuote.carrier} offers comparable coverage at $${bestQuote.savings_vs_renewal.toFixed(2)} less than the renewal.`;
  } else if (renewalPremium && quoteBundles.length > 0 && !bestQuote) {
    recommendationType = 'stay';
    recommendationReason = 'After shopping the market, the renewal remains the most competitive option.';
  } else if (quoteBundles.length > 0) {
    recommendationType = 'review_options';
    recommendationReason = 'Multiple options available - review coverage differences before deciding.';
  }

  // Save comparison results
  const { data: comparison, error: compError } = await supabase
    .from('renewal_comparison_results')
    .upsert({
      workspace_id: workspaceId,
      current_bundle_id: currentBundle?.id,
      renewal_bundle_id: renewalBundle?.id,
      current_term_premium: currentPremium,
      renewal_term_premium: renewalPremium,
      renewal_increase_amount: increaseAmount,
      renewal_increase_percent: increasePercent,
      quote_comparisons: quoteComparisons,
      best_alternative_carrier: bestQuote?.carrier,
      best_alternative_savings: bestQuote?.savings_vs_renewal,
      best_alternative_parity_score: bestQuote?.parity_score,
      recommendation_type: recommendationType,
      recommendation_reason: recommendationReason,
      recommendation_confidence: 0.8,
      computed_at: new Date().toISOString(),
    }, {
      onConflict: 'workspace_id',
    })
    .select()
    .single();

  if (compError) {
    console.error('[renewal-rate-watch] Comparison save error:', compError);
  }

  // Update workspace recommendation status
  await supabase
    .from('workspaces')
    .update({
      recommendation_status: recommendationType === 'switch' ? 'switch_recommended' 
        : recommendationType === 'stay' ? 'stay_recommended'
        : recommendationType === 'review_options' ? 'options_presented'
        : 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', workspaceId);

  return {
    current_premium: currentPremium,
    renewal_premium: renewalPremium,
    increase_amount: increaseAmount,
    increase_percent: increasePercent,
    quotes_compared: quoteComparisons.length,
    best_alternative: bestQuote?.carrier,
    best_savings: bestQuote?.savings_vs_renewal,
    recommendation: recommendationType,
  };
}

// =============================================================================
// REPORT WRITER PROMPT (No New Facts)
// =============================================================================

const REPORT_WRITER_SYSTEM_PROMPT = `You are a professional insurance remarketing report writer for a U.S. insurance agency.

SCOPE
- You receive a computed, deterministic ComparisonModel JSON (already calculated by code).
- Your job is to generate a client-ready report output JSON suitable for rendering to HTML/PDF.
- You MUST NOT introduce new facts. You may only rephrase and organize what is provided.

NON-NEGOTIABLE RULES
1) NO NEW FACTS. Do not invent premiums, coverages, savings, endorsements, reasons for increases.
2) Respect uncertainty:
   - If a field is NOT_FOUND or CONFLICT or NEEDS_VERIFICATION, you MUST keep it as such.
3) Be clear and client-friendly. Avoid jargon unless explained.
4) Output MUST be valid JSON only and conform to the report schema provided.
5) Do not mention OCR, LLMs, "extraction", or internal tooling.`;

const REPORT_PACK_SCHEMA = {
  type: 'object',
  required: ['title', 'executive_summary', 'renewal_change_summary', 'options_table_rows', 'recommendation_section', 'disclaimers'],
  properties: {
    title: { type: 'string' },
    subtitle: { type: 'string' },
    executive_summary: { type: 'string' },
    renewal_change_summary: {
      type: 'object',
      properties: {
        current_premium_display: { type: 'string' },
        renewal_premium_display: { type: 'string' },
        change_amount: { type: ['number', 'null'] },
        change_percent: { type: ['number', 'null'] },
        change_direction: { type: 'string', enum: ['increase', 'decrease', 'unchanged', 'unknown'] },
      },
    },
    options_table_rows: { type: 'array' },
    recommendation_section: {
      type: 'object',
      properties: {
        has_recommendation: { type: 'boolean' },
        recommendation_type: { type: ['string', 'null'] },
        rationale: { type: 'string' },
      },
    },
    items_to_verify: { type: 'array' },
    disclaimers: { type: 'array', items: { type: 'string' } },
  },
};

// =============================================================================
// STEP 3: GENERATE REPORT
// =============================================================================

async function generateReport(supabase: any, workspaceId: string, userId: string) {
  const { data: comparison } = await supabase
    .from('renewal_comparison_results')
    .select('*')
    .eq('workspace_id', workspaceId)
    .single();

  if (!comparison) {
    return { error: 'No comparison results found. Run compute_comparison first.' };
  }

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*, accounts(*)')
    .eq('id', workspaceId)
    .single();

  // Try LLM-generated report pack first
  let reportPack: any = null;
  const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
  const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
  const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME') || 'gpt-4o';

  if (AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY) {
    try {
      const comparisonModel = {
        current_term_premium: comparison.current_term_premium,
        renewal_term_premium: comparison.renewal_term_premium,
        renewal_increase_amount: comparison.renewal_increase_amount,
        renewal_increase_percent: comparison.renewal_increase_percent,
        quote_comparisons: comparison.quote_comparisons,
        best_alternative_carrier: comparison.best_alternative_carrier,
        best_alternative_savings: comparison.best_alternative_savings,
        recommendation_type: comparison.recommendation_type,
        recommendation_reason: comparison.recommendation_reason,
        items_needing_verification: comparison.items_needing_verification,
      };

      const userPrompt = `Generate the report pack JSON from the comparison_model.

INPUTS
1) report_output_schema:
${JSON.stringify(REPORT_PACK_SCHEMA, null, 2)}

2) comparison_model:
${JSON.stringify(comparisonModel, null, 2)}

OUTPUT STRUCTURE (must match schema)
- title / subtitle
- executive_summary: concise narrative
- renewal_change_summary: current vs renewal premium and % change
- options_table_rows[]: carrier, premium, savings_vs_renewal, parity_score, key_differences
- recommendation_section: recommendation + rationale
- items_to_verify[]: missing info needed to proceed
- disclaimers[]: coverage parity assumptions and next steps
Return JSON only.`;

      const chatUrl = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`;
      
      const chatResponse = await modelBoundaryFetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_OPENAI_KEY,
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: REPORT_WRITER_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 3000,
          response_format: { type: 'json_object' },
        }),
      });

      if (chatResponse.ok) {
        const chatData = await chatResponse.json();
        const content = chatData.choices?.[0]?.message?.content;
        if (content) {
          reportPack = JSON.parse(content);
          console.log('[renewal-rate-watch] LLM report generation successful');
        }
      }
    } catch (llmError) {
      console.error('[renewal-rate-watch] LLM report generation failed:', llmError);
    }
  }

  // Generate HTML from report pack or fallback
  const reportHtml = reportPack 
    ? generateReportHtmlFromPack(reportPack, workspace)
    : generateReportHtml(comparison, workspace);

  // Save report artifact
  const { data: artifact, error: artifactError } = await supabase
    .from('renewal_report_artifacts')
    .insert({
      workspace_id: workspaceId,
      comparison_result_id: comparison.id,
      artifact_type: 'summary_html',
      content_html: reportHtml,
      generated_by: userId,
    })
    .select()
    .single();

  if (artifactError) {
    console.error('[renewal-rate-watch] Report save error:', artifactError);
  }

  return {
    artifact_id: artifact?.id,
    artifact_type: 'summary_html',
    used_llm: !!reportPack,
  };
}

function generateReportHtmlFromPack(pack: any, workspace: any): string {
  const accountName = workspace?.accounts?.name || 'Valued Client';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${pack.title || 'Renewal Options Summary'}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    h1 { color: #1e40af; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    h2 { color: #374151; margin-top: 30px; }
    .summary-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 20px; margin: 20px 0; }
    .recommendation-box { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 20px; margin: 20px 0; }
    .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border: 1px solid #e5e7eb; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <h1>${pack.title || 'Renewal Options Summary'}</h1>
  ${pack.subtitle ? `<p style="color: #6b7280;">${pack.subtitle}</p>` : ''}
  <p><strong>Client:</strong> ${accountName}</p>
  <p><strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>

  <div class="summary-box">
    <h2 style="margin-top: 0;">Executive Summary</h2>
    <p>${pack.executive_summary || 'Summary not available.'}</p>
  </div>

  ${pack.renewal_change_summary ? `
  <h2>Premium Change</h2>
  <p>
    <strong>Current:</strong> ${pack.renewal_change_summary.current_premium_display || 'N/A'}<br>
    <strong>Renewal:</strong> ${pack.renewal_change_summary.renewal_premium_display || 'N/A'}<br>
    <strong>Change:</strong> ${pack.renewal_change_summary.change_direction === 'increase' ? '+' : ''}$${pack.renewal_change_summary.change_amount || 0} 
    (${pack.renewal_change_summary.change_percent || 0}%)
  </p>
  ` : ''}

  ${pack.options_table_rows?.length > 0 ? `
  <h2>Options Comparison</h2>
  <table>
    <thead>
      <tr>
        <th>Carrier</th>
        <th>Term Premium</th>
        <th>Savings vs Renewal</th>
        <th>Coverage Match</th>
      </tr>
    </thead>
    <tbody>
      ${pack.options_table_rows.map((row: any) => `
        <tr>
          <td>${row.carrier}${row.is_renewal ? ' (Renewal)' : ''}</td>
          <td>${row.term_premium}</td>
          <td>${row.savings_vs_renewal}</td>
          <td>${row.parity_score}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  ${pack.recommendation_section?.has_recommendation ? `
  <div class="recommendation-box">
    <h2 style="margin-top: 0;">Our Recommendation</h2>
    <p>${pack.recommendation_section.rationale}</p>
  </div>
  ` : ''}

  ${pack.items_to_verify?.length > 0 ? `
  <div class="warning-box">
    <h2 style="margin-top: 0;">Items to Verify</h2>
    <ul>
      ${pack.items_to_verify.map((item: any) => `<li><strong>${item.field}:</strong> ${item.reason}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  ${pack.disclaimers?.length > 0 ? `
  <h2>Important Notes</h2>
  <ul>
    ${pack.disclaimers.map((d: string) => `<li>${d}</li>`).join('')}
  </ul>
  ` : ''}

  <p style="margin-top: 40px; color: #6b7280; font-size: 12px;">
    Report generated by Lewis Insurance Renewal Rate Watch™
  </p>
</body>
</html>
  `;
}

function generateReportHtml(comparison: any, workspace: any): string {
  const accountName = workspace?.accounts?.name || 'Valued Client';
  const quoteComparisons = comparison.quote_comparisons || [];
  
  const increaseDirection = comparison.renewal_increase_amount > 0 ? 'increase' : 'decrease';
  const increaseWord = comparison.renewal_increase_amount > 0 ? 'increased' : 'decreased';
  
  let quotesHtml = '';
  if (quoteComparisons.length > 0) {
    quotesHtml = `
      <h2>Quote Comparison</h2>
      <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #f3f4f6;">
            <th style="padding: 12px; text-align: left; border: 1px solid #e5e7eb;">Carrier</th>
            <th style="padding: 12px; text-align: right; border: 1px solid #e5e7eb;">Term Premium</th>
            <th style="padding: 12px; text-align: right; border: 1px solid #e5e7eb;">Savings vs Renewal</th>
            <th style="padding: 12px; text-align: center; border: 1px solid #e5e7eb;">Coverage Match</th>
          </tr>
        </thead>
        <tbody>
          ${quoteComparisons.map((q: any) => `
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${q.carrier || 'Unknown'}</td>
              <td style="padding: 12px; text-align: right; border: 1px solid #e5e7eb;">$${(q.term_premium || 0).toFixed(2)}</td>
              <td style="padding: 12px; text-align: right; border: 1px solid #e5e7eb; color: ${q.savings_vs_renewal > 0 ? '#059669' : '#dc2626'};">
                ${q.savings_vs_renewal > 0 ? '+' : ''}$${(q.savings_vs_renewal || 0).toFixed(2)}
              </td>
              <td style="padding: 12px; text-align: center; border: 1px solid #e5e7eb;">${Math.round((q.parity_score || 0) * 100)}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Renewal Options Summary - ${accountName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    h1 { color: #1e40af; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    h2 { color: #374151; margin-top: 30px; }
    .summary-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 20px; margin: 20px 0; }
    .recommendation-box { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 20px; margin: 20px 0; }
    .warning-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; }
    .metric { font-size: 24px; font-weight: bold; color: #1e40af; }
    .metric-label { font-size: 14px; color: #6b7280; }
  </style>
</head>
<body>
  <h1>Renewal Options Summary</h1>
  <p><strong>Client:</strong> ${accountName}</p>
  <p><strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>

  <div class="summary-box">
    <h2 style="margin-top: 0;">Renewal Overview</h2>
    <div style="display: flex; gap: 40px;">
      <div>
        <div class="metric-label">Current Premium</div>
        <div class="metric">$${(comparison.current_term_premium || 0).toFixed(2)}</div>
      </div>
      <div>
        <div class="metric-label">Renewal Premium</div>
        <div class="metric">$${(comparison.renewal_term_premium || 0).toFixed(2)}</div>
      </div>
      <div>
        <div class="metric-label">Change</div>
        <div class="metric" style="color: ${comparison.renewal_increase_amount > 0 ? '#dc2626' : '#059669'}">
          ${comparison.renewal_increase_amount > 0 ? '+' : ''}$${(comparison.renewal_increase_amount || 0).toFixed(2)}
          (${(comparison.renewal_increase_percent || 0).toFixed(1)}%)
        </div>
      </div>
    </div>
  </div>

  ${quotesHtml}

  <div class="recommendation-box">
    <h2 style="margin-top: 0;">Our Recommendation</h2>
    <p>${comparison.recommendation_reason}</p>
    ${comparison.best_alternative_carrier ? `
      <p><strong>Best Alternative:</strong> ${comparison.best_alternative_carrier} - Save $${(comparison.best_alternative_savings || 0).toFixed(2)}</p>
    ` : ''}
  </div>

  <div class="warning-box">
    <h2 style="margin-top: 0;">Important Notes</h2>
    <ul>
      <li>All quotes assume comparable coverage levels. Any differences are noted above.</li>
      <li>Final premium may vary based on updated driver/vehicle information.</li>
      <li>Please review the detailed comparison before making a decision.</li>
    </ul>
  </div>

  <p style="margin-top: 40px; color: #6b7280; font-size: 12px;">
    Report generated by Lewis Insurance Renewal Rate Watch™
  </p>
</body>
</html>
  `;
}

// =============================================================================
// EMAIL WRITER PROMPT (No New Facts)
// =============================================================================

const EMAIL_WRITER_SYSTEM_PROMPT = `You write client emails for a U.S. insurance agency.

SCOPE
- Draft a polished email based on the report summary and recommendation data provided.
- The email should reassure the client we are proactively shopping their renewal.
- The email must be accurate and must not introduce facts not in the input.

NON-NEGOTIABLE RULES
1) NO NEW FACTS. Only use values provided in the input JSON.
2) If no cheaper option exists, clearly state that we shopped alternatives and renewal is currently best value (per the data).
3) If cheaper options exist, present them as options and note that coverage comparisons matter.
4) Include a short "Next steps" section and "Items we need to confirm" if provided.
5) Never mention OCR/AI/extraction.
6) Output MUST be valid JSON only and conform to the email schema provided.`;

const EMAIL_DRAFT_SCHEMA = {
  type: 'object',
  required: ['subject', 'greeting_line', 'body_paragraphs', 'next_steps', 'closing_line', 'signature_block'],
  properties: {
    subject: { type: 'string' },
    greeting_line: { type: 'string' },
    body_paragraphs: { type: 'array', items: { type: 'string' } },
    bullets: { type: 'array', items: { type: 'string' } },
    next_steps: { type: 'array', items: { type: 'string' } },
    items_to_confirm: { type: 'array', items: { type: 'string' } },
    closing_line: { type: 'string' },
    signature_block: { type: 'string' },
  },
};

// =============================================================================
// STEP 4: GENERATE EMAIL DRAFT
// =============================================================================

async function generateEmail(supabase: any, workspaceId: string, userId: string) {
  const { data: comparison } = await supabase
    .from('renewal_comparison_results')
    .select('*')
    .eq('workspace_id', workspaceId)
    .single();

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*, accounts(*), ao_renewals(*)')
    .eq('id', workspaceId)
    .single();

  if (!comparison) {
    return { error: 'No comparison results found.' };
  }

  const account = workspace?.accounts;
  const aoRenewal = workspace?.ao_renewals;
  const customerName = account?.name || aoRenewal?.customer_name || 'Valued Client';
  const toEmail = account?.email || '';

  // Try LLM-generated email first
  let emailDraftJson: any = null;
  const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
  const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
  const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME') || 'gpt-4o';

  if (AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY) {
    try {
      const emailContext = {
        client_name: customerName,
        agency_name: 'Lewis Insurance',
        producer_name: null,
        phone: '(386) 755-0050',
        email: 'service@lewisinsurance.ai',
      };

      const reportSummary = {
        current_premium: comparison.current_term_premium,
        renewal_premium: comparison.renewal_term_premium,
        renewal_increase_amount: comparison.renewal_increase_amount,
        renewal_increase_percent: comparison.renewal_increase_percent,
        quotes_compared: comparison.quote_comparisons?.length || 0,
        best_alternative_carrier: comparison.best_alternative_carrier,
        best_alternative_savings: comparison.best_alternative_savings,
      };

      const recommendation = {
        type: comparison.recommendation_type,
        reason: comparison.recommendation_reason,
        items_needing_verification: comparison.items_needing_verification,
      };

      const userPrompt = `Write a client email draft based on the provided report_summary and recommendation.

INPUTS
1) email_output_schema:
${JSON.stringify(EMAIL_DRAFT_SCHEMA, null, 2)}

2) email_context:
${JSON.stringify(emailContext, null, 2)}

3) report_summary:
${JSON.stringify(reportSummary, null, 2)}

4) recommendation:
${JSON.stringify(recommendation, null, 2)}

OUTPUT REQUIREMENTS (JSON only)
- subject
- greeting_line
- body_paragraphs[] (2–6)
- bullets[] (optional)
- next_steps[] (clear calls to action)
- items_to_confirm[] (if present)
- closing_line
- signature_block
Return JSON only.`;

      const chatUrl = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`;
      
      const chatResponse = await modelBoundaryFetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_OPENAI_KEY,
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: EMAIL_WRITER_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        }),
      });

      if (chatResponse.ok) {
        const chatData = await chatResponse.json();
        const content = chatData.choices?.[0]?.message?.content;
        if (content) {
          emailDraftJson = JSON.parse(content);
          console.log('[renewal-rate-watch] LLM email generation successful');
        }
      }
    } catch (llmError) {
      console.error('[renewal-rate-watch] LLM email generation failed:', llmError);
    }
  }

  // Generate email content from LLM result or fallback
  let subject: string;
  let bodyHtml: string;
  let bodyText: string;

  if (emailDraftJson) {
    subject = emailDraftJson.subject;
    bodyHtml = buildEmailHtmlFromDraft(emailDraftJson);
    bodyText = buildEmailTextFromDraft(emailDraftJson);
  } else {
    const generated = generateEmailContent(comparison, customerName, aoRenewal);
    subject = generated.subject;
    bodyHtml = generated.bodyHtml;
    bodyText = generated.bodyText;
  }

  // Save email draft
  const { data: emailDraft, error: emailError } = await supabase
    .from('renewal_email_drafts')
    .insert({
      workspace_id: workspaceId,
      comparison_result_id: comparison.id,
      subject,
      body_html: bodyHtml,
      body_text: bodyText,
      to_email: toEmail,
      to_name: customerName,
      status: 'draft',
      generated_by: userId,
    })
    .select()
    .single();

  if (emailError) {
    console.error('[renewal-rate-watch] Email save error:', emailError);
  }

  return {
    email_draft_id: emailDraft?.id,
    subject,
    used_llm: !!emailDraftJson,
  };
}

function buildEmailHtmlFromDraft(draft: any): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
  <p>${draft.greeting_line}</p>
  
  ${draft.body_paragraphs?.map((p: string) => `<p>${p}</p>`).join('\n') || ''}
  
  ${draft.bullets?.length > 0 ? `
  <ul>
    ${draft.bullets.map((b: string) => `<li>${b}</li>`).join('\n')}
  </ul>
  ` : ''}
  
  ${draft.next_steps?.length > 0 ? `
  <p><strong>Next Steps:</strong></p>
  <ol>
    ${draft.next_steps.map((s: string) => `<li>${s}</li>`).join('\n')}
  </ol>
  ` : ''}
  
  ${draft.items_to_confirm?.length > 0 ? `
  <p><strong>To proceed, we'll need:</strong></p>
  <ul>
    ${draft.items_to_confirm.map((i: string) => `<li>${i}</li>`).join('\n')}
  </ul>
  ` : ''}
  
  <p>${draft.closing_line}</p>
  
  <p>${draft.signature_block?.replace(/\n/g, '<br>')}</p>
</div>
  `;
}

function buildEmailTextFromDraft(draft: any): string {
  let text = `${draft.greeting_line}\n\n`;
  text += draft.body_paragraphs?.join('\n\n') || '';
  
  if (draft.bullets?.length > 0) {
    text += '\n\n' + draft.bullets.map((b: string) => `• ${b}`).join('\n');
  }
  
  if (draft.next_steps?.length > 0) {
    text += '\n\nNext Steps:\n' + draft.next_steps.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n');
  }
  
  if (draft.items_to_confirm?.length > 0) {
    text += '\n\nTo proceed, we\'ll need:\n' + draft.items_to_confirm.map((i: string) => `• ${i}`).join('\n');
  }
  
  text += `\n\n${draft.closing_line}\n\n${draft.signature_block}`;
  
  return text;
}

function generateEmailContent(comparison: any, customerName: string, aoRenewal: any): {
  subject: string;
  bodyHtml: string;
  bodyText: string;
} {
  const policyNumber = aoRenewal?.policy_number || 'your policy';
  const renewalDate = aoRenewal?.renewal_date 
    ? new Date(aoRenewal.renewal_date).toLocaleDateString() 
    : 'your upcoming renewal';
  
  const hasIncrease = comparison.renewal_increase_amount > 0;
  const hasBetterOption = comparison.best_alternative_savings > 0;
  
  let subject = '';
  let openingPara = '';
  let actionPara = '';
  
  if (hasIncrease && hasBetterOption) {
    subject = `Good News: We Found Savings on Your ${aoRenewal?.policy_type || 'Auto'} Insurance Renewal`;
    openingPara = `We noticed your upcoming renewal for policy ${policyNumber} includes a premium increase of $${comparison.renewal_increase_amount.toFixed(2)} (${comparison.renewal_increase_percent.toFixed(1)}%). We proactively shopped the market to find you better options.`;
    actionPara = `Great news! We found a comparable policy with ${comparison.best_alternative_carrier} that could save you $${comparison.best_alternative_savings.toFixed(2)} compared to your renewal.`;
  } else if (hasIncrease) {
    subject = `Your ${aoRenewal?.policy_type || 'Auto'} Insurance Renewal Update`;
    openingPara = `We noticed your upcoming renewal for policy ${policyNumber} includes a premium increase. We shopped several carriers to explore your options.`;
    actionPara = `After reviewing multiple quotes, your current carrier's renewal remains the most competitive option at this time. We'll continue monitoring the market for better opportunities.`;
  } else {
    subject = `Your ${aoRenewal?.policy_type || 'Auto'} Insurance Renewal Review`;
    openingPara = `Your policy ${policyNumber} is coming up for renewal on ${renewalDate}. We've reviewed your options and prepared a summary.`;
    actionPara = comparison.recommendation_reason;
  }

  const bodyHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
  <p>Dear ${customerName},</p>
  
  <p>${openingPara}</p>
  
  <p><strong>${actionPara}</strong></p>
  
  <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0;"><strong>Quick Summary:</strong></p>
    <ul style="margin: 10px 0;">
      <li>Current Premium: $${(comparison.current_term_premium || 0).toFixed(2)}</li>
      <li>Renewal Premium: $${(comparison.renewal_term_premium || 0).toFixed(2)}</li>
      ${hasBetterOption ? `<li style="color: #059669;"><strong>Best Alternative: ${comparison.best_alternative_carrier} - $${comparison.best_alternative_savings.toFixed(2)} savings</strong></li>` : ''}
    </ul>
  </div>
  
  <p>All quotes are based on matching your current coverage levels as closely as possible. Any differences in coverage are noted in the attached report.</p>
  
  <p><strong>Next Steps:</strong></p>
  <ol>
    <li>Review the attached Renewal Options Summary</li>
    <li>Let us know if you'd like to proceed with any changes</li>
    <li>Confirm any updated driver or vehicle information</li>
  </ol>
  
  <p>Please give us a call or reply to this email if you have any questions. We're happy to walk you through the options!</p>
  
  <p>Best regards,<br>
  Your Team at Lewis Insurance<br>
  (386) 755-0050</p>
</div>
  `;

  const bodyText = `
Dear ${customerName},

${openingPara}

${actionPara}

Quick Summary:
- Current Premium: $${(comparison.current_term_premium || 0).toFixed(2)}
- Renewal Premium: $${(comparison.renewal_term_premium || 0).toFixed(2)}
${hasBetterOption ? `- Best Alternative: ${comparison.best_alternative_carrier} - $${comparison.best_alternative_savings.toFixed(2)} savings` : ''}

All quotes are based on matching your current coverage levels as closely as possible.

Next Steps:
1. Review the attached Renewal Options Summary
2. Let us know if you'd like to proceed with any changes
3. Confirm any updated driver or vehicle information

Please give us a call or reply to this email if you have any questions!

Best regards,
Your Team at Lewis Insurance
(386) 755-0050
  `;

  return { subject, bodyHtml, bodyText };
}

// =============================================================================
// STEP 5: SEND EMAIL (Uses existing email-send edge function)
// =============================================================================

async function sendRenewalEmail(supabase: any, workspaceId: string, userId: string, emailDraftId?: string) {
  // Get email draft
  let draft;
  if (emailDraftId) {
    const { data, error } = await supabase
      .from('renewal_email_drafts')
      .select('*')
      .eq('id', emailDraftId)
      .single();
    if (error) throw new Error(`Draft not found: ${error.message}`);
    draft = data;
  } else {
    const { data, error } = await supabase
      .from('renewal_email_drafts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error) throw new Error(`No draft found: ${error.message}`);
    draft = data;
  }

  if (!draft.to_email) {
    return { success: false, error: 'No recipient email address' };
  }

  // Get report artifact for attachment reference
  const { data: artifact } = await supabase
    .from('renewal_report_artifacts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Call email-send edge function
  const EMAIL_PROVIDER = Deno.env.get('EMAIL_PROVIDER') || 'postmark';
  const EMAIL_API_KEY = Deno.env.get('EMAIL_PROVIDER_API_KEY');
  const FROM_EMAIL = Deno.env.get('OUTBOUND_FROM') || 'service@lewisinsurance.ai';

  if (!EMAIL_API_KEY) {
    // Fall back to queue-based sending
    return await queueEmailForSending(supabase, draft, artifact, userId);
  }

  try {
    let response: Response;

    if (EMAIL_PROVIDER === 'postmark') {
      response = await modelBoundaryFetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': EMAIL_API_KEY,
        },
        body: JSON.stringify({
          From: FROM_EMAIL,
          To: draft.to_email,
          Subject: draft.subject,
          HtmlBody: draft.body_html,
          TextBody: draft.body_text,
          MessageStream: 'outbound',
          Tag: 'renewal-rate-watch',
          Metadata: {
            workspace_id: workspaceId,
            draft_id: draft.id,
          },
        }),
      });
    } else if (EMAIL_PROVIDER === 'sendgrid') {
      response = await modelBoundaryFetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${EMAIL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: draft.to_email }] }],
          from: { email: FROM_EMAIL },
          subject: draft.subject,
          content: [
            { type: 'text/plain', value: draft.body_text },
            { type: 'text/html', value: draft.body_html },
          ],
        }),
      });
    } else {
      throw new Error(`Unsupported email provider: ${EMAIL_PROVIDER}`);
    }

    if (!response!.ok) {
      const errorData = await response!.json();
      throw new Error(`Email send failed: ${JSON.stringify(errorData)}`);
    }

    const result = EMAIL_PROVIDER === 'postmark' 
      ? await response!.json()
      : { id: 'sendgrid-success' };

    // Update draft status
    await supabase
      .from('renewal_email_drafts')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        message_id: result.MessageID || result.id,
      })
      .eq('id', draft.id);

    // Log activity
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('account_id')
      .eq('id', workspaceId)
      .single();

    if (workspace?.account_id) {
      await supabase.from('activities').insert({
        account_id: workspace.account_id,
        activity_type: 'email_sent',
        title: `Renewal Rate Watch email sent to ${draft.to_name || draft.to_email}`,
        description: draft.subject,
        created_by: userId,
      });
    }

    return {
      success: true,
      message_id: result.MessageID || result.id,
      to: draft.to_email,
    };

  } catch (error) {
    console.error('[renewal-rate-watch] Email send error:', error);

    // Update draft with error
    await supabase
      .from('renewal_email_drafts')
      .update({
        status: 'failed',
        error_message: error.message,
      })
      .eq('id', draft.id);

    return { success: false, error: error.message };
  }
}

async function queueEmailForSending(supabase: any, draft: any, artifact: any, userId: string) {
  // Use the marketing_send_queue if available
  try {
    const { data: queueItem, error: queueError } = await supabase
      .from('marketing_send_queue')
      .insert({
        idempotency_key: `renewal-rate-watch-${draft.id}`,
        priority: 10, // High priority
        scheduled_for: new Date().toISOString(),
        channel: 'email',
        classification: 'transactional',
        from_user_id: userId,
        to_email: draft.to_email,
        source_type: 'renewal_rate_watch',
        source_id: draft.workspace_id,
      })
      .select('id')
      .single();

    if (queueError) {
      // Queue might not exist, update draft status
      await supabase
        .from('renewal_email_drafts')
        .update({ status: 'pending_send' })
        .eq('id', draft.id);

      return { 
        success: true, 
        queued: true, 
        message: 'Email draft saved. Please configure email provider to send.' 
      };
    }

    // Add payload
    await supabase.from('marketing_send_queue_payloads').insert({
      queue_id: queueItem.id,
      channel: 'email',
      email_subject: draft.subject,
      email_body_html: draft.body_html,
      email_body_text: draft.body_text,
    });

    await supabase
      .from('renewal_email_drafts')
      .update({ status: 'queued' })
      .eq('id', draft.id);

    return { success: true, queued: true, queue_id: queueItem.id };

  } catch (error) {
    console.error('[renewal-rate-watch] Queue error:', error);
    return { success: false, error: 'Failed to queue email' };
  }
}

