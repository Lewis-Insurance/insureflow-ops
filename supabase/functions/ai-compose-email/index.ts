import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailComposeRequest {
  scenario: EmailScenario;
  recipient_id?: string;
  recipient_type?: 'customer' | 'account' | 'lead';
  tone?: EmailTone;
  context?: {
    customer_name?: string;
    policy_type?: string;
    policy_number?: string;
    quote_amount?: number;
    renewal_date?: string;
    claim_number?: string;
    [key: string]: any;
  };
  custom_instructions?: string;
  include_signature?: boolean;
}

type EmailScenario =
  | 'lead_nurture'
  | 'quote_follow_up'
  | 'renewal_reminder'
  | 'policy_change_confirmation'
  | 'claim_status_update'
  | 'payment_reminder'
  | 'thank_you'
  | 'welcome'
  | 'coverage_gap_recommendation'
  | 'annual_review'
  | 'custom';

type EmailTone = 'professional' | 'friendly' | 'urgent' | 'empathetic' | 'celebratory';

interface EmailResult {
  subject: string;
  body: string;
  tone: EmailTone;
  scenario: EmailScenario;
  compliance_notes: string[];
  suggestions: string[];
}

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

    const requestData: EmailComposeRequest = await req.json();
    const {
      scenario,
      recipient_id,
      recipient_type,
      tone = 'professional',
      context = {},
      custom_instructions,
      include_signature = true,
    } = requestData;

    // Fetch recipient data if provided
    let recipientContext = context;

    if (recipient_id && recipient_type) {
      const additionalContext = await fetchRecipientContext(
        supabaseClient,
        recipient_id,
        recipient_type
      );
      recipientContext = { ...context, ...additionalContext };
    }

    // Fetch user profile for signature
    let signature = '';
    if (include_signature) {
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('full_name, phone, email')
        .eq('id', user.id)
        .single();

      if (profile) {
        signature = `\n\nBest regards,\n${profile.full_name || 'Your Insurance Agent'}\n${profile.phone || ''}\n${profile.email || ''}`;
      }
    }

    // Generate email content
    const emailContent = composeEmail(
      scenario,
      tone,
      recipientContext,
      custom_instructions,
      signature
    );

    return new Response(
      JSON.stringify({
        success: true,
        email: emailContent,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: unknown) {
    console.error('Error in ai-compose-email:', error);
    return new Response(
      JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

async function fetchRecipientContext(
  supabase: any,
  recipientId: string,
  recipientType: string
): Promise<Record<string, any>> {
  const context: Record<string, any> = {};

  try {
    if (recipientType === 'customer' || recipientType === 'account') {
      const { data } = await supabase
        .from('accounts')
        .select('name, email, phone, industry')
        .eq('id', recipientId)
        .single();

      if (data) {
        context.customer_name = data.name;
        context.customer_email = data.email;
        context.customer_phone = data.phone;
        context.industry = data.industry;
      }

      // Fetch active policies
      const { data: policies } = await supabase
        .from('policies')
        .select('policy_number, coverage_type, premium, expiration_date')
        .eq('account_id', recipientId)
        .eq('status', 'active')
        .limit(5);

      if (policies && policies.length > 0) {
        context.active_policies = policies;
        context.policy_count = policies.length;
      }
    } else if (recipientType === 'lead') {
      const { data } = await supabase
        .from('leads')
        .select('name, email, phone, industry, stage, lead_score')
        .eq('id', recipientId)
        .single();

      if (data) {
        context.customer_name = data.name;
        context.customer_email = data.email;
        context.customer_phone = data.phone;
        context.industry = data.industry;
        context.lead_stage = data.stage;
        context.lead_score = data.lead_score;
      }
    }
  } catch (error) {
    console.error('Error fetching recipient context:', error);
  }

  return context;
}

function composeEmail(
  scenario: EmailScenario,
  tone: EmailTone,
  context: Record<string, any>,
  customInstructions?: string,
  signature?: string
): EmailResult {
  const result: EmailResult = {
    subject: '',
    body: '',
    tone,
    scenario,
    compliance_notes: [],
    suggestions: [],
  };

  const customerName = context.customer_name || 'Valued Customer';
  const greeting = getGreeting(tone, customerName);

  switch (scenario) {
    case 'lead_nurture':
      result.subject = `Following Up: Insurance Solutions for ${customerName}`;
      result.body = `${greeting},\n\nI wanted to reach out and see if you had any questions about the insurance coverage we discussed. ${
        tone === 'friendly'
          ? "I'm here to help make sure you have the protection you need!"
          : 'I am available to provide additional information or clarify any details.'
      }\n\n${
        context.industry
          ? `As a ${context.industry} business, having the right coverage is essential to protect your operations and assets.`
          : 'Having the right insurance coverage provides peace of mind and protects what matters most.'
      }\n\nWould you be available for a brief call this week to discuss your needs?${signature || ''}`;
      result.compliance_notes.push('Ensure recipient has opted in to communications');
      result.suggestions.push('Include specific date/time options for call');
      break;

    case 'quote_follow_up':
      result.subject = context.quote_amount
        ? `Quote Ready: $${context.quote_amount.toLocaleString()} Annual Premium`
        : 'Your Insurance Quote is Ready';
      result.body = `${greeting},\n\nThank you for your interest in our insurance services. ${
        context.quote_amount
          ? `I'm pleased to present your customized quote with an annual premium of $${context.quote_amount.toLocaleString()}.`
          : "I've prepared a customized quote for your review."
      }\n\n${
        tone === 'friendly'
          ? "This coverage is tailored specifically for your needs, and I think you'll find it provides excellent value!"
          : 'This quote reflects comprehensive coverage designed to meet your specific requirements.'
      }\n\nKey Benefits:\n• Comprehensive coverage for your operations\n• Competitive pricing\n• Dedicated support\n• Flexible payment options\n\n${
        tone === 'urgent'
          ? 'This quote is valid for 30 days. I recommend we move forward soon to lock in this rate.'
          : 'Please review the attached quote details at your convenience.'
      }\n\nI'm happy to answer any questions or adjust the coverage to better suit your needs.${signature || ''}`;
      result.compliance_notes.push('Attach quote document');
      result.suggestions.push('Highlight unique value propositions');
      break;

    case 'renewal_reminder':
      result.subject = context.renewal_date
        ? `Policy Renewal: Expiring ${context.renewal_date}`
        : 'Important: Your Policy Renewal';
      result.body = `${greeting},\n\n${
        tone === 'urgent'
          ? '⚠️ ACTION REQUIRED: Your insurance policy is approaching its renewal date.'
          : 'I wanted to reach out regarding your upcoming policy renewal.'
      }\n\n${
        context.policy_number
          ? `Policy: ${context.policy_number}\n`
          : ''
      }${
        context.renewal_date
          ? `Renewal Date: ${context.renewal_date}\n`
          : ''
      }\n${
        tone === 'friendly'
          ? "Let's make sure your coverage stays current and continues to protect everything you've worked hard to build!"
          : 'To ensure continuous coverage, we need to review and renew your policy before the expiration date.'
      }\n\nNext Steps:\n1. Review your current coverage\n2. Discuss any changes to your needs\n3. Confirm renewal or explore new options\n\n${
        tone === 'urgent'
          ? 'Please contact me by [DATE] to avoid any lapse in coverage.'
          : 'Please let me know when you have time to discuss your renewal.'
      }${signature || ''}`;
      result.compliance_notes.push('Verify renewal notice requirements by state');
      result.compliance_notes.push('Include cancellation/non-renewal disclosures if required');
      result.suggestions.push('Offer to schedule renewal review meeting');
      break;

    case 'policy_change_confirmation':
      result.subject = `Confirmation: Policy Change for ${context.policy_number || 'Your Policy'}`;
      result.body = `${greeting},\n\nThis email confirms the recent change to your insurance policy.\n\n${
        context.policy_number
          ? `Policy Number: ${context.policy_number}\n`
          : ''
      }Change Description: ${context.change_description || '[Describe change here]'}\nEffective Date: ${context.effective_date || '[Date]'}\n\n${
        tone === 'friendly'
          ? "We've processed your request and your updated coverage is now in place!"
          : 'Your policy has been updated as requested.'
      }\n\n${
        context.premium_change
          ? `Premium Impact: ${context.premium_change > 0 ? '+' : ''}$${Math.abs(context.premium_change).toLocaleString()}\n\n`
          : ''
      }Please review the attached endorsement for complete details. ${
        tone === 'professional'
          ? 'Contact me if you have any questions regarding these changes.'
          : 'Let me know if you have any questions!'
      }${signature || ''}`;
      result.compliance_notes.push('Attach endorsement document');
      result.compliance_notes.push('Confirm change was authorized');
      result.suggestions.push('Provide clear summary of changes');
      break;

    case 'claim_status_update':
      result.subject = context.claim_number
        ? `Claim Update: ${context.claim_number}`
        : 'Update on Your Insurance Claim';
      result.body = `${greeting},\n\n${
        tone === 'empathetic'
          ? "I understand dealing with a claim can be stressful. I wanted to update you on where things stand."
          : 'I am writing to provide an update on your insurance claim.'
      }\n\n${
        context.claim_number
          ? `Claim Number: ${context.claim_number}\n`
          : ''
      }${
        context.claim_status
          ? `Status: ${context.claim_status}\n`
          : ''
      }\n${context.claim_update || '[Provide claim update details here]'}\n\n${
        tone === 'empathetic'
          ? "I'm here to support you through this process and answer any questions you may have."
          : 'Please contact me if you need additional information or assistance with this claim.'
      }${signature || ''}`;
      result.compliance_notes.push('Follow carrier claim communication guidelines');
      result.suggestions.push('Set clear expectations for next steps');
      result.suggestions.push('Provide direct contact for claim questions');
      break;

    case 'coverage_gap_recommendation':
      result.subject = 'Important: Coverage Gap Identified for Your Protection';
      result.body = `${greeting},\n\nAs part of our commitment to ensuring you have comprehensive protection, we recently reviewed your current insurance coverage.\n\n${
        tone === 'urgent'
          ? '⚠️ Our analysis identified important gaps in your coverage that could leave you exposed to significant risk.'
          : 'We identified some areas where additional coverage could provide better protection for your business.'
      }\n\n${
        context.identified_gaps
          ? `Key Findings:\n${context.identified_gaps}\n\n`
          : ''
      }${
        tone === 'friendly'
          ? "I'd love to walk you through these recommendations and show you how we can fill these gaps affordably."
          : 'I recommend we schedule a brief consultation to discuss these coverage opportunities.'
      }\n\n${
        context.estimated_premium_increase
          ? `Estimated additional premium: $${context.estimated_premium_increase.toLocaleString()}/year\n\n`
          : ''
      }This investment could save you from significant out-of-pocket expenses if an uninsured loss occurs.${signature || ''}`;
      result.suggestions.push('Attach detailed gap analysis report');
      result.suggestions.push('Provide specific examples of risks');
      break;

    case 'payment_reminder':
      result.subject = context.amount_due
        ? `Payment Reminder: $${context.amount_due} Due ${context.due_date || 'Soon'}`
        : 'Friendly Reminder: Payment Due';
      result.body = `${greeting},\n\n${
        tone === 'friendly'
          ? 'This is a friendly reminder that your insurance payment is coming due.'
          : 'I am writing to remind you of an upcoming payment for your insurance policy.'
      }\n\n${
        context.policy_number
          ? `Policy: ${context.policy_number}\n`
          : ''
      }${
        context.amount_due
          ? `Amount Due: $${context.amount_due.toLocaleString()}\n`
          : ''
      }${
        context.due_date
          ? `Due Date: ${context.due_date}\n`
          : ''
      }\n${
        tone === 'urgent'
          ? '⚠️ To avoid any lapse in coverage, please submit payment by the due date above.'
          : 'To ensure continuous coverage, please submit payment by the due date.'
      }\n\nPayment Options:\n• Online: [Payment Portal Link]\n• Phone: Call our office\n• Mail: [Mailing Address]\n\n${
        tone === 'friendly'
          ? "If you've already made this payment, thank you! Please disregard this reminder."
          : 'If payment has been submitted, please disregard this notice.'
      }${signature || ''}`;
      result.compliance_notes.push('Include grace period information if applicable');
      result.compliance_notes.push('Verify TCPA compliance for payment reminders');
      break;

    case 'thank_you':
      result.subject = `Thank You, ${customerName}!`;
      result.body = `${greeting},\n\n${
        tone === 'celebratory'
          ? '🎉 Thank you for choosing us for your insurance needs! We are thrilled to have you as a client.'
          : 'Thank you for your business. We truly appreciate the opportunity to serve your insurance needs.'
      }\n\n${
        tone === 'friendly'
          ? "Your trust means the world to us, and we're committed to providing you with exceptional service and protection!"
          : 'We are committed to providing you with excellent service and comprehensive protection.'
      }\n\nWhat You Can Expect:\n• Dedicated support whenever you need it\n• Proactive policy reviews\n• Quick claims assistance\n• Regular coverage updates\n\n${
        tone === 'celebratory'
          ? "Welcome to the family! Don't hesitate to reach out anytime."
          : 'Please contact me with any questions or if you need assistance.'
      }${signature || ''}`;
      result.suggestions.push('Include next steps or resources');
      result.suggestions.push('Provide contact information prominently');
      break;

    case 'welcome':
      result.subject = `Welcome to ${context.agency_name || 'Our Agency'}, ${customerName}!`;
      result.body = `${greeting},\n\nWelcome! ${
        tone === 'celebratory'
          ? "We're excited to have you as part of our insurance family!"
          : 'We are pleased to begin serving your insurance needs.'
      }\n\n${
        context.policy_type
          ? `Your ${context.policy_type} coverage is now active and protecting what matters most to you.\n\n`
          : ''
      }Getting Started:\n• Save our contact information\n• Review your policy documents\n• Download our mobile app (if available)\n• Set up your online account\n\n${
        tone === 'friendly'
          ? "I'm here to help with anything you need - questions, changes, or claims. Don't hesitate to reach out!"
          : 'Please contact me if you have questions or need assistance with your coverage.'
      }${signature || ''}`;
      result.suggestions.push('Include welcome packet or resources');
      result.suggestions.push('Provide clear next steps');
      break;

    case 'annual_review':
      result.subject = `Time for Your Annual Insurance Review`;
      result.body = `${greeting},\n\nIt's been a year since we last reviewed your insurance coverage, and I'd like to schedule time to ensure your protection is still aligned with your needs.\n\n${
        tone === 'friendly'
          ? "Life changes, businesses grow, and insurance needs evolve. Let's make sure your coverage keeps pace!"
          : 'An annual review ensures your coverage remains adequate as your circumstances change.'
      }\n\nWe'll Review:\n• Current coverage levels\n• Any life or business changes\n• Potential savings opportunities\n• Additional coverage needs\n• Carrier performance\n\n${
        context.policy_count
          ? `We'll review your ${context.policy_count} active polic${context.policy_count > 1 ? 'ies' : 'y'} to ensure everything is optimized.\n\n`
          : ''
      }${
        tone === 'professional'
          ? 'Please let me know your availability for a 30-minute review meeting.'
          : "Can we schedule 30 minutes in the next week or two? I'd love to catch up!"
      }${signature || ''}`;
      result.suggestions.push('Provide specific meeting time options');
      result.suggestions.push('Mention any policy changes or updates');
      break;

    case 'custom':
      result.subject = 'Insurance Services Update';
      result.body = `${greeting},\n\n${
        customInstructions || '[Insert custom email content here]'
      }\n\n${
        tone === 'friendly'
          ? "Looking forward to hearing from you soon!"
          : 'Please let me know if you have any questions.'
      }${signature || ''}`;
      result.suggestions.push('Customize subject line based on content');
      result.suggestions.push('Add specific call-to-action');
      break;
  }

  // General compliance notes for all emails
  result.compliance_notes.push('Ensure CAN-SPAM compliance (unsubscribe link, physical address)');
  result.compliance_notes.push('Verify recipient consent for electronic communications');

  return result;
}

function getGreeting(tone: EmailTone, name: string): string {
  switch (tone) {
    case 'friendly':
      return `Hi ${name}`;
    case 'urgent':
      return `Dear ${name}`;
    case 'empathetic':
      return `Hello ${name}`;
    case 'celebratory':
      return `Hi ${name}`;
    case 'professional':
    default:
      return `Dear ${name}`;
  }
}
