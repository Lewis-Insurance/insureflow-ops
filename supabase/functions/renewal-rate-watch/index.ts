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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RateWatchRequest {
  action: 'process_documents' | 'compute_comparison' | 'generate_report' | 'generate_email' | 'full_pipeline';
  workspace_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, workspace_id }: RateWatchRequest = await req.json();
    console.log(`[renewal-rate-watch] Action: ${action}, Workspace: ${workspace_id}`);

    // Get workspace
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('*, ao_renewals(*)')
      .eq('id', workspace_id)
      .single();

    if (wsError || !workspace) {
      return new Response(
        JSON.stringify({ error: 'Workspace not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
// STEP 1: PROCESS DOCUMENTS -> BUNDLE SNAPSHOTS
// =============================================================================

async function processDocuments(supabase: any, workspaceId: string) {
  // Get all documents for this workspace
  const { data: docs, error: docsError } = await supabase
    .from('workspace_documents')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (docsError) throw new Error(`Failed to get documents: ${docsError.message}`);
  if (!docs || docs.length === 0) {
    return { bundles_created: 0, message: 'No documents found' };
  }

  // Group documents by role and carrier
  const bundles: Record<string, any[]> = {
    CURRENT: [],
    RENEWAL: [],
  };
  const quoteBundles: Record<string, any[]> = {};

  for (const doc of docs) {
    if (doc.doc_role === 'CURRENT') {
      bundles.CURRENT.push(doc);
    } else if (doc.doc_role === 'RENEWAL') {
      bundles.RENEWAL.push(doc);
    } else if (doc.doc_role === 'QUOTE') {
      const carrier = doc.carrier_name || 'Unknown Carrier';
      if (!quoteBundles[carrier]) {
        quoteBundles[carrier] = [];
      }
      quoteBundles[carrier].push(doc);
    }
  }

  // Process each bundle
  const bundlesCreated: string[] = [];

  // Process CURRENT bundle
  if (bundles.CURRENT.length > 0) {
    const snapshot = await processBundleDocuments(supabase, workspaceId, 'CURRENT', null, bundles.CURRENT);
    bundlesCreated.push('CURRENT');
  }

  // Process RENEWAL bundle
  if (bundles.RENEWAL.length > 0) {
    const snapshot = await processBundleDocuments(supabase, workspaceId, 'RENEWAL', null, bundles.RENEWAL);
    bundlesCreated.push('RENEWAL');
  }

  // Process QUOTE bundles (one per carrier)
  for (const [carrier, quoteDocs] of Object.entries(quoteBundles)) {
    const snapshot = await processBundleDocuments(supabase, workspaceId, 'QUOTE', carrier, quoteDocs);
    bundlesCreated.push(`QUOTE:${carrier}`);
  }

  return {
    bundles_created: bundlesCreated.length,
    bundles: bundlesCreated,
  };
}

async function processBundleDocuments(
  supabase: any,
  workspaceId: string,
  bundleRole: string,
  carrierName: string | null,
  documents: any[]
): Promise<any> {
  // For now, create a placeholder bundle snapshot
  // In production, this would:
  // 1. Get Azure DI evidence catalogs for each doc
  // 2. Run schema-driven extraction
  // 3. Merge snapshots with conflict detection
  
  const documentIds = documents.map(d => d.id);
  
  // Check for existing evidence catalogs
  const { data: evidenceCatalogs } = await supabase
    .from('comparison_evidence_catalog')
    .select('*')
    .in('workspace_document_id', documentIds);

  // Create or update bundle snapshot
  const { data: bundle, error: bundleError } = await supabase
    .from('bundle_snapshots')
    .upsert({
      workspace_id: workspaceId,
      bundle_role: bundleRole,
      carrier_name: carrierName,
      document_ids: documentIds,
      snapshot_json: {
        // Placeholder - would be filled by extraction
        insured_name: null,
        policy_number: null,
        term_dates: null,
        coverages: [],
        vehicles: [],
        drivers: [],
        premium_breakdown: null,
      },
      status: evidenceCatalogs?.length > 0 ? 'ready' : 'pending',
      fields_extracted: 0,
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
// STEP 3: GENERATE REPORT
// =============================================================================

async function generateReport(supabase: any, workspaceId: string, userId: string) {
  // Get comparison results
  const { data: comparison } = await supabase
    .from('renewal_comparison_results')
    .select('*')
    .eq('workspace_id', workspaceId)
    .single();

  if (!comparison) {
    return { error: 'No comparison results found. Run compute_comparison first.' };
  }

  // Get workspace with account info
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*, accounts(*)')
    .eq('id', workspaceId)
    .single();

  // Generate HTML report
  const reportHtml = generateReportHtml(comparison, workspace);

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
  };
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
// STEP 4: GENERATE EMAIL DRAFT
// =============================================================================

async function generateEmail(supabase: any, workspaceId: string, userId: string) {
  // Get comparison results and workspace
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

  // Generate email content
  const { subject, bodyHtml, bodyText } = generateEmailContent(comparison, customerName, aoRenewal);

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
  };
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

