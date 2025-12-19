/**
 * Marketing Compliance Engine - Template & Message Validation for Levitate
 *
 * This function validates marketing content for:
 * - Prohibited phrases (insurance-specific terms)
 * - State-specific regulations
 * - CAN-SPAM requirements (unsubscribe link, postal address)
 * - TCPA requirements for SMS
 * - Template merge field validation
 *
 * Can be called before sending or during template creation
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { requireAuth } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ComplianceIssue {
  field: string;
  issue: string;
  severity: 'error' | 'warning' | 'info';
  phrase?: string;
  reason?: string;
  suggestion?: string;
}

interface ComplianceResult {
  valid: boolean;
  score: number; // 0-100
  issues: ComplianceIssue[];
  classification: 'transactional' | 'relationship' | 'marketing';
  can_send: boolean;
  requires_review: boolean;
}

interface ValidateRequest {
  content_type: 'email' | 'sms';
  subject?: string;
  body_html?: string;
  body_text?: string;
  sms_message?: string;
  recipient_state?: string;
  classification?: 'transactional' | 'relationship' | 'marketing';
  template_id?: string;
  validate_merge_fields?: boolean;
  merge_context?: Record<string, unknown>;
}

// Built-in prohibited phrases (can be extended via database)
const BUILT_IN_PROHIBITED_PHRASES = [
  { phrase: 'guarantee', severity: 'warning', reason: 'Insurance cannot guarantee outcomes' },
  { phrase: 'guaranteed', severity: 'warning', reason: 'Insurance cannot guarantee outcomes' },
  { phrase: 'risk-free', severity: 'error', reason: 'No insurance is risk-free' },
  { phrase: 'no obligation', severity: 'warning', reason: 'May be misleading' },
  { phrase: 'act now', severity: 'warning', reason: 'Urgency tactics may violate regulations' },
  { phrase: 'limited time', severity: 'warning', reason: 'Urgency tactics may violate regulations' },
  { phrase: 'best price', severity: 'warning', reason: 'Cannot promise best price without comparison' },
  { phrase: 'lowest rate', severity: 'warning', reason: 'Cannot promise lowest rate without comparison' },
  { phrase: 'free quote', severity: 'info', reason: 'Consider "no-cost quote" instead' },
  { phrase: 'call immediately', severity: 'warning', reason: 'High-pressure tactic' },
];

// Required elements for CAN-SPAM compliance
const CAN_SPAM_REQUIREMENTS = {
  marketing: {
    unsubscribe_link: true,
    postal_address: true,
    from_accurate: true,
    subject_not_deceptive: true,
  },
  relationship: {
    unsubscribe_link: true,
    postal_address: false,
    from_accurate: true,
    subject_not_deceptive: true,
  },
  transactional: {
    unsubscribe_link: false,
    postal_address: false,
    from_accurate: true,
    subject_not_deceptive: true,
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }
    const user = authResult;

    const body: ValidateRequest = await req.json();
    console.log(`🔍 Validating ${body.content_type} content...`);

    const result = await validateContent(supabase, body, user.id);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Compliance engine error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function validateContent(
  supabase: SupabaseClient,
  request: ValidateRequest,
  userId: string
): Promise<ComplianceResult> {
  const issues: ComplianceIssue[] = [];
  let score = 100;

  // Get user's org_id for loading org-specific rules
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .maybeSingle();

  const orgId = profile?.org_id;

  // Combine all text content for analysis
  const allContent = [
    request.subject || '',
    request.body_html || '',
    request.body_text || '',
    request.sms_message || '',
  ].join(' ').toLowerCase();

  // Determine classification if not provided
  const classification = request.classification || detectClassification(allContent);

  // 1. Check prohibited phrases
  const prohibitedIssues = await checkProhibitedPhrases(supabase, allContent, orgId, request.content_type);
  issues.push(...prohibitedIssues);

  // 2. Check state-specific rules
  if (request.recipient_state) {
    const stateIssues = await checkStateRules(supabase, allContent, request.recipient_state, orgId);
    issues.push(...stateIssues);
  }

  // 3. Check CAN-SPAM / TCPA requirements
  if (request.content_type === 'email') {
    const canSpamIssues = checkCanSpamCompliance(request, classification);
    issues.push(...canSpamIssues);
  } else if (request.content_type === 'sms') {
    const tcpaIssues = checkTcpaCompliance(request);
    issues.push(...tcpaIssues);
  }

  // 4. Check merge fields if requested
  if (request.validate_merge_fields) {
    const mergeIssues = validateMergeFields(allContent, request.merge_context);
    issues.push(...mergeIssues);
  }

  // 5. Check subject line (email only)
  if (request.content_type === 'email' && request.subject) {
    const subjectIssues = checkSubjectLine(request.subject);
    issues.push(...subjectIssues);
  }

  // 6. Check SMS length
  if (request.content_type === 'sms' && request.sms_message) {
    const smsIssues = checkSmsLength(request.sms_message);
    issues.push(...smsIssues);
  }

  // Calculate score based on issues
  for (const issue of issues) {
    if (issue.severity === 'error') score -= 25;
    else if (issue.severity === 'warning') score -= 10;
    else if (issue.severity === 'info') score -= 2;
  }

  score = Math.max(0, Math.min(100, score));

  const hasErrors = issues.some(i => i.severity === 'error');
  const hasWarnings = issues.some(i => i.severity === 'warning');

  return {
    valid: !hasErrors,
    score,
    issues,
    classification,
    can_send: !hasErrors,
    requires_review: hasWarnings && score < 70,
  };
}

function detectClassification(content: string): 'transactional' | 'relationship' | 'marketing' {
  const transactionalKeywords = [
    'policy renewal', 'claim update', 'payment confirmation',
    'policy change', 'coverage update', 'billing statement',
    'password reset', 'account verification'
  ];

  const relationshipKeywords = [
    'happy birthday', 'anniversary', 'thank you for being a customer',
    'holiday greetings', 'checking in', 'just wanted to say'
  ];

  const lower = content.toLowerCase();

  if (transactionalKeywords.some(kw => lower.includes(kw))) {
    return 'transactional';
  }

  if (relationshipKeywords.some(kw => lower.includes(kw))) {
    return 'relationship';
  }

  return 'marketing';
}

async function checkProhibitedPhrases(
  supabase: SupabaseClient,
  content: string,
  orgId: string | null,
  channel: string
): Promise<ComplianceIssue[]> {
  const issues: ComplianceIssue[] = [];

  // Load org-specific prohibited phrases
  let dbPhrases: { phrase: string; severity: string; reason: string }[] = [];

  if (orgId) {
    const { data } = await supabase
      .from('prohibited_phrases')
      .select('phrase, severity, reason')
      .eq('is_active', true)
      .or(`org_id.eq.${orgId},org_id.is.null`)
      .or(`applies_to_channels.is.null,applies_to_channels.cs.{${channel}}`);

    dbPhrases = data || [];
  }

  // Combine built-in and database phrases
  const allPhrases = [
    ...BUILT_IN_PROHIBITED_PHRASES,
    ...dbPhrases.map(p => ({
      phrase: p.phrase,
      severity: p.severity as 'error' | 'warning' | 'info',
      reason: p.reason,
    })),
  ];

  for (const rule of allPhrases) {
    if (content.includes(rule.phrase.toLowerCase())) {
      issues.push({
        field: 'content',
        issue: 'prohibited_phrase',
        severity: rule.severity as 'error' | 'warning' | 'info',
        phrase: rule.phrase,
        reason: rule.reason,
      });
    }
  }

  return issues;
}

async function checkStateRules(
  supabase: SupabaseClient,
  content: string,
  state: string,
  orgId: string | null
): Promise<ComplianceIssue[]> {
  const issues: ComplianceIssue[] = [];

  // Load state-specific rules
  const { data: stateRules } = await supabase
    .from('state_communication_rules')
    .select('*')
    .eq('state_code', state.toUpperCase())
    .eq('is_active', true);

  if (stateRules) {
    for (const rule of stateRules) {
      if (rule.prohibited_phrases) {
        for (const phrase of rule.prohibited_phrases) {
          if (content.includes(phrase.toLowerCase())) {
            issues.push({
              field: 'content',
              issue: 'state_prohibited_phrase',
              severity: 'error',
              phrase,
              reason: `Prohibited in ${state}: ${rule.regulation_name || 'state regulation'}`,
            });
          }
        }
      }

      if (rule.required_disclosures) {
        for (const disclosure of rule.required_disclosures) {
          if (!content.includes(disclosure.toLowerCase())) {
            issues.push({
              field: 'content',
              issue: 'missing_state_disclosure',
              severity: 'warning',
              reason: `${state} requires: "${disclosure}"`,
              suggestion: `Add required disclosure: "${disclosure}"`,
            });
          }
        }
      }
    }
  }

  return issues;
}

function checkCanSpamCompliance(request: ValidateRequest, classification: string): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const requirements = CAN_SPAM_REQUIREMENTS[classification as keyof typeof CAN_SPAM_REQUIREMENTS];

  if (!requirements) return issues;

  const allContent = (request.body_html || '') + (request.body_text || '');

  // Check for unsubscribe link
  if (requirements.unsubscribe_link) {
    const hasUnsubscribe =
      allContent.toLowerCase().includes('unsubscribe') ||
      allContent.includes('opt-out') ||
      allContent.includes('opt out') ||
      allContent.includes('manage preferences');

    if (!hasUnsubscribe) {
      issues.push({
        field: 'body',
        issue: 'missing_unsubscribe',
        severity: 'error',
        reason: 'CAN-SPAM requires an unsubscribe mechanism',
        suggestion: 'Add an unsubscribe link or "manage preferences" link',
      });
    }
  }

  // Check for postal address
  if (requirements.postal_address) {
    // Simple check for address pattern
    const hasAddress =
      /\d+\s+[a-zA-Z]/.test(allContent) &&
      (allContent.includes('Suite') ||
       allContent.includes('Floor') ||
       allContent.includes('St') ||
       allContent.includes('Street') ||
       allContent.includes('Ave') ||
       allContent.includes('Rd') ||
       /\d{5}(-\d{4})?/.test(allContent)); // ZIP code

    if (!hasAddress) {
      issues.push({
        field: 'body',
        issue: 'missing_postal_address',
        severity: 'warning',
        reason: 'CAN-SPAM requires a valid postal address for marketing emails',
        suggestion: 'Add your business physical address to the email footer',
      });
    }
  }

  return issues;
}

function checkTcpaCompliance(request: ValidateRequest): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const message = request.sms_message || '';

  // Check for opt-out instructions
  const hasOptOut =
    message.toLowerCase().includes('stop') ||
    message.toLowerCase().includes('opt out') ||
    message.toLowerCase().includes('unsubscribe');

  if (!hasOptOut && request.classification === 'marketing') {
    issues.push({
      field: 'sms_message',
      issue: 'missing_optout',
      severity: 'warning',
      reason: 'TCPA recommends clear opt-out instructions for marketing SMS',
      suggestion: 'Add "Reply STOP to opt out" or similar',
    });
  }

  // Check for sender identification
  const hasSenderName =
    message.toLowerCase().includes('from') ||
    /\b[A-Z][a-z]+\s+insurance\b/i.test(message);

  if (!hasSenderName) {
    issues.push({
      field: 'sms_message',
      issue: 'unclear_sender',
      severity: 'info',
      reason: 'Best practice to identify your business in SMS',
      suggestion: 'Include your business name in the message',
    });
  }

  return issues;
}

function validateMergeFields(content: string, context?: Record<string, unknown>): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  // Find all merge fields
  const mergeFieldRegex = /\{\{([^}]+)\}\}/g;
  const matches = content.matchAll(mergeFieldRegex);

  for (const match of matches) {
    const fieldName = match[1].trim();

    // Check if field exists in context
    if (context && !(fieldName in context)) {
      issues.push({
        field: 'merge_field',
        issue: 'missing_merge_value',
        severity: 'warning',
        phrase: `{{${fieldName}}}`,
        reason: `Merge field "${fieldName}" has no value in context`,
        suggestion: `Provide a value for {{${fieldName}}} or add a fallback`,
      });
    }

    // Check for empty values
    if (context && fieldName in context && !context[fieldName]) {
      issues.push({
        field: 'merge_field',
        issue: 'empty_merge_value',
        severity: 'info',
        phrase: `{{${fieldName}}}`,
        reason: `Merge field "${fieldName}" is empty`,
      });
    }
  }

  return issues;
}

function checkSubjectLine(subject: string): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  // Check length
  if (subject.length > 78) {
    issues.push({
      field: 'subject',
      issue: 'subject_too_long',
      severity: 'warning',
      reason: 'Subject lines over 78 characters may be truncated',
      suggestion: 'Keep subject line under 78 characters',
    });
  }

  // Check for spam trigger words
  const spamTriggers = ['free', 'winner', 'cash', '!!!', 'urgent', 'act now', 'limited time'];
  const lowerSubject = subject.toLowerCase();

  for (const trigger of spamTriggers) {
    if (lowerSubject.includes(trigger)) {
      issues.push({
        field: 'subject',
        issue: 'spam_trigger_word',
        severity: 'info',
        phrase: trigger,
        reason: `"${trigger}" may trigger spam filters`,
      });
    }
  }

  // Check for ALL CAPS
  if (subject === subject.toUpperCase() && subject.length > 10) {
    issues.push({
      field: 'subject',
      issue: 'all_caps',
      severity: 'warning',
      reason: 'ALL CAPS subject lines may appear as spam',
      suggestion: 'Use normal capitalization',
    });
  }

  // Check for deceptive patterns
  if (subject.startsWith('Re:') || subject.startsWith('Fwd:')) {
    issues.push({
      field: 'subject',
      issue: 'deceptive_subject',
      severity: 'error',
      reason: 'Fake Re:/Fwd: prefixes violate CAN-SPAM',
      suggestion: 'Remove Re: or Fwd: prefix from marketing emails',
    });
  }

  return issues;
}

function checkSmsLength(message: string): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  // Check for unicode
  const hasUnicode = /[^\x00-\x7F]/.test(message);

  const maxLength = hasUnicode ? 70 : 160;
  const concatMaxLength = hasUnicode ? 67 : 153;

  if (message.length > maxLength) {
    const segments = Math.ceil(message.length / concatMaxLength);

    if (segments > 4) {
      issues.push({
        field: 'sms_message',
        issue: 'sms_too_long',
        severity: 'error',
        reason: `Message requires ${segments} segments which may fail delivery`,
        suggestion: 'Keep SMS under 612 characters (4 segments)',
      });
    } else if (segments > 2) {
      issues.push({
        field: 'sms_message',
        issue: 'sms_multiple_segments',
        severity: 'warning',
        reason: `Message requires ${segments} segments (higher cost)`,
        suggestion: `Reduce message length for single segment (${maxLength} chars)`,
      });
    } else {
      issues.push({
        field: 'sms_message',
        issue: 'sms_multiple_segments',
        severity: 'info',
        reason: `Message requires ${segments} segments`,
      });
    }
  }

  if (hasUnicode) {
    issues.push({
      field: 'sms_message',
      issue: 'unicode_detected',
      severity: 'info',
      reason: 'Unicode characters reduce SMS capacity to 70 chars/segment',
    });
  }

  return issues;
}
