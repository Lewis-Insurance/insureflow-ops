/**
 * Email and SMS Template Hooks
 *
 * Provides CRUD operations for email and SMS templates,
 * including merge tag management and template performance tracking.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAgency } from '@/hooks/useAgencyWorkspace';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

export type TemplateStatus = 'draft' | 'active' | 'archived';

export interface EmailTemplate {
  id: string;
  agency_workspace_id: string;
  name: string;
  category: string | null;
  description: string | null;
  subject: string;
  preview_text: string | null;
  body_html: string;
  body_text: string | null;
  variables: string[];
  design_json: Record<string, unknown> | null;
  thumbnail_url: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  status: TemplateStatus;
  times_used: number;
  last_used_at: string | null;
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_bounced: number;
  total_unsubscribed: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SMSTemplate {
  id: string;
  agency_workspace_id: string;
  name: string;
  category: string | null;
  description: string | null;
  message: string;
  variables: string[];
  char_count: number;
  segment_count: number;
  status: TemplateStatus;
  times_used: number;
  total_sent: number;
  total_delivered: number;
  total_replied: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MergeTag {
  id: string;
  tag: string;
  display_name: string;
  description: string | null;
  category: string;
  data_source: string;
  field_path: string;
  default_value: string | null;
  is_system: boolean;
}

export interface CreateEmailTemplateInput {
  name: string;
  category?: string;
  description?: string;
  subject: string;
  preview_text?: string;
  body_html: string;
  body_text?: string;
  variables?: string[];
  design_json?: Record<string, unknown>;
  from_name?: string;
  from_email?: string;
  reply_to?: string;
  status?: TemplateStatus;
}

export interface UpdateEmailTemplateInput extends Partial<CreateEmailTemplateInput> {
  id: string;
}

export interface CreateSMSTemplateInput {
  name: string;
  category?: string;
  description?: string;
  message: string;
  variables?: string[];
  status?: TemplateStatus;
}

export interface UpdateSMSTemplateInput extends Partial<CreateSMSTemplateInput> {
  id: string;
}

// ============================================================================
// useEmailTemplates - List and search email templates
// ============================================================================

export function useEmailTemplates(options?: {
  status?: TemplateStatus;
  category?: string;
  search?: string;
}) {
  const { agency } = useActiveAgency();

  return useQuery<EmailTemplate[]>({
    queryKey: ['email-templates', agency?.id, options?.status, options?.category, options?.search],
    queryFn: async () => {
      if (!agency?.id) return [];

      let query = supabase
        .from('email_templates')
        .select('*')
        .eq('agency_workspace_id', agency.id)
        .order('updated_at', { ascending: false });

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      if (options?.category) {
        query = query.eq('category', options.category);
      }

      if (options?.search) {
        query = query.or(`name.ilike.%${options.search}%,subject.ilike.%${options.search}%`);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Failed to fetch email templates', { error: error.message });
        throw error;
      }

      return data as EmailTemplate[];
    },
    enabled: !!agency?.id,
    staleTime: 2 * 60 * 1000,
  });
}

// ============================================================================
// useEmailTemplate - Single email template
// ============================================================================

export function useEmailTemplate(templateId?: string) {
  return useQuery<EmailTemplate>({
    queryKey: ['email-template', templateId],
    queryFn: async () => {
      if (!templateId) throw new Error('Template ID required');

      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error) {
        logger.error('Failed to fetch email template', { error: error.message });
        throw error;
      }

      return data as EmailTemplate;
    },
    enabled: !!templateId,
  });
}

// ============================================================================
// useEmailTemplateMutations - CRUD for email templates
// ============================================================================

export function useEmailTemplateMutations() {
  const queryClient = useQueryClient();
  const { agency } = useActiveAgency();

  const createTemplate = useMutation<EmailTemplate, Error, CreateEmailTemplateInput>({
    mutationFn: async (input) => {
      if (!agency?.id) throw new Error('No active agency');

      // Extract variables from the HTML content
      const variables = extractMergeTags(input.body_html);

      const { data, error } = await supabase
        .from('email_templates')
        .insert({
          ...input,
          agency_workspace_id: agency.id,
          variables: input.variables || variables,
          status: input.status || 'draft',
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to create email template', { error: error.message });
        throw error;
      }

      return data as EmailTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });

  const updateTemplate = useMutation<EmailTemplate, Error, UpdateEmailTemplateInput>({
    mutationFn: async ({ id, ...input }) => {
      // Extract variables if HTML was updated
      let variables = input.variables;
      if (input.body_html && !variables) {
        variables = extractMergeTags(input.body_html);
      }

      const { data, error } = await supabase
        .from('email_templates')
        .update({ ...input, variables })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update email template', { error: error.message });
        throw error;
      }

      return data as EmailTemplate;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      queryClient.invalidateQueries({ queryKey: ['email-template', data.id] });
    },
  });

  const deleteTemplate = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('Failed to delete email template', { error: error.message });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });

  const duplicateTemplate = useMutation<EmailTemplate, Error, string>({
    mutationFn: async (id) => {
      // Get the original template
      const { data: original, error: fetchError } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Create a copy
      const { id: _id, created_at, updated_at, times_used, last_used_at, total_sent, total_delivered, total_opened, total_clicked, total_bounced, total_unsubscribed, ...templateData } = original;

      const { data: newTemplate, error: createError } = await supabase
        .from('email_templates')
        .insert({
          ...templateData,
          name: `${original.name} (Copy)`,
          status: 'draft',
          times_used: 0,
          total_sent: 0,
          total_delivered: 0,
          total_opened: 0,
          total_clicked: 0,
          total_bounced: 0,
          total_unsubscribed: 0,
        })
        .select()
        .single();

      if (createError) throw createError;

      return newTemplate as EmailTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });

  return {
    createTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
  };
}

// ============================================================================
// useSMSTemplates - List SMS templates
// ============================================================================

export function useSMSTemplates(options?: {
  status?: TemplateStatus;
  category?: string;
}) {
  const { agency } = useActiveAgency();

  return useQuery<SMSTemplate[]>({
    queryKey: ['sms-templates', agency?.id, options?.status, options?.category],
    queryFn: async () => {
      if (!agency?.id) return [];

      let query = supabase
        .from('sms_templates')
        .select('*')
        .eq('agency_workspace_id', agency.id)
        .order('updated_at', { ascending: false });

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      if (options?.category) {
        query = query.eq('category', options.category);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Failed to fetch SMS templates', { error: error.message });
        throw error;
      }

      return data as SMSTemplate[];
    },
    enabled: !!agency?.id,
    staleTime: 2 * 60 * 1000,
  });
}

// ============================================================================
// useSMSTemplate - Single SMS template
// ============================================================================

export function useSMSTemplate(templateId?: string) {
  return useQuery<SMSTemplate>({
    queryKey: ['sms-template', templateId],
    queryFn: async () => {
      if (!templateId) throw new Error('Template ID required');

      const { data, error } = await supabase
        .from('sms_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error) {
        logger.error('Failed to fetch SMS template', { error: error.message });
        throw error;
      }

      return data as SMSTemplate;
    },
    enabled: !!templateId,
  });
}

// ============================================================================
// useSMSTemplateMutations - CRUD for SMS templates
// ============================================================================

export function useSMSTemplateMutations() {
  const queryClient = useQueryClient();
  const { agency } = useActiveAgency();

  const createTemplate = useMutation<SMSTemplate, Error, CreateSMSTemplateInput>({
    mutationFn: async (input) => {
      if (!agency?.id) throw new Error('No active agency');

      const variables = extractMergeTags(input.message);

      const { data, error } = await supabase
        .from('sms_templates')
        .insert({
          ...input,
          agency_workspace_id: agency.id,
          variables: input.variables || variables,
          status: input.status || 'draft',
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to create SMS template', { error: error.message });
        throw error;
      }

      return data as SMSTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
    },
  });

  const updateTemplate = useMutation<SMSTemplate, Error, UpdateSMSTemplateInput>({
    mutationFn: async ({ id, ...input }) => {
      let variables = input.variables;
      if (input.message && !variables) {
        variables = extractMergeTags(input.message);
      }

      const { data, error } = await supabase
        .from('sms_templates')
        .update({ ...input, variables })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update SMS template', { error: error.message });
        throw error;
      }

      return data as SMSTemplate;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
      queryClient.invalidateQueries({ queryKey: ['sms-template', data.id] });
    },
  });

  const deleteTemplate = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('sms_templates')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('Failed to delete SMS template', { error: error.message });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
    },
  });

  return {
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}

// ============================================================================
// useMergeTags - Get available merge tags
// ============================================================================

export function useMergeTags(category?: string) {
  return useQuery<MergeTag[]>({
    queryKey: ['merge-tags', category],
    queryFn: async () => {
      let query = supabase
        .from('template_merge_tags')
        .select('*')
        .order('category')
        .order('display_name');

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Failed to fetch merge tags', { error: error.message });
        throw error;
      }

      return data as MergeTag[];
    },
    staleTime: 60 * 60 * 1000, // 1 hour - tags don't change often
  });
}

// ============================================================================
// useMergeTagsByCategory - Get merge tags grouped by category
// ============================================================================

export function useMergeTagsByCategory() {
  const { data: tags, ...rest } = useMergeTags();

  const groupedTags = tags?.reduce((acc, tag) => {
    if (!acc[tag.category]) {
      acc[tag.category] = [];
    }
    acc[tag.category].push(tag);
    return acc;
  }, {} as Record<string, MergeTag[]>) ?? {};

  return {
    ...rest,
    data: tags,
    grouped: groupedTags,
    categories: Object.keys(groupedTags),
  };
}

// ============================================================================
// useEmailTemplatePerformance - Performance analytics view
// ============================================================================

export function useEmailTemplatePerformance(templateId?: string) {
  return useQuery({
    queryKey: ['email-template-performance', templateId],
    queryFn: async () => {
      if (!templateId) return null;

      const { data, error } = await supabase
        .from('v_email_template_performance')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error) {
        logger.error('Failed to fetch template performance', { error: error.message });
        throw error;
      }

      return data;
    },
    enabled: !!templateId,
    refetchInterval: 60000, // Refresh every minute
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract merge tags from template content
 * Matches patterns like {{first_name}}, {{policy_type}}, etc.
 */
