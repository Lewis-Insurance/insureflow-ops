// @ts-nocheck
/**
 * Comparison Report Edge Function
 *
 * Generates professional comparison reports in HTML/PDF format.
 * Includes executive summary, side-by-side tables, and evidence references.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================================================
// TYPES
// =============================================================================

interface ReportOptions {
  reportType: "standard" | "executive" | "detailed" | "client_facing";
  includeEvidence: boolean;
  includeRecommendations: boolean;
  includeGapAnalysis: boolean;
  brandingConfig?: {
    logoUrl?: string;
    primaryColor?: string;
    agencyName?: string;
  };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json();
    const workspaceId = body.workspace_id;
    const options: ReportOptions = {
      reportType: body.report_type || "standard",
      includeEvidence: body.include_evidence !== false,
      includeRecommendations: body.include_recommendations !== false,
      includeGapAnalysis: body.include_gap_analysis !== false,
      brandingConfig: body.branding_config,
    };

    if (!workspaceId) {
      throw new Error("Missing required field: workspace_id");
    }

    // Authenticate
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }
    const userId = authResult.id;

    console.log(`[comparison-report] Generating ${options.reportType} report for workspace ${workspaceId}`);
    const startTime = Date.now();

    // Fetch comparison result
    const { data: result, error: resultError } = await supabase
      .from("comparison_results")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("compared_at", { ascending: false })
      .limit(1)
      .single();

    if (resultError || !result) {
      throw new Error(`Comparison result not found: ${resultError?.message || 'Unknown'}`);
    }

    // Fetch snapshots
    const { data: snapshots } = await supabase
      .from("policy_snapshots")
      .select("*")
      .eq("workspace_id", workspaceId);

    const snapshotA = snapshots?.find((s: any) => s.doc_role === 'A');
    const snapshotB = snapshots?.find((s: any) => s.doc_role === 'B');

    if (!snapshotA || !snapshotB) {
      throw new Error("Both snapshots required for report generation");
    }

    // Fetch workspace for metadata
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name, client_name")
      .eq("id", workspaceId)
      .single();

    // Generate HTML report
    const html = generateHTMLReport(
      workspace,
      snapshotA,
      snapshotB,
      result,
      options
    );

    // Upload HTML to storage
    const htmlFileName = `reports/${workspaceId}/${Date.now()}_comparison.html`;
    const { error: uploadError } = await supabase.storage
      .from("workspace-documents")
      .upload(htmlFileName, new Blob([html], { type: "text/html" }), {
        contentType: "text/html",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload report: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("workspace-documents")
      .getPublicUrl(htmlFileName);

    const htmlUrl = urlData.publicUrl;

    // Save report record
    const reportId = crypto.randomUUID();
    const now = new Date().toISOString();
    const processingTimeMs = Date.now() - startTime;

    await supabase
      .from("comparison_reports")
      .insert({
        id: reportId,
        comparison_result_id: result.id,
        workspace_id: workspaceId,
        html_url: htmlUrl,
        pdf_url: null, // PDF generation can be added later
        report_type: options.reportType,
        report_title: `Coverage Comparison - ${workspace?.name || workspaceId}`,
        include_evidence: options.includeEvidence,
        include_recommendations: options.includeRecommendations,
        include_gap_analysis: options.includeGapAnalysis,
        branding_config: options.brandingConfig || {},
        generated_at: now,
        generated_by: userId,
        generation_time_ms: processingTimeMs,
      });

    console.log(`[comparison-report] Report generated in ${processingTimeMs}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        report_id: reportId,
        html_url: htmlUrl,
        generation_time_ms: processingTimeMs,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err: unknown) {
    console.error("[comparison-report] Error:", err);

    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

// =============================================================================
// HTML REPORT GENERATION
// =============================================================================

function generateHTMLReport(
  workspace: any,
  snapshotA: any,
  snapshotB: any,
  result: any,
  options: ReportOptions
): string {
  const primaryColor = options.brandingConfig?.primaryColor || "#2563eb";
  const agencyName = options.brandingConfig?.agencyName || "Insurance Agency";
  const logoUrl = options.brandingConfig?.logoUrl;

  const differences = result.field_differences || [];
  const summary = result.summary_stats || {};
  const gaps = result.coverage_gaps || [];
  const mismatches = result.global_mismatches || [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Coverage Comparison Report - ${workspace?.name || 'Comparison'}</title>
  <style>
    :root {
      --primary-color: ${primaryColor};
      --critical-color: #dc2626;
      --high-color: #ea580c;
      --medium-color: #ca8a04;
      --low-color: #16a34a;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      max-width: 1100px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #f9fafb;
    }

    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid var(--primary-color);
    }

    .header h1 {
      color: var(--primary-color);
      font-size: 28px;
      margin-bottom: 8px;
    }

    .header .subtitle {
      color: #6b7280;
      font-size: 14px;
    }

    .section {
      background: white;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--primary-color);
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e5e7eb;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }

    .summary-card {
      background: #f3f4f6;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }

    .summary-card .number {
      font-size: 28px;
      font-weight: 700;
    }

    .summary-card .label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
    }

    .summary-card.critical .number { color: var(--critical-color); }
    .summary-card.high .number { color: var(--high-color); }
    .summary-card.medium .number { color: var(--medium-color); }
    .summary-card.low .number { color: var(--low-color); }

    .executive-summary {
      font-size: 15px;
      color: #374151;
      background: #f0f9ff;
      padding: 16px;
      border-radius: 6px;
      border-left: 4px solid var(--primary-color);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }

    th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
    }

    .severity-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .severity-badge.critical { background: #fef2f2; color: var(--critical-color); }
    .severity-badge.high { background: #fff7ed; color: var(--high-color); }
    .severity-badge.medium { background: #fefce8; color: var(--medium-color); }
    .severity-badge.low { background: #f0fdf4; color: var(--low-color); }

    .change-type {
      font-size: 11px;
      color: #6b7280;
    }

    .value-cell {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 13px;
    }

    .value-added { color: #16a34a; }
    .value-removed { color: #dc2626; text-decoration: line-through; }
    .value-changed { color: #ca8a04; }

    .recommendations-list {
      list-style: none;
      padding: 0;
    }

    .recommendations-list li {
      padding: 12px 16px;
      background: #f0fdf4;
      border-radius: 6px;
      margin-bottom: 8px;
      border-left: 3px solid #16a34a;
    }

    .gap-item {
      padding: 12px 16px;
      background: #fff7ed;
      border-radius: 6px;
      margin-bottom: 8px;
      border-left: 3px solid var(--high-color);
    }

    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      color: #6b7280;
      font-size: 12px;
    }

    @media print {
      body {
        background: white;
        padding: 20px;
      }
      .section {
        box-shadow: none;
        border: 1px solid #e5e7eb;
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height: 60px; margin-bottom: 16px;">` : ''}
    <h1>Coverage Comparison Report</h1>
    <div class="subtitle">
      ${workspace?.client_name ? `<strong>${workspace.client_name}</strong> | ` : ''}
      Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
    </div>
  </div>

  <!-- Document Overview -->
  <div class="section">
    <h2 class="section-title">Documents Compared</h2>
    <table>
      <tr>
        <th></th>
        <th>Document A</th>
        <th>Document B</th>
      </tr>
      <tr>
        <td><strong>Type</strong></td>
        <td>${snapshotA.document_type || 'Unknown'}</td>
        <td>${snapshotB.document_type || 'Unknown'}</td>
      </tr>
      <tr>
        <td><strong>Carrier</strong></td>
        <td>${snapshotA.carrier || 'Unknown'}</td>
        <td>${snapshotB.carrier || 'Unknown'}</td>
      </tr>
      <tr>
        <td><strong>Line of Business</strong></td>
        <td>${snapshotA.line_of_business || 'Unknown'}</td>
        <td>${snapshotB.line_of_business || 'Unknown'}</td>
      </tr>
      <tr>
        <td><strong>Extraction Confidence</strong></td>
        <td>${((snapshotA.extraction_confidence || 0) * 100).toFixed(0)}%</td>
        <td>${((snapshotB.extraction_confidence || 0) * 100).toFixed(0)}%</td>
      </tr>
    </table>
  </div>

  <!-- Summary Statistics -->
  <div class="section">
    <h2 class="section-title">Summary</h2>
    <div class="summary-grid">
      <div class="summary-card critical">
        <div class="number">${summary.criticalCount || 0}</div>
        <div class="label">Critical</div>
      </div>
      <div class="summary-card high">
        <div class="number">${summary.highCount || 0}</div>
        <div class="label">High</div>
      </div>
      <div class="summary-card medium">
        <div class="number">${summary.mediumCount || 0}</div>
        <div class="label">Medium</div>
      </div>
      <div class="summary-card low">
        <div class="number">${summary.lowCount || 0}</div>
        <div class="label">Low</div>
      </div>
    </div>
    ${result.executive_summary ? `
    <div class="executive-summary">
      ${result.executive_summary}
    </div>
    ` : ''}
  </div>

  <!-- Mismatches Warning -->
  ${mismatches.length > 0 ? `
  <div class="section" style="border-left: 4px solid var(--high-color);">
    <h2 class="section-title">Document Mismatches</h2>
    ${mismatches.map((m: any) => `
    <div class="gap-item">
      <strong>${m.type}</strong>: ${m.description}<br>
      <small>A: ${m.leftValue} | B: ${m.rightValue}</small>
    </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- Differences Table -->
  <div class="section">
    <h2 class="section-title">Field Differences (${differences.length})</h2>
    ${differences.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Severity</th>
          <th>Document A</th>
          <th>Document B</th>
          <th>Change</th>
        </tr>
      </thead>
      <tbody>
        ${differences.slice(0, 50).map((d: any) => `
        <tr>
          <td><strong>${d.label || d.fieldPath}</strong></td>
          <td><span class="severity-badge ${d.severity}">${d.severity}</span></td>
          <td class="value-cell ${d.changeType === 'removed' ? 'value-removed' : ''}">${d.leftValueRaw || '-'}</td>
          <td class="value-cell ${d.changeType === 'added' ? 'value-added' : ''}">${d.rightValueRaw || '-'}</td>
          <td class="change-type">${d.changeType}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ${differences.length > 50 ? `<p style="margin-top: 16px; color: #6b7280; font-size: 13px;">Showing top 50 of ${differences.length} differences.</p>` : ''}
    ` : '<p>No differences found between the documents.</p>'}
  </div>

  <!-- Coverage Gaps -->
  ${options.includeGapAnalysis && gaps.length > 0 ? `
  <div class="section">
    <h2 class="section-title">Coverage Gaps (${gaps.length})</h2>
    ${gaps.map((g: any) => `
    <div class="gap-item">
      <span class="severity-badge ${g.severity}">${g.severity}</span>
      <strong>${g.coverageType}</strong> missing in Document ${g.missingIn}
      <br><small>${g.description}</small>
    </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- Recommendations -->
  ${options.includeRecommendations && result.recommendations?.length > 0 ? `
  <div class="section">
    <h2 class="section-title">Recommendations</h2>
    <ul class="recommendations-list">
      ${result.recommendations.map((r: string) => `<li>${r}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  <div class="footer">
    <p>Generated by ${agencyName} Coverage Comparison System</p>
    <p>Report ID: ${result.id}</p>
  </div>
</body>
</html>`;
}
