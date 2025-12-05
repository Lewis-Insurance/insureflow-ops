/**
 * AI Email Composer Hooks
 *
 * Hooks for AI-powered email composition with template management,
 * communication tracking, and engagement analytics.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================================
// Types
// ============================================================================

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

export type CommunicationType = 'email' | 'sms' | 'portal_message' | 'phone' | 'in_person';

export type CommunicationStatus =
  | 'draft'
  | 'scheduled'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'replied'
  | 'bounced'
  | 'failed';

export interface EmailTemplate {
  id: string;
  template_name: string;
  template_category: string;
  template_description?: string;
  subject_template: string;
  body_template: string;
  available_variables?: string[];
  tone?: EmailTone;
  target_audience?: string;
  usage_count?: number;
  avg_response_rate?: number;
  last_used_at?: string;
  is_active: boolean;
}

export interface CommunicationHistory {
  id: string;
  account_id: string;
  user_id: string;
  template_id?: string;
  communication_type: CommunicationType;
  subject?: string;
  message_body: string;
  ai_generated: boolean;
  ai_confidence_score?: number;
  template_used?: string;
  tone_used?: string;
  status: CommunicationStatus;
  sent_at?: string;
  delivered_at?: string;
  opened_at?: string;
  replied_at?: string;
  open_count: number;
  click_count: number;
  compliance_checked: boolean;
  compliance_passed?: boolean;
  compliance_notes?: string;
  context_data?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ComposeEmailRequest {
  scenario: EmailScenario;
  recipient_id?: string;
  recipient_type?: 'customer' | 'account' | 'lead';
  tone?: EmailTone;
  context?: Record<string, any>;
  custom_instructions?: string;
  include_signature?: boolean;
}

export interface ComposeEmailResponse {
  success: boolean;
  email: {
    subject: string;
    body: string;
    tone: EmailTone;
    scenario: EmailScenario;
    compliance_notes: string[];
    suggestions: string[];
  };
}

export interface SaveCommunicationRequest {
  account_id: string;
  communication_type: CommunicationType;
  subject?: string;
  message_body: string;
  ai_generated?: boolean;
  ai_confidence_score?: number;
  template_used?: string;
  tone_used?: string;
  status?: CommunicationStatus;
  context_data?: Record<string, any>;
  template_id?: string;
}

// ============================================================================
// Email Templates Hooks
// ============================================================================

/**
 * Fetch all active email templates
 */
export function useEmailTemplates(category?: string) {
  return useQuery({
    queryKey: ['email-templates', category],
    queryFn: async () => {
      let query = supabase
        .from('email_templates')
        .select('*')
        .eq('is_active', true)
        .order('usage_count', { ascending: false });

      if (category) {
        query = query.eq('template_category', category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as EmailTemplate[];
    },
  });
}

/**
 * Fetch top-performing email templates
 */
export function useTopEmailTemplates() {
  return useQuery({
    queryKey: ['email-templates', 'top'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('top_email_templates')
        .select('*');

      if (error) throw error;
      return data as EmailTemplate[];
    },
  });
}

/**
 * Get recommended templates for a specific account
 */
export function useRecommendedTemplates(accountId: string, category?: string) {
  return useQuery({
    queryKey: ['email-templates', 'recommended', accountId, category],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_recommended_templates', {
        p_account_id: accountId,
        p_category: category || null,
      });

      if (error) throw error;
      return data;
    },
    enabled: !!accountId,
  });
}

// ============================================================================
// Email Composition Hooks
// ============================================================================

/**
 * Compose an email using AI with context and templates
 */