function extractMergeTags(content: string): string[] {
  const tagPattern = /\{\{(\w+)\}\}/g;
  const matches = content.match(tagPattern);

  if (!matches) return [];

  // Remove duplicates and return unique tags
  return [...new Set(matches.map(tag => tag.replace(/\{\{|\}\}/g, '')))];
}

/**
 * Preview merge tag replacement with sample data
 */
export function previewMergeTagContent(
  content: string,
  sampleData: Record<string, string>
): string {
  let result = content;

  for (const [key, value] of Object.entries(sampleData)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, value);
  }

  return result;
}

/**
 * Get sample data for template preview
 */
export function getSampleMergeTagData(): Record<string, string> {
  return {
    first_name: 'John',
    last_name: 'Smith',
    full_name: 'John Smith',
    email: 'john.smith@example.com',
    phone: '(555) 123-4567',
    address: '123 Main Street',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    agent_name: 'Sarah Johnson',
    agent_phone: '(555) 987-6543',
    agent_email: 'sarah@agency.com',
    agency_name: 'ABC Insurance Agency',
    agency_phone: '(555) 555-5555',
    policy_type: 'auto',
    policy_number: 'POL-123456',
    carrier_name: 'State Farm',
    expiration_date: 'March 15, 2025',
    premium: '$1,234.00',
    today: new Date().toLocaleDateString(),
    current_year: new Date().getFullYear().toString(),
  };
}

// ============================================================================
// Template Categories
// ============================================================================

export const EMAIL_TEMPLATE_CATEGORIES = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'transactional', label: 'Transactional' },
  { value: 'renewal', label: 'Renewal Reminders' },
  { value: 'welcome', label: 'Welcome Series' },
  { value: 'referral', label: 'Referral Request' },
  { value: 'review', label: 'Review Request' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'policy_update', label: 'Policy Updates' },
  { value: 'claim', label: 'Claims' },
  { value: 'other', label: 'Other' },
] as const;

export const SMS_TEMPLATE_CATEGORIES = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'reminder', label: 'Reminders' },
  { value: 'confirmation', label: 'Confirmations' },
  { value: 'appointment', label: 'Appointments' },
  { value: 'other', label: 'Other' },
] as const;
