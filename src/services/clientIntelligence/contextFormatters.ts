/**
 * Context Formatters
 * 
 * Functions to format each data type into AI-friendly text
 */

import type {
  AccountData,
  ContactData,
  PolicyData,
  ClaimData,
  DocumentData,
  TaskData,
  CallData,
  MessageData,
  EventData,
  QuoteData,
} from '@/types/client-intelligence';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return 'N/A';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function isExpired(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// =============================================================================
// ACCOUNT FORMATTER
// =============================================================================

export function formatAccount(account: AccountData): string {
  const lines: string[] = [
    '## CLIENT PROFILE',
    '',
    `**Name:** ${account.name}`,
    `**Type:** ${account.account_type || 'Not specified'}`,
    `**Status:** ${account.account_status || 'Not specified'}`,
    '',
  ];

  // Contact info
  if (account.phone || account.email) {
    lines.push('### Contact Information');
    if (account.phone) lines.push(`- Phone: ${account.phone}`);
    if (account.email) lines.push(`- Email: ${account.email}`);
    lines.push('');
  }

  // Address
  if (account.address_line1 || account.city) {
    lines.push('### Address');
    if (account.address_line1) lines.push(`- ${account.address_line1}`);
    if (account.address_line2) lines.push(`- ${account.address_line2}`);
    if (account.city || account.state || account.zip_code) {
      lines.push(`- ${[account.city, account.state, account.zip_code].filter(Boolean).join(', ')}`);
    }
    lines.push('');
  }

  // Source
  if (account.source || account.lead_source_detail) {
    lines.push('### Lead Source');
    if (account.source) lines.push(`- Source: ${account.source}`);
    if (account.lead_source_detail) lines.push(`- Details: ${account.lead_source_detail}`);
    lines.push('');
  }

  // Tags
  if (account.tags && account.tags.length > 0) {
    lines.push('### Tags');
    lines.push(account.tags.map(t => `- ${t.name}`).join('\n'));
    lines.push('');
  }

  // Notes
  if (account.notes) {
    lines.push('### Account Notes');
    lines.push(truncateText(account.notes, 2000));
    lines.push('');
  }

  // Custom fields
  if (account.custom && Object.keys(account.custom).length > 0) {
    lines.push('### Custom Fields');
    for (const [key, value] of Object.entries(account.custom)) {
      if (value != null) {
        lines.push(`- ${key}: ${String(value)}`);
      }
    }
    lines.push('');
  }

  // Dates
  lines.push('### Account History');
  lines.push(`- Created: ${formatDate(account.created_at)}`);
  lines.push(`- Last Updated: ${formatDate(account.updated_at)}`);
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// CONTACTS FORMATTER
// =============================================================================

export function formatContacts(contacts: ContactData[]): string {
  if (contacts.length === 0) {
    return '## CONTACTS\n\nNo contacts on file.\n';
  }

  const lines: string[] = [
    '## CONTACTS',
    '',
    `Total: ${contacts.length} contact(s)`,
    '',
  ];

  // Sort: primary first, then by created date
  const sorted = [...contacts].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  for (const contact of sorted) {
    const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unnamed';
    const primary = contact.is_primary ? ' (PRIMARY)' : '';
    const role = contact.role ? ` - ${contact.role}` : '';
    
    lines.push(`### ${name}${primary}${role}`);
    if (contact.email) lines.push(`- Email: ${contact.email}`);
    if (contact.phone) lines.push(`- Phone: ${contact.phone}`);
    lines.push('');
  }

  return lines.join('\n');
}

// =============================================================================
// POLICIES FORMATTER
// =============================================================================

export function formatPolicies(policies: PolicyData[]): string {
  if (policies.length === 0) {
    return '## POLICIES\n\nNo policies on file.\n';
  }

  // Separate active vs expired
  const active = policies.filter(p => !isExpired(p.expiration_date));
  const expired = policies.filter(p => isExpired(p.expiration_date));

  const lines: string[] = [
    '## POLICIES',
    '',
    `Total: ${policies.length} policy(ies) (${active.length} active, ${expired.length} expired/past)`,
    '',
  ];

  // Calculate total premium
  const totalPremium = policies.reduce((sum, p) => sum + (p.premium || 0), 0);
  const activePremium = active.reduce((sum, p) => sum + (p.premium || 0), 0);
  lines.push(`**Total Premium:** ${formatCurrency(totalPremium)} (Active: ${formatCurrency(activePremium)})`);
  lines.push('');

  // Active policies first
  if (active.length > 0) {
    lines.push('### Active Policies');
    lines.push('');
    for (const policy of active) {
      lines.push(formatSinglePolicy(policy, true));
    }
  }

  // Expired policies (summarized if many)
  if (expired.length > 0) {
    lines.push('### Expired/Past Policies');
    lines.push('');
    
    // Show full details for recent 5, summarize rest
    const recentExpired = expired.slice(0, 5);
    const olderExpired = expired.slice(5);

    for (const policy of recentExpired) {
      lines.push(formatSinglePolicy(policy, false));
    }

    if (olderExpired.length > 0) {
      lines.push(`*Plus ${olderExpired.length} older expired policies not shown in detail.*`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatSinglePolicy(policy: PolicyData, showDetails: boolean): string {
  const carrier = policy.carrier_info?.name || policy.carrier || 'Unknown Carrier';
  const daysToExpiry = daysUntil(policy.expiration_date);
  
  let expiryNote = '';
  if (daysToExpiry !== null) {
    if (daysToExpiry < 0) {
      expiryNote = ` (EXPIRED ${Math.abs(daysToExpiry)} days ago)`;
    } else if (daysToExpiry <= 30) {
      expiryNote = ` (EXPIRING in ${daysToExpiry} days!)`;
    } else if (daysToExpiry <= 60) {
      expiryNote = ` (expiring in ${daysToExpiry} days)`;
    }
  }

  const lines: string[] = [
    `**${policy.policy_number}** - ${policy.line_of_business || 'Unknown LOB'}`,
    `- Carrier: ${carrier}`,
    `- Premium: ${formatCurrency(policy.premium)}`,
    `- Effective: ${formatDate(policy.effective_date)} to ${formatDate(policy.expiration_date)}${expiryNote}`,
    `- Status: ${policy.status || 'Unknown'}`,
  ];

  if (showDetails) {
    if (policy.mga_info) {
      lines.push(`- MGA: ${policy.mga_info.name}`);
    }
    if (policy.coverage_summary) {
      lines.push(`- Coverage: ${truncateText(policy.coverage_summary, 500)}`);
    }
    if (policy.notes) {
      lines.push(`- Notes: ${truncateText(policy.notes, 300)}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// =============================================================================
// CLAIMS FORMATTER
// =============================================================================

export function formatClaims(claims: ClaimData[]): string {
  if (claims.length === 0) {
    return '## CLAIMS HISTORY\n\nNo claims on file.\n';
  }

  // Separate open vs closed
  const open = claims.filter(c => c.status === 'open' || c.status === 'pending' || c.status === 'in_review');
  const closed = claims.filter(c => !open.includes(c));

  const lines: string[] = [
    '## CLAIMS HISTORY',
    '',
    `Total: ${claims.length} claim(s) (${open.length} open, ${closed.length} closed)`,
    '',
  ];

  // Calculate totals
  const totalClaimed = claims.reduce((sum, c) => sum + (c.amount_claimed || 0), 0);
  const totalPaid = claims.reduce((sum, c) => sum + (c.amount_paid || 0), 0);
  lines.push(`**Total Claimed:** ${formatCurrency(totalClaimed)} | **Total Paid:** ${formatCurrency(totalPaid)}`);
  lines.push('');

  // Open claims with full details
  if (open.length > 0) {
    lines.push('### Open Claims');
    lines.push('');
    for (const claim of open) {
      lines.push(formatSingleClaim(claim, true));
    }
  }

  // Closed claims (summarized)
  if (closed.length > 0) {
    lines.push('### Closed Claims');
    lines.push('');
    
    // Recent 10 with details, rest summarized
    const recent = closed.slice(0, 10);
    const older = closed.slice(10);

    for (const claim of recent) {
      lines.push(formatSingleClaim(claim, false));
    }

    if (older.length > 0) {
      const olderTotal = older.reduce((sum, c) => sum + (c.amount_paid || 0), 0);
      lines.push(`*Plus ${older.length} older closed claims totaling ${formatCurrency(olderTotal)} paid.*`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatSingleClaim(claim: ClaimData, showDetails: boolean): string {
  const lossDate = claim.loss_date || claim.date_of_loss;
  const policyInfo = claim.policy 
    ? `${claim.policy.policy_number} (${claim.policy.line_of_business || 'Unknown'})`
    : 'Unknown Policy';

  const lines: string[] = [
    `**Claim #${claim.claim_number}** - ${claim.type_of_loss || 'Unknown Type'}`,
    `- Policy: ${policyInfo}`,
    `- Status: ${claim.status.toUpperCase()}`,
    `- Loss Date: ${formatDate(lossDate)}`,
    `- Claimed: ${formatCurrency(claim.amount_claimed)} | Paid: ${formatCurrency(claim.amount_paid)}`,
  ];

  if (showDetails) {
    if (claim.description) {
      lines.push(`- Description: ${truncateText(claim.description, 500)}`);
    }
    if (claim.adjuster_name) {
      lines.push(`- Adjuster: ${claim.adjuster_name}${claim.adjuster_contact ? ` (${claim.adjuster_contact})` : ''}`);
    }
    if (claim.notes) {
      lines.push(`- Notes: ${truncateText(claim.notes, 300)}`);
    }
  }

  if (claim.settlement_date) {
    lines.push(`- Settled: ${formatDate(claim.settlement_date)}`);
  }

  lines.push('');
  return lines.join('\n');
}

// =============================================================================
// DOCUMENTS FORMATTER
// =============================================================================

export function formatDocuments(documents: DocumentData[], includeExtractedText: boolean = true): string {
  if (documents.length === 0) {
    return '## DOCUMENTS\n\nNo documents on file.\n';
  }

  const lines: string[] = [
    '## DOCUMENTS',
    '',
    `Total: ${documents.length} document(s)`,
    '',
  ];

  // Group by type/category
  const byCategory: Record<string, DocumentData[]> = {};
  for (const doc of documents) {
    const cat = doc.category || doc.document_type || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(doc);
  }

  for (const [category, docs] of Object.entries(byCategory)) {
    lines.push(`### ${category} (${docs.length})`);
    lines.push('');

    for (const doc of docs.slice(0, 10)) { // Limit per category
      lines.push(`**${doc.file_name || 'Unnamed Document'}**`);
      lines.push(`- Type: ${doc.document_type || 'Unknown'}`);
      lines.push(`- Uploaded: ${formatDate(doc.created_at)}`);
      
      if (includeExtractedText && doc.extracted_text) {
        // Truncate extracted text to prevent context overflow
        const truncated = truncateText(doc.extracted_text, 3000);
        lines.push(`- Extracted Content:`);
        lines.push('```');
        lines.push(truncated);
        lines.push('```');
      }
      lines.push('');
    }

    if (docs.length > 10) {
      lines.push(`*Plus ${docs.length - 10} more ${category} documents not shown.*`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// =============================================================================
// TASKS FORMATTER
// =============================================================================

export function formatTasks(tasks: TaskData[]): string {
  if (tasks.length === 0) {
    return '## TASKS\n\nNo tasks on file.\n';
  }

  const open = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const completed = tasks.filter(t => t.status === 'completed');
  const cancelled = tasks.filter(t => t.status === 'cancelled');

  const lines: string[] = [
    '## TASKS',
    '',
    `Total: ${tasks.length} task(s) (${open.length} open, ${completed.length} completed, ${cancelled.length} cancelled)`,
    '',
  ];

  // Open tasks with details
  if (open.length > 0) {
    lines.push('### Open Tasks');
    lines.push('');
    
    // Sort by due date
    const sorted = [...open].sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

    for (const task of sorted) {
      const overdue = task.due_date && new Date(task.due_date) < new Date();
      const priority = task.priority ? ` [${task.priority.toUpperCase()}]` : '';
      const dueStr = task.due_date ? ` - Due: ${formatDate(task.due_date)}${overdue ? ' (OVERDUE!)' : ''}` : '';
      
      lines.push(`- **${task.title}**${priority}${dueStr}`);
      if (task.description) {
        lines.push(`  ${truncateText(task.description, 200)}`);
      }
    }
    lines.push('');
  }

  // Recent completed tasks (summary)
  if (completed.length > 0) {
    lines.push('### Recently Completed Tasks');
    const recent = completed.slice(0, 10);
    for (const task of recent) {
      lines.push(`- ${task.title} (completed ${formatDate(task.completed_at)})`);
    }
    if (completed.length > 10) {
      lines.push(`*Plus ${completed.length - 10} more completed tasks.*`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// =============================================================================
// COMMUNICATIONS FORMATTER
// =============================================================================

export function formatCommunications(
  calls: CallData[],
  messages: MessageData[],
  events: EventData[]
): string {
  const totalComms = calls.length + messages.length + events.length;
  
  if (totalComms === 0) {
    return '## COMMUNICATION HISTORY\n\nNo communication history on file.\n';
  }

  const lines: string[] = [
    '## COMMUNICATION HISTORY',
    '',
    `Total: ${totalComms} interaction(s) (${calls.length} calls, ${messages.length} messages, ${events.length} events)`,
    '',
  ];

  // Calls
  if (calls.length > 0) {
    lines.push('### Phone Calls');
    lines.push('');
    
    const recentCalls = calls.slice(0, 20);
    for (const call of recentCalls) {
      const direction = call.direction === 'inbound' ? '📥' : '📤';
      const duration = formatDuration(call.duration);
      const date = formatDate(call.started_at || call.created_at);
      
      lines.push(`${direction} **${date}** - ${call.status || 'Unknown'} (${duration})`);
      if (call.notes) {
        lines.push(`  Notes: ${truncateText(call.notes, 200)}`);
      }
    }
    
    if (calls.length > 20) {
      lines.push(`*Plus ${calls.length - 20} more calls not shown.*`);
    }
    lines.push('');
  }

  // Messages
  if (messages.length > 0) {
    lines.push('### Text Messages');
    lines.push('');
    
    const recentMessages = messages.slice(0, 20);
    for (const msg of recentMessages) {
      const direction = msg.direction === 'inbound' ? '📥' : '📤';
      const date = formatDate(msg.created_at);
      const body = truncateText(msg.body, 150);
      
      lines.push(`${direction} **${date}**: ${body}`);
    }
    
    if (messages.length > 20) {
      lines.push(`*Plus ${messages.length - 20} more messages not shown.*`);
    }
    lines.push('');
  }

  // Events
  if (events.length > 0) {
    lines.push('### Activity Events');
    lines.push('');
    
    const recentEvents = events.slice(0, 30);
    for (const event of recentEvents) {
      const date = formatDate(event.occurred_at || event.created_at);
      const type = event.event_type || 'Activity';
      const title = event.title || event.description || 'No description';
      
      lines.push(`- **${date}** [${type}]: ${truncateText(title, 200)}`);
    }
    
    if (events.length > 30) {
      lines.push(`*Plus ${events.length - 30} more events not shown.*`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// =============================================================================
// QUOTES FORMATTER
// =============================================================================

export function formatQuotes(quotes: QuoteData[]): string {
  if (quotes.length === 0) {
    return '## QUOTE HISTORY\n\nNo quotes on file.\n';
  }

  // Separate active vs old
  const active = quotes.filter(q => q.status === 'pending' || q.status === 'sent' || q.status === 'draft');
  const other = quotes.filter(q => !active.includes(q));

  const lines: string[] = [
    '## QUOTE HISTORY',
    '',
    `Total: ${quotes.length} quote(s) (${active.length} active)`,
    '',
  ];

  // Active quotes
  if (active.length > 0) {
    lines.push('### Active Quotes');
    lines.push('');
    for (const quote of active) {
      lines.push(formatSingleQuote(quote));
    }
  }

  // Other quotes (recent 10)
  if (other.length > 0) {
    lines.push('### Past Quotes');
    lines.push('');
    for (const quote of other.slice(0, 10)) {
      lines.push(formatSingleQuote(quote));
    }
    if (other.length > 10) {
      lines.push(`*Plus ${other.length - 10} more past quotes not shown.*`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatSingleQuote(quote: QuoteData): string {
  const carrier = quote.carrier_info?.name || quote.carrier || 'Unknown Carrier';
  
  const lines: string[] = [
    `**${quote.quote_number || 'No Quote #'}** - ${quote.line_of_business || 'Unknown LOB'}`,
    `- Carrier: ${carrier}`,
    `- Premium: ${formatCurrency(quote.premium)}`,
    `- Status: ${quote.status || 'Unknown'}`,
    `- Created: ${formatDate(quote.created_at)}`,
  ];

  if (quote.notes) {
    lines.push(`- Notes: ${truncateText(quote.notes, 200)}`);
  }

  lines.push('');
  return lines.join('\n');
}