export function useComposeEmail() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (request: ComposeEmailRequest) => {
      const { data, error } = await supabase.functions.invoke('ai-compose-email', {
        body: request,
      });

      if (error) throw error;
      return data as ComposeEmailResponse;
    },
    onError: (error: Error) => {
      toast({
        title: 'Email Composition Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Save composed email to communication history
 */
export function useSaveCommunication() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (request: SaveCommunicationRequest) => {
      const { data, error } = await supabase
        .from('communication_history')
        .insert([request])
        .select()
        .single();

      if (error) throw error;
      return data as CommunicationHistory;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['communication-history'] });
      queryClient.invalidateQueries({ queryKey: ['communication-history', data.account_id] });

      toast({
        title: 'Communication Saved',
        description: `${data.communication_type} saved as ${data.status}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Save Communication',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Update communication status (e.g., sent → delivered → opened)
 */
export function useUpdateCommunicationStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      communicationId,
      status,
    }: {
      communicationId: string;
      status: CommunicationStatus;
    }) => {
      const updates: any = { status, updated_at: new Date().toISOString() };

      if (status === 'sent') {
        updates.sent_at = new Date().toISOString();
      } else if (status === 'delivered') {
        updates.delivered_at = new Date().toISOString();
      } else if (status === 'opened') {
        updates.opened_at = new Date().toISOString();
      } else if (status === 'replied') {
        updates.replied_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('communication_history')
        .update(updates)
        .eq('id', communicationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communication-history'] });
    },
  });
}

/**
 * Compose and send email in one operation
 */
export function useComposeAndSendEmail() {
  const composeEmail = useComposeEmail();
  const saveCommunication = useSaveCommunication();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      accountId,
      composeRequest,
      sendImmediately = false,
    }: {
      accountId: string;
      composeRequest: ComposeEmailRequest;
      sendImmediately?: boolean;
    }) => {
      // Step 1: Compose email with AI
      const composedEmail = await composeEmail.mutateAsync(composeRequest);

      if (!composedEmail.success) {
        throw new Error('Failed to compose email');
      }

      // Step 2: Save to communication history
      const communication = await saveCommunication.mutateAsync({
        account_id: accountId,
        communication_type: 'email',
        subject: composedEmail.email.subject,
        message_body: composedEmail.email.body,
        ai_generated: true,
        tone_used: composedEmail.email.tone,
        status: sendImmediately ? 'sent' : 'draft',
        context_data: {
          scenario: composedEmail.email.scenario,
          compliance_notes: composedEmail.email.compliance_notes,
          suggestions: composedEmail.email.suggestions,
        },
      });

      return {
        email: composedEmail.email,
        communication,
      };
    },
    onSuccess: (data, variables) => {
      toast({
        title: variables.sendImmediately ? 'Email Sent' : 'Email Draft Saved',
        description: `Subject: ${data.email.subject}`,
      });
    },
  });
}

// ============================================================================
// Communication History Hooks
// ============================================================================

/**
 * Fetch communication history for an account
 */
export function useCommunicationHistory(accountId: string) {
  return useQuery({
    queryKey: ['communication-history', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communication_history')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CommunicationHistory[];
    },
    enabled: !!accountId,
  });
}

/**
 * Fetch recent communications across all accounts
 */
export function useRecentCommunications(limit: number = 20) {
  return useQuery({
    queryKey: ['communication-history', 'recent', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communication_history')
        .select(`
          *,
          accounts!communication_history_account_id_fkey(name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Fetch communication engagement stats for an account
 */
export function useCommunicationEngagementStats(accountId: string) {
  return useQuery({
    queryKey: ['communication-engagement-stats', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communication_engagement_stats')
        .select('*')
        .eq('account_id', accountId);

      if (error) throw error;
      return data;
    },
    enabled: !!accountId,
  });
}

/**
 * Fetch AI-generated communications for quality review
 */
export function useAIGeneratedCommunications() {
  return useQuery({
    queryKey: ['communication-history', 'ai-generated'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communication_history')
        .select(`
          *,
          accounts!communication_history_account_id_fkey(name, email)
        `)
        .eq('ai_generated', true)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
  });
}

// ============================================================================
// Template Management Hooks
// ============================================================================

/**
 * Create a new email template
 */
export function useCreateEmailTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (template: Partial<EmailTemplate>) => {
      const { data, error } = await supabase
        .from('email_templates')
        .insert([template])
        .select()
        .single();

      if (error) throw error;
      return data as EmailTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast({
        title: 'Template Created',
        description: 'Email template has been saved successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Create Template',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Update existing email template
 */
export function useUpdateEmailTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      templateId,
      updates,
    }: {
      templateId: string;
      updates: Partial<EmailTemplate>;
    }) => {
      const { data, error } = await supabase
        .from('email_templates')
        .update(updates)
        .eq('id', templateId)
        .select()
        .single();

      if (error) throw error;
      return data as EmailTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast({
        title: 'Template Updated',
        description: 'Email template has been updated successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Update Template',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Update template usage statistics
 */
export function useUpdateTemplateStats() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase.rpc('update_template_usage_stats', {
        p_template_id: templateId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });
}
