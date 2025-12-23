/**
 * PDF Generator for Reports
 * 
 * Uses PDFKit-style generation for Deno Edge Functions.
 * Generates professional PDF reports from structured data.
 */

// =============================================================================
// PDF DOCUMENT STRUCTURE (Simple Text-Based for Edge Functions)
// =============================================================================

export interface PdfPage {
  content: string[];
  pageNumber: number;
}

export interface PdfStyle {
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  color: string;
  lineHeight: number;
}

// =============================================================================
// SIMPLE HTML-TO-PDF PROXY (Recommended for Complex Reports)
// =============================================================================

/**
 * For Deno Edge Functions, we recommend generating HTML and using
 * a service like htmlcsstoimage.com or puppeteer-based API for PDF conversion.
 * 
 * Alternatively, use the built-in HTML generation which can be printed to PDF
 * by the client.
 */

export interface ReportSection {
  type: 'title' | 'heading' | 'paragraph' | 'table' | 'list' | 'spacer' | 'divider';
  content?: string;
  items?: string[];
  rows?: string[][];
  headers?: string[];
  style?: Partial<PdfStyle>;
}

// =============================================================================
// RENEWAL REPORT HTML GENERATOR
// =============================================================================

export function generateRenewalReportHtml(data: {
  title: string;
  subtitle?: string;
  clientName: string;
  generatedDate: string;
  executiveSummary: string;
  renewalChange: {
    currentPremium: string;
    renewalPremium: string;
    changeAmount: string;
    changePercent: string;
    direction: 'increase' | 'decrease' | 'unchanged';
  };
  optionsTable: Array<{
    carrier: string;
    premium: string;
    savings: string;
    parityScore: string;
    differences: string[];
    isRecommended?: boolean;
  }>;
  coverageMatrix?: Array<{
    coverage: string;
    current: string;
    renewal: string;
    quotes: Record<string, string>;
  }>;
  recommendation?: {
    type: 'switch' | 'stay' | 'review';
    carrier?: string;
    rationale: string;
  };
  itemsToVerify: Array<{
    field: string;
    reason: string;
  }>;
  disclaimers: string[];
}): string {
  const changeColorClass = data.renewalChange.direction === 'increase' 
    ? 'color: #dc2626;' 
    : data.renewalChange.direction === 'decrease' 
      ? 'color: #16a34a;' 
      : 'color: #6b7280;';

  const changeIcon = data.renewalChange.direction === 'increase' 
    ? '↑' 
    : data.renewalChange.direction === 'decrease' 
      ? '↓' 
      : '→';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #1f2937;
      line-height: 1.6;
      background: #ffffff;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    
    .header {
      border-bottom: 3px solid #1e40af;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    
    .header h1 {
      color: #1e40af;
      font-size: 28px;
      margin-bottom: 8px;
    }
    
    .header .subtitle {
      color: #6b7280;
      font-size: 14px;
    }
    
    .meta {
      display: flex;
      gap: 40px;
      margin-bottom: 30px;
      font-size: 14px;
    }
    
    .meta-item label {
      color: #6b7280;
      display: block;
      font-size: 12px;
      margin-bottom: 2px;
    }
    
    .meta-item value {
      font-weight: 600;
    }
    
    .section {
      margin-bottom: 30px;
    }
    
    .section h2 {
      color: #374151;
      font-size: 18px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 8px;
      margin-bottom: 16px;
    }
    
    .summary-box {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      padding: 20px;
      border-radius: 0 8px 8px 0;
      margin-bottom: 24px;
    }
    
    .recommendation-box {
      background: #f0fdf4;
      border-left: 4px solid #22c55e;
      padding: 20px;
      border-radius: 0 8px 8px 0;
      margin-bottom: 24px;
    }
    
    .warning-box {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 20px;
      border-radius: 0 8px 8px 0;
      margin-bottom: 24px;
    }
    
    .change-summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      margin-bottom: 24px;
    }
    
    .change-item {
      text-align: center;
      padding: 16px;
      background: #f9fafb;
      border-radius: 8px;
    }
    
    .change-item label {
      display: block;
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    
    .change-item value {
      font-size: 24px;
      font-weight: 700;
    }
    
    .change-item.highlight {
      background: #fee2e2;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 14px;
    }
    
    th, td {
      padding: 12px;
      text-align: left;
      border: 1px solid #e5e7eb;
    }
    
    th {
      background: #f3f4f6;
      font-weight: 600;
      color: #374151;
    }
    
    tr.recommended {
      background: #f0fdf4;
    }
    
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
    }
    
    .badge-success {
      background: #dcfce7;
      color: #166534;
    }
    
    .badge-warning {
      background: #fef3c7;
      color: #92400e;
    }
    
    ul {
      margin: 0;
      padding-left: 20px;
    }
    
    li {
      margin-bottom: 4px;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
    }
    
    .disclaimers {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 24px;
    }
    
    .disclaimers li {
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${data.title}</h1>
    ${data.subtitle ? `<p class="subtitle">${data.subtitle}</p>` : ''}
  </div>

  <div class="meta">
    <div class="meta-item">
      <label>Client</label>
      <value>${data.clientName}</value>
    </div>
    <div class="meta-item">
      <label>Generated</label>
      <value>${data.generatedDate}</value>
    </div>
  </div>

  <div class="summary-box">
    <h2 style="border: none; margin-bottom: 12px;">Executive Summary</h2>
    <p>${data.executiveSummary}</p>
  </div>

  <div class="section">
    <h2>Premium Change</h2>
    <div class="change-summary">
      <div class="change-item">
        <label>Current Premium</label>
        <value>${data.renewalChange.currentPremium}</value>
      </div>
      <div class="change-item">
        <label>Renewal Premium</label>
        <value>${data.renewalChange.renewalPremium}</value>
      </div>
      <div class="change-item ${data.renewalChange.direction === 'increase' ? 'highlight' : ''}">
        <label>Change</label>
        <value style="${changeColorClass}">${changeIcon} ${data.renewalChange.changeAmount}</value>
      </div>
      <div class="change-item">
        <label>Percent</label>
        <value style="${changeColorClass}">${data.renewalChange.changePercent}</value>
      </div>
    </div>
  </div>

  ${data.optionsTable.length > 0 ? `
  <div class="section">
    <h2>Options Comparison</h2>
    <table>
      <thead>
        <tr>
          <th>Carrier</th>
          <th>Premium</th>
          <th>Savings vs Renewal</th>
          <th>Coverage Match</th>
          <th>Key Differences</th>
        </tr>
      </thead>
      <tbody>
        ${data.optionsTable.map(opt => `
          <tr ${opt.isRecommended ? 'class="recommended"' : ''}>
            <td>
              ${opt.carrier}
              ${opt.isRecommended ? '<span class="badge badge-success">Recommended</span>' : ''}
            </td>
            <td>${opt.premium}</td>
            <td>${opt.savings}</td>
            <td>${opt.parityScore}</td>
            <td>
              ${opt.differences.length > 0 ? `<ul>${opt.differences.map(d => `<li>${d}</li>`).join('')}</ul>` : 'None noted'}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${data.coverageMatrix && data.coverageMatrix.length > 0 ? `
  <div class="section page-break">
    <h2>Coverage Comparison</h2>
    <table>
      <thead>
        <tr>
          <th>Coverage</th>
          <th>Current</th>
          <th>Renewal</th>
          ${Object.keys(data.coverageMatrix[0]?.quotes || {}).map(carrier => `<th>${carrier}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${data.coverageMatrix.map(row => `
          <tr>
            <td><strong>${row.coverage}</strong></td>
            <td>${row.current}</td>
            <td>${row.renewal}</td>
            ${Object.values(row.quotes).map(v => `<td>${v}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${data.recommendation ? `
  <div class="recommendation-box">
    <h2 style="border: none; margin-bottom: 12px;">Our Recommendation</h2>
    <p>
      ${data.recommendation.type === 'switch' 
        ? `<strong>Consider switching to ${data.recommendation.carrier}.</strong>` 
        : data.recommendation.type === 'stay'
          ? '<strong>We recommend staying with your current carrier.</strong>'
          : '<strong>Please review the options with your agent.</strong>'
      }
    </p>
    <p style="margin-top: 8px;">${data.recommendation.rationale}</p>
  </div>
  ` : ''}

  ${data.itemsToVerify.length > 0 ? `
  <div class="warning-box">
    <h2 style="border: none; margin-bottom: 12px;">Items to Verify</h2>
    <p>Before making a decision, please confirm:</p>
    <ul style="margin-top: 8px;">
      ${data.itemsToVerify.map(item => `
        <li><strong>${item.field}:</strong> ${item.reason}</li>
      `).join('')}
    </ul>
  </div>
  ` : ''}

  ${data.disclaimers.length > 0 ? `
  <div class="disclaimers">
    <h3 style="margin-bottom: 8px; font-size: 12px;">Important Notes</h3>
    <ul>
      ${data.disclaimers.map(d => `<li>${d}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  <div class="footer">
    <p>Generated by Lewis Insurance Renewal Rate Watch™</p>
    <p>Questions? Call us at (386) 755-0050 or email service@lewisinsurance.ai</p>
  </div>

  <div class="no-print" style="margin-top: 24px; text-align: center;">
    <button onclick="window.print()" style="padding: 12px 24px; background: #1e40af; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">
      Print / Save as PDF
    </button>
  </div>
</body>
</html>
  `;
}

// =============================================================================
// EMAIL DRAFT GENERATOR
// =============================================================================

export function generateRenewalEmailHtml(data: {
  greeting: string;
  clientName: string;
  bodyParagraphs: string[];
  bullets?: string[];
  nextSteps: string[];
  itemsToConfirm?: string[];
  closingLine: string;
  signatureBlock: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>${data.greeting}</p>

  ${data.bodyParagraphs.map(p => `<p>${p}</p>`).join('\n')}

  ${data.bullets && data.bullets.length > 0 ? `
  <ul style="margin: 16px 0; padding-left: 20px;">
    ${data.bullets.map(b => `<li style="margin-bottom: 8px;">${b}</li>`).join('\n')}
  </ul>
  ` : ''}

  ${data.nextSteps.length > 0 ? `
  <p><strong>Next Steps:</strong></p>
  <ol style="margin: 8px 0 16px; padding-left: 20px;">
    ${data.nextSteps.map(s => `<li style="margin-bottom: 8px;">${s}</li>`).join('\n')}
  </ol>
  ` : ''}

  ${data.itemsToConfirm && data.itemsToConfirm.length > 0 ? `
  <p><strong>To proceed, we'll need:</strong></p>
  <ul style="margin: 8px 0 16px; padding-left: 20px;">
    ${data.itemsToConfirm.map(i => `<li style="margin-bottom: 4px;">${i}</li>`).join('\n')}
  </ul>
  ` : ''}

  <p>${data.closingLine}</p>

  <div style="margin-top: 24px; white-space: pre-line;">${data.signatureBlock}</div>
</body>
</html>
  `;
}

export function generateRenewalEmailText(data: {
  greeting: string;
  bodyParagraphs: string[];
  bullets?: string[];
  nextSteps: string[];
  itemsToConfirm?: string[];
  closingLine: string;
  signatureBlock: string;
}): string {
  let text = `${data.greeting}\n\n`;
  text += data.bodyParagraphs.join('\n\n');

  if (data.bullets && data.bullets.length > 0) {
    text += '\n\n' + data.bullets.map(b => `• ${b}`).join('\n');
  }

  if (data.nextSteps.length > 0) {
    text += '\n\nNext Steps:\n' + data.nextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  }

  if (data.itemsToConfirm && data.itemsToConfirm.length > 0) {
    text += '\n\nTo proceed, we\'ll need:\n' + data.itemsToConfirm.map(i => `• ${i}`).join('\n');
  }

  text += `\n\n${data.closingLine}\n\n${data.signatureBlock}`;

  return text;
}

