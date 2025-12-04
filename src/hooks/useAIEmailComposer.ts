import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type EmailScenario =
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

export type EmailTone = 'professional' | 'friendly' | 'urgent' | 'empathetic' | 'celebratory';

export interface EmailComposeRequest {
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

export interface EmailResult {
  subject: string;
  body: string;
  tone: EmailTone;
  scenario: EmailScenario;
  compliance_notes: string[];
  suggestions: string[];
}

export interface EmailComposerResponse {
  success: boolean;
  email: EmailResult;
}

/**
 * Hook to compose an AI-generated email
 */
export function useComposeEmail() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (request: EmailComposeRequest) => {
      const { data, error } = await supabase.functions.invoke('ai-compose-email', {
        body: request,
      });

      if (error) throw error;
      return data as EmailComposerResponse;
    },
    onSuccess: () => {
      toast({
        title: 'Email Composed',
        description: 'AI has generated your email. Review and edit as needed.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Composition Failed',
        description: error.message || 'Failed to generate email',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Email scenario configurations with metadata
 */
export const emailScenarios: Record<
  EmailScenario,
  {
    label: string;
    description: string;
    icon: string;
    recommendedTone: EmailTone;
    requiredContext?: string[];
  }
> = {
  lead_nurture: {
    label: 'Lead Nurture',
    description: 'Follow up with prospects to maintain engagement',
    icon: '🌱',
    recommendedTone: 'friendly',
  },
  quote_follow_up: {
    label: 'Quote Follow-Up',
    description: 'Follow up on a quote provided to a customer',
    icon: '💰',
    recommendedTone: 'professional',
    requiredContext: ['quote_amount'],
  },
  renewal_reminder: {
    label: 'Renewal Reminder',
    description: 'Remind customers about upcoming policy renewals',
    icon: '🔄',
    recommendedTone: 'professional',
    requiredContext: ['policy_number', 'renewal_date'],
  },
  policy_change_confirmation: {
    label: 'Policy Change Confirmation',
    description: 'Confirm changes made to an insurance policy',
    icon: '📝',
    recommendedTone: 'professional',
    requiredContext: ['policy_number'],
  },
  claim_status_update: {
    label: 'Claim Status Update',
    description: 'Update customer on the status of their claim',
    icon: '🚨',
    recommendedTone: 'empathetic',
    requiredContext: ['claim_number'],
  },
  payment_reminder: {
    label: 'Payment Reminder',
    description: 'Remind customers about upcoming or overdue payments',
    icon: '💵',
    recommendedTone: 'friendly',
    requiredContext: ['amount_due', 'due_date'],
  },
  thank_you: {
    label: 'Thank You',
    description: 'Express gratitude to customers',
    icon: '🙏',
    recommendedTone: 'friendly',
  },
  welcome: {
    label: 'Welcome Email',
    description: 'Welcome new customers to your agency',
    icon: '👋',
    recommendedTone: 'celebratory',
  },
  coverage_gap_recommendation: {
    label: 'Coverage Gap Recommendation',
    description: 'Recommend additional coverage based on gap analysis',
    icon: '🛡️',
    recommendedTone: 'professional',
  },
  annual_review: {
    label: 'Annual Review',
    description: 'Schedule annual insurance review with customers',
    icon: '📊',
    recommendedTone: 'professional',
  },
  custom: {
    label: 'Custom Email',
    description: 'Create a custom email with specific instructions',
    icon: '✏️',
    recommendedTone: 'professional',
  },
};

/**
 * Email tone configurations
 */
export const emailTones: Record<
  EmailTone,
  {
    label: string;
    description: string;
    icon: string;
  }
> = {
  professional: {
    label: 'Professional',
    description: 'Formal and business-appropriate',
    icon: '👔',
  },
  friendly: {
    label: 'Friendly',
    description: 'Warm and approachable',
    icon: '😊',
  },
  urgent: {
    label: 'Urgent',
    description: 'Conveys importance and time-sensitivity',
    icon: '⚡',
  },
  empathetic: {
    label: 'Empathetic',
    description: 'Compassionate and understanding',
    icon: '❤️',
  },
  celebratory: {
    label: 'Celebratory',
    description: 'Enthusiastic and congratulatory',
    icon: '🎉',
  },
};

/**
 * Helper to get recommended tone for a scenario
 */
export function useRecommendedTone(scenario: EmailScenario): EmailTone {
  return emailScenarios[scenario]?.recommendedTone || 'professional';
}

/**
 * Helper to validate required context for a scenario
 */
export function useValidateEmailContext(
  scenario: EmailScenario,
  context: Record<string, any>
): { isValid: boolean; missing: string[] } {
  const required = emailScenarios[scenario]?.requiredContext || [];
  const missing: string[] = [];

  for (const key of required) {
    if (!context[key]) {
      missing.push(key);
    }
  }

  return {
    isValid: missing.length === 0,
    missing,
  };
}

/**
 * Email template suggestions based on context
 */
export function useEmailTemplateSuggestions(
  recipientType?: 'customer' | 'account' | 'lead',
  context?: Record<string, any>
): EmailScenario[] {
  const suggestions: EmailScenario[] = [];

  if (recipientType === 'lead') {
    suggestions.push('lead_nurture');
    if (context?.has_quote) {
      suggestions.push('quote_follow_up');
    }
  }

  if (recipientType === 'customer' || recipientType === 'account') {
    if (context?.has_upcoming_renewal) {
      suggestions.push('renewal_reminder');
    }
    if (context?.has_coverage_gaps) {
      suggestions.push('coverage_gap_recommendation');
    }
    if (context?.has_overdue_payment) {
      suggestions.push('payment_reminder');
    }
    if (context?.is_new_customer) {
      suggestions.push('welcome');
    }

    suggestions.push('annual_review');
    suggestions.push('thank_you');
  }

  return suggestions;
}

/**
 * Email compliance checker
 */
export interface ComplianceCheck {
  passed: boolean;
  warnings: string[];
  errors: string[];
}

export function useEmailComplianceCheck(
  emailContent: string,
  scenario: EmailScenario
): ComplianceCheck {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check for basic compliance elements
  if (!emailContent.toLowerCase().includes('unsubscribe')) {
    warnings.push('Email should include unsubscribe option (CAN-SPAM)');
  }

  // Scenario-specific checks
  if (scenario === 'payment_reminder' || scenario === 'renewal_reminder') {
    if (!emailContent.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/)) {
      warnings.push('Should include specific date for payment/renewal');
    }
  }

  if (scenario === 'claim_status_update') {
    if (!emailContent.toLowerCase().includes('claim number')) {
      errors.push('Claim number should be included');
    }
  }

  if (scenario === 'policy_change_confirmation') {
    if (!emailContent.toLowerCase().includes('policy')) {
      errors.push('Policy number or reference should be included');
    }
  }

  // Check for potentially problematic language
  const problematicPhrases = [
    'guaranteed',
    'free',
    'no risk',
    'act now',
    'limited time',
  ];

  for (const phrase of problematicPhrases) {
    if (emailContent.toLowerCase().includes(phrase)) {
      warnings.push(`Consider rewording "${phrase}" to avoid spam filters`);
    }
  }

  return {
    passed: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Email personalization suggestions
 */
export function useEmailPersonalization(context: Record<string, any>): string[] {
  const suggestions: string[] = [];

  if (context.customer_name) {
    suggestions.push(`Use customer name: ${context.customer_name}`);
  }

  if (context.industry) {
    suggestions.push(`Reference industry: ${context.industry}`);
  }

  if (context.policy_count && context.policy_count > 1) {
    suggestions.push(`Mention they have ${context.policy_count} policies`);
  }

  if (context.years_as_customer) {
    suggestions.push(`Acknowledge ${context.years_as_customer} years as customer`);
  }

  if (context.recent_claim) {
    suggestions.push('Reference recent claim (if appropriate)');
  }

  return suggestions;
}
