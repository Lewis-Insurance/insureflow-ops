/**
 * Levitate Marketing Templates Hooks
 *
 * React Query hooks for managing email and SMS templates with versioning.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type TemplateCategory =
  | 'general'
  | 'renewal'
  | 'birthday'
  | 'holiday'
  | 'welcome'
  | 'cross_sell'
  | 'retention'
  | 'survey'
  | 'review_request'
  | 'educational'
  | 'newsletter'
  | 'referral'
  | 'policy_update';

export type MessageClassification = 'transactional' | 'relationship' | 'marketing';

export interface EmailTemplate {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  category: TemplateCategory;
  message_classification: MessageClassification;
  current_version_id: string | null;
  applies_to_lines: string[] | null;
  ai_generated: boolean;
  ai_certified: boolean;
  is_active: boolean;
  is_archived: boolean;
  times_used: number;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  current_version?: EmailTemplateVersion;
}

export interface EmailTemplateVersion {
  id: string;
  org_id: string;
  template_id: string;
  version_number: number;
  subject: string;
  body_html: string;
  body_text: string | null;
  merge_fields_used: string[] | null;
  compliance_validated: boolean;
  compliance_validated_at: string | null;
  compliance_issues: Record<string, unknown>[] | null;
  state_variations: Record<string, unknown> | null;
  preview_text: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SmsTemplate {
  id: string;
  org_id: string;
  name: string;
  category: string | null;
  current_version_id: string | null;
  campaign_id: string | null;
  campaign_purpose: string | null;
  is_active: boolean;
  ai_generated: boolean;
  ai_certified: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  current_version?: SmsTemplateVersion;
}

export interface SmsTemplateVersion {
  id: string;
  org_id: string;
  template_id: string;
  version_number: number;
  message_text: string;
  character_count: number;
  segment_count: number;
  contains_unicode: boolean;
  estimated_cost_cents: number;
  compliance_validated: boolean;
  created_by: string | null;
  created_at: string;
}

export interface CreateEmailTemplateParams {
  name: string;
  description?: string;
  category?: TemplateCategory;
  message_classification?: MessageClassification;
  applies_to_lines?: string[];
  subject: string;
  body_html: string;
  body_text?: string;
}

export interface CreateSmsTemplateParams {
  name: string;
  category?: string;
  campaign_purpose?: string;
  message_text: string;
}

export interface ComplianceValidationResult {
  valid: boolean;
  score: number;
  issues: {
    field: string;
    issue: string;
    severity: 'error' | 'warning' | 'info';
    phrase?: string;
    reason?: string;
    suggestion?: string;
  }[];
  classification: string;
  can_send: boolean;
  requires_review: boolean;
}

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Get all email templates
 */
export function useEmailTemplates(filters?: {
  category?: TemplateCategory;
  classification?: MessageClassification;
  is_active?: boolean;
}) {
  return useQuery({
    queryKey: ['email-templates', filters],
    queryFn: async () => {
      let query = supabase
        .from('marketing_email_templates')
        .select(`
          *,
          current_version:marketing_email_template_versions!marketing_email_templates_current_version_fkey(*)
        `)
        .eq('is_archived', false)
        .order('updated_at', { ascending: false });

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }
      if (filters?.classification) {
        query = query.eq('message_classification', filters.classification);
      }
      if (filters?.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as EmailTemplate[];
    },
  });
}

/**
 * Get a single email template with version history
 */
export function useEmailTemplate(templateId: string | null) {
  return useQuery({
    queryKey: ['email-template', templateId],
    queryFn: async () => {
      if (!templateId) return null;

      const { data: template, error: templateError } = await supabase
        .from('marketing_email_templates')
        .select(`
          *,
          current_version:marketing_email_template_versions!marketing_email_templates_current_version_fkey(*)
        `)
        .eq('id', templateId)
        .single();

      if (templateError) throw templateError;

      // Get version history
      const { data: versions, error: versionsError } = await supabase
        .from('marketing_email_template_versions')
        .select('*')
        .eq('template_id', templateId)
        .order('version_number', { ascending: false });

      if (versionsError) throw versionsError;

      return {
        ...template,
        versions: versions || [],
      } as EmailTemplate & { versions: EmailTemplateVersion[] };
    },
    enabled: !!templateId,
  });
}

/**
 * Get all SMS templates
 */
export function useSmsTemplates(filters?: {
  category?: string;
  is_active?: boolean;
}) {
  return useQuery({
    queryKey: ['sms-templates', filters],
    queryFn: async () => {
      let query = supabase
        .from('marketing_sms_templates')
        .select(`
          *,
          current_version:marketing_sms_template_versions!marketing_sms_templates_current_version_fkey(*)
        `)
        .order('updated_at', { ascending: false });

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }
      if (filters?.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as SmsTemplate[];
    },
  });
}

/**
 * Get a single SMS template with version history
 */
