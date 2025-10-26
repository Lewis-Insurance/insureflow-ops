import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface TouchpointTemplate {
  type: 'email' | 'call' | 'sms' | 'meeting' | 'task';
  template: string;
  subject?: string;
  body?: string;
}

interface CreateCampaignParams {
  renewal_id: string;
  account_id: string;
  campaign_type: 'standard' | 'high_risk' | 'loyalty' | 'win_back';
  days_before_renewal: number;
  touchpoints: Array<{
    day: number;
    type: string;
    template: string;
    completed: boolean;
  }>;
  personalization?: Record<string, any>;
}

// Get campaign templates
export function useCampaignTemplates() {
  return useQuery({
    queryKey: ['campaign-templates'],
    queryFn: async () => {
      // This would come from a templates table, for now returning hardcoded
      return [
        {
          id: 'standard-90',
          name: 'Standard 90-Day Renewal',
          campaign_type: 'standard',
          description: 'Standard renewal campaign starting 90 days before renewal',
          touchpoints: [
            { day: 0, type: 'email', template: 'renewal_notice_90', completed: false },
            { day: 30, type: 'call', template: 'renewal_checkup_call', completed: false },
            { day: 60, type: 'email', template: 'renewal_reminder_30', completed: false },
            { day: 75, type: 'sms', template: 'renewal_reminder_sms', completed: false },
            { day: 85, type: 'call', template: 'final_renewal_call', completed: false }
          ]
        },
        {
          id: 'high-risk',
          name: 'High Risk Intervention',
          campaign_type: 'high_risk',
          description: 'Intensive campaign for at-risk renewals',
          touchpoints: [
            { day: 0, type: 'call', template: 'urgent_renewal_call', completed: false },
            { day: 1, type: 'email', template: 'urgent_renewal_email', completed: false },
            { day: 3, type: 'sms', template: 'urgent_renewal_sms', completed: false },
            { day: 7, type: 'meeting', template: 'renewal_review_meeting', completed: false },
            { day: 10, type: 'call', template: 'followup_call', completed: false }
          ]
        },
        {
          id: 'loyalty',
          name: 'Loyalty Appreciation',
          campaign_type: 'loyalty',
          description: 'VIP treatment for long-term customers',
          touchpoints: [
            { day: 0, type: 'email', template: 'loyalty_appreciation', completed: false },
            { day: 14, type: 'call', template: 'loyalty_review_call', completed: false },
            { day: 45, type: 'email', template: 'renewal_reminder_loyalty', completed: false }
          ]
        },
        {
          id: 'win-back',
          name: 'Win-Back Campaign',
          campaign_type: 'win_back',
          description: 'Re-engage customers who previously cancelled',
          touchpoints: [
            { day: 0, type: 'email', template: 'win_back_offer', completed: false },
            { day: 3, type: 'call', template: 'win_back_call', completed: false },
            { day: 7, type: 'email', template: 'win_back_final_offer', completed: false }
          ]
        }
      ];
    }
  });
}

// Create a new campaign
export function useCreateRenewalCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateCampaignParams) => {
      const { data, error } = await supabase
        .from('renewal_campaigns')
        .insert({
          renewal_id: params.renewal_id,
          account_id: params.account_id,
          campaign_type: params.campaign_type,
          days_before_renewal: params.days_before_renewal,
          start_date: new Date().toISOString().split('T')[0],
          touchpoints: params.touchpoints,
          total_touchpoints: params.touchpoints.length,
          personalization: params.personalization || {},
          status: 'active'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewal-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['active-renewal-campaigns'] });
    }
  });
}

// Update campaign touchpoint
export function useUpdateCampaignTouchpoint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      campaign_id, 
      touchpoint_index, 
      completed 
    }: { 
      campaign_id: string; 
      touchpoint_index: number; 
      completed: boolean;
    }) => {
      // Get current campaign
      const { data: campaign, error: fetchError } = await supabase
        .from('renewal_campaigns')
        .select('touchpoints, completed_touchpoints')
        .eq('id', campaign_id)
        .single();

      if (fetchError) throw fetchError;

      const touchpoints = [...(campaign.touchpoints as any[])] as Array<{
        day: number;
        type: string;
        template: string;
        completed: boolean;
      }>;
      touchpoints[touchpoint_index].completed = completed;

      const completedCount = touchpoints.filter(t => t.completed).length;

      const { data, error } = await supabase
        .from('renewal_campaigns')
        .update({
          touchpoints,
          completed_touchpoints: completedCount
        })
        .eq('id', campaign_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewal-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['active-renewal-campaigns'] });
    }
  });
}

// Pause/Resume campaign
export function useUpdateCampaignStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      campaign_id, 
      status 
    }: { 
      campaign_id: string; 
      status: 'active' | 'paused' | 'completed' | 'cancelled';
    }) => {
      const { data, error } = await supabase
        .from('renewal_campaigns')
        .update({ status })
        .eq('id', campaign_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewal-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['active-renewal-campaigns'] });
    }
  });
}

// Get email/SMS templates
export function useCommunicationTemplates() {
  return useQuery({
    queryKey: ['communication-templates'],
    queryFn: async () => {
      return {
        email: [
          {
            id: 'renewal_notice_90',
            name: '90-Day Renewal Notice',
            subject: 'Your {{policy_type}} policy renews in 90 days',
            body: 'Hi {{customer_name}},\n\nYour {{policy_type}} policy with {{carrier}} is coming up for renewal on {{renewal_date}}...'
          },
          {
            id: 'urgent_renewal_email',
            name: 'Urgent Renewal Alert',
            subject: 'Important: Your policy renewal needs attention',
            body: 'Hi {{customer_name}},\n\nI noticed your {{policy_type}} policy is coming up for renewal and I wanted to reach out personally...'
          },
          {
            id: 'loyalty_appreciation',
            name: 'Loyalty Customer Appreciation',
            subject: 'Thank you for {{years}} years with us!',
            body: 'Dear {{customer_name}},\n\nAs one of our valued customers, we wanted to reach out personally to thank you...'
          }
        ],
        sms: [
          {
            id: 'urgent_renewal_sms',
            name: 'Urgent Renewal SMS',
            body: 'Hi {{customer_name}}, your {{policy_type}} renews soon. We need to discuss your renewal. Can we schedule a quick call? - {{agent_name}}'
          },
          {
            id: 'renewal_reminder_sms',
            name: 'Renewal Reminder',
            body: '{{customer_name}}, your policy renews on {{renewal_date}}. Reply YES to confirm or CALL to discuss changes.'
          }
        ],
        call: [
          {
            id: 'urgent_renewal_call',
            name: 'Urgent Renewal Call Script',
            script: '1. Identify yourself and agency\n2. Express concern about renewal\n3. Ask about satisfaction\n4. Address risk factors\n5. Schedule review meeting'
          },
          {
            id: 'renewal_checkup_call',
            name: 'Standard Renewal Check-In',
            script: '1. Friendly greeting\n2. Confirm coverage is still adequate\n3. Review any life changes\n4. Preview renewal premium\n5. Address questions'
          }
        ]
      };
    }
  });
}