export function useSmsTemplate(templateId: string | null) {
  return useQuery({
    queryKey: ['sms-template', templateId],
    queryFn: async () => {
      if (!templateId) return null;

      const { data: template, error: templateError } = await supabase
        .from('marketing_sms_templates')
        .select(`
          *,
          current_version:marketing_sms_template_versions!marketing_sms_templates_current_version_fkey(*)
        `)
        .eq('id', templateId)
        .single();

      if (templateError) throw templateError;

      // Get version history
      const { data: versions, error: versionsError } = await supabase
        .from('marketing_sms_template_versions')
        .select('*')
        .eq('template_id', templateId)
        .order('version_number', { ascending: false });

      if (versionsError) throw versionsError;

      return {
        ...template,
        versions: versions || [],
      } as SmsTemplate & { versions: SmsTemplateVersion[] };
    },
    enabled: !!templateId,
  });
}

/**
 * Get available merge fields
 */
export function useMergeFields() {
  return useQuery({
    queryKey: ['merge-fields'],
    queryFn: async () => {
      // Return available merge fields
      return {
        contact: [
          { field: 'first_name', label: 'First Name', example: 'John' },
          { field: 'last_name', label: 'Last Name', example: 'Smith' },
          { field: 'full_name', label: 'Full Name', example: 'John Smith' },
          { field: 'email', label: 'Email', example: 'john@example.com' },
          { field: 'phone', label: 'Phone', example: '(555) 123-4567' },
        ],
        account: [
          { field: 'account_name', label: 'Account Name', example: 'Smith Family' },
        ],
        policy: [
          { field: 'policy_number', label: 'Policy Number', example: 'POL-12345' },
          { field: 'policy_type', label: 'Policy Type', example: 'Auto' },
          { field: 'carrier', label: 'Carrier', example: 'Progressive' },
          { field: 'premium', label: 'Premium', example: '$1,200' },
          { field: 'renewal_date', label: 'Renewal Date', example: '01/15/2025' },
          { field: 'effective_date', label: 'Effective Date', example: '01/15/2024' },
        ],
        agent: [
          { field: 'agent_name', label: 'Agent Name', example: 'Jane Agent' },
          { field: 'agent_email', label: 'Agent Email', example: 'jane@agency.com' },
          { field: 'agent_phone', label: 'Agent Phone', example: '(555) 987-6543' },
          { field: 'agency_name', label: 'Agency Name', example: 'ABC Insurance' },
        ],
        system: [
          { field: 'current_date', label: 'Current Date', example: '12/19/2025' },
          { field: 'current_year', label: 'Current Year', example: '2025' },
          { field: 'unsubscribe_url', label: 'Unsubscribe URL', example: 'https://...' },
        ],
      };
    },
  });
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Create a new email template
 */
export function useCreateEmailTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: CreateEmailTemplateParams) => {
      // First create the template
      const { data: template, error: templateError } = await supabase
        .from('marketing_email_templates')
        .insert({
          name: params.name,
          description: params.description,
          category: params.category || 'general',
          message_classification: params.message_classification || 'marketing',
          applies_to_lines: params.applies_to_lines,
          is_active: true,
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // Create the first version using the database function
      const { data: versionId, error: versionError } = await supabase.rpc(
        'create_email_template_version',
        {
          p_template_id: template.id,
          p_subject: params.subject,
          p_body_html: params.body_html,
          p_body_text: params.body_text || null,
        }
      );

      if (versionError) throw versionError;

      return template as EmailTemplate;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast({
        title: 'Template Created',
        description: `"${data.name}" has been created.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Creating Template',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Update an email template (creates new version)
 */
export function useUpdateEmailTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      subject,
      body_html,
      body_text,
      ...metadata
    }: {
      id: string;
      subject?: string;
      body_html?: string;
      body_text?: string;
      name?: string;
      description?: string;
      category?: TemplateCategory;
      is_active?: boolean;
    }) => {
      // Update metadata if provided
      if (Object.keys(metadata).length > 0) {
        const { error: metaError } = await supabase
          .from('marketing_email_templates')
          .update({
            ...metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        if (metaError) throw metaError;
      }

      // Create new version if content changed
      if (subject || body_html) {
        // Get current version to use as base
        const { data: template } = await supabase
          .from('marketing_email_templates')
          .select(`
            current_version:marketing_email_template_versions!marketing_email_templates_current_version_fkey(*)
          `)
          .eq('id', id)
          .single();

        const currentVersion = template?.current_version;

        const { error: versionError } = await supabase.rpc(
          'create_email_template_version',
          {
            p_template_id: id,
            p_subject: subject || currentVersion?.subject || '',
            p_body_html: body_html || currentVersion?.body_html || '',
            p_body_text: body_text || currentVersion?.body_text || null,
          }
        );

        if (versionError) throw versionError;
      }

      // Return updated template
      const { data, error } = await supabase
        .from('marketing_email_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as EmailTemplate;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      queryClient.invalidateQueries({ queryKey: ['email-template', data.id] });
      toast({
        title: 'Template Updated',
        description: `"${data.name}" has been updated with a new version.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Updating Template',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Archive an email template
 */
export function useArchiveEmailTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('marketing_email_templates')
        .update({
          is_archived: true,
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as EmailTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast({
        title: 'Template Archived',
        description: 'The template has been archived.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Archiving Template',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Create a new SMS template
 */
export function useCreateSmsTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: CreateSmsTemplateParams) => {
      // Create the template
      const { data: template, error: templateError } = await supabase
        .from('marketing_sms_templates')
        .insert({
          name: params.name,
          category: params.category,
          campaign_purpose: params.campaign_purpose,
          is_active: true,
        })
        .select()
        .single();

      if (templateError) throw templateError;

      // Create the first version
      const { error: versionError } = await supabase.rpc(
        'create_sms_template_version',
        {
          p_template_id: template.id,
          p_message_text: params.message_text,
        }
      );

      if (versionError) throw versionError;

      return template as SmsTemplate;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
      toast({
        title: 'SMS Template Created',
        description: `"${data.name}" has been created.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Creating Template',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Update an SMS template (creates new version)
 */
export function useUpdateSmsTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      message_text,
      ...metadata
    }: {
      id: string;
      message_text?: string;
      name?: string;
      category?: string;
      is_active?: boolean;
    }) => {
      // Update metadata if provided
      if (Object.keys(metadata).length > 0) {
        const { error: metaError } = await supabase
          .from('marketing_sms_templates')
          .update({
            ...metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        if (metaError) throw metaError;
      }

      // Create new version if content changed
      if (message_text) {
        const { error: versionError } = await supabase.rpc(
          'create_sms_template_version',
          {
            p_template_id: id,
            p_message_text: message_text,
          }
        );

        if (versionError) throw versionError;
      }

      // Return updated template
      const { data, error } = await supabase
        .from('marketing_sms_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as SmsTemplate;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
      queryClient.invalidateQueries({ queryKey: ['sms-template', data.id] });
      toast({
        title: 'Template Updated',
        description: `"${data.name}" has been updated.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Updating Template',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Validate template content for compliance
 */
export function useValidateTemplateCompliance() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      content_type,
      subject,
      body_html,
      body_text,
      sms_message,
      classification,
    }: {
      content_type: 'email' | 'sms';
      subject?: string;
      body_html?: string;
      body_text?: string;
      sms_message?: string;
      classification?: MessageClassification;
    }): Promise<ComplianceValidationResult> => {
      const { data: session } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/marketing-compliance-engine`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            content_type,
            subject,
            body_html,
            body_text,
            sms_message,
            classification,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Compliance validation failed');
      }

      return response.json();
    },
    onError: (error: Error) => {
      toast({
        title: 'Validation Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Duplicate an email template
 */
export function useDuplicateEmailTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (templateId: string) => {
      // Get original template with current version
      const { data: original, error: fetchError } = await supabase
        .from('marketing_email_templates')
        .select(`
          *,
          current_version:marketing_email_template_versions!marketing_email_templates_current_version_fkey(*)
        `)
        .eq('id', templateId)
        .single();

      if (fetchError) throw fetchError;

      // Create copy
      const { data: copy, error: copyError } = await supabase
        .from('marketing_email_templates')
        .insert({
          name: `${original.name} (Copy)`,
          description: original.description,
          category: original.category,
          message_classification: original.message_classification,
          applies_to_lines: original.applies_to_lines,
          is_active: false,
        })
        .select()
        .single();

      if (copyError) throw copyError;

      // Copy current version
      if (original.current_version) {
        await supabase.rpc('create_email_template_version', {
          p_template_id: copy.id,
          p_subject: original.current_version.subject,
          p_body_html: original.current_version.body_html,
          p_body_text: original.current_version.body_text,
        });
      }

      return copy as EmailTemplate;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast({
        title: 'Template Duplicated',
        description: `"${data.name}" has been created.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Duplicating Template',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// ============================================================================
// COMBINED HOOKS
// ============================================================================

export interface CombinedTemplate {
  id: string;
  name: string;
  channel: 'email' | 'sms';
  category: string | null;
  is_active: boolean;
}

/**
 * Get all templates (email + SMS) for use in automation builder
 */
export function useMarketingTemplates() {
  return useQuery({
    queryKey: ['marketing-templates-combined'],
    queryFn: async () => {
      // Fetch email templates
      const { data: emailTemplates, error: emailError } = await supabase
        .from('marketing_email_templates')
        .select('id, name, category, is_active')
        .eq('is_archived', false)
        .eq('is_active', true)
        .order('name');

      if (emailError) throw emailError;

      // Fetch SMS templates
      const { data: smsTemplates, error: smsError } = await supabase
        .from('marketing_sms_templates')
        .select('id, name, category, is_active')
        .eq('is_active', true)
        .order('name');

      if (smsError) throw smsError;

      // Combine with channel identifier
      const combined: CombinedTemplate[] = [
        ...(emailTemplates || []).map((t) => ({
          ...t,
          channel: 'email' as const,
        })),
        ...(smsTemplates || []).map((t) => ({
          ...t,
          channel: 'sms' as const,
        })),
      ];

      return combined;
    },
  });
}
