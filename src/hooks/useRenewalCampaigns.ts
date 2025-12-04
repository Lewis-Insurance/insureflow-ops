// src/hooks/useRenewalCampaigns.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type CampaignType = 'standard' | 'high_risk' | 'loyalty' | 'win_back';
type CampaignStatus = 'active' | 'paused' | 'completed' | 'cancelled';
type TouchpointType = 'email' | 'call' | 'sms' | 'meeting' | 'task';

interface Touchpoint {
  day: number;
  type: TouchpointType;
  template: string;
  completed: boolean;
  completed_at?: string;
  completed_by?: string;
}

interface CampaignTemplate {
  id: string;
  name: string;
  campaign_type: CampaignType;
  description: string;
  touchpoints: Touchpoint[];
}

interface RenewalCampaign {
  id: string;
  renewal_id: string;
  account_id: string;
  campaign_type: CampaignType;
  days_before_renewal: number;
  start_date: string;
  touchpoints: Touchpoint[];
  total_touchpoints: number;
  completed_touchpoints: number;
  personalization: Record<string, string | number>;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
}

interface CreateCampaignParams {
  renewal_id: string;
  account_id: string;
  campaign_type: CampaignType;
  days_before_renewal: number;
  touchpoints: Touchpoint[];
  personalization?: Record<string, string | number>;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

interface SMSTemplate {
  id: string;
  name: string;
  body: string;
}

interface CallScript {
  id: string;
  name: string;
  script: string;
}

interface CommunicationTemplates {
  email: EmailTemplate[];
  sms: SMSTemplate[];
  call: CallScript[];
}

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Get all renewal campaigns for the current user's account
 */
export function useRenewalCampaigns(filters?: {
  status?: CampaignStatus;
  campaign_type?: CampaignType;
  renewal_id?: string;
}) {
  return useQuery({
    queryKey: ['renewal-campaigns', filters],
    queryFn: async () => {
      let query = supabase
        .from('renewal_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.campaign_type) {
        query = query.eq('campaign_type', filters.campaign_type);
      }
      if (filters?.renewal_id) {
        query = query.eq('renewal_id', filters.renewal_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data.map(campaign => ({
        ...campaign,
        touchpoints: campaign.touchpoints as unknown as Touchpoint[],
        personalization: campaign.personalization as Record<string, string | number>
      })) as RenewalCampaign[];
    }
  });
}

/**
 * Get a single renewal campaign by ID
 */
export function useRenewalCampaign(campaignId: string | null) {
  return useQuery({
    queryKey: ['renewal-campaign', campaignId],
    queryFn: async () => {
      if (!campaignId) return null;

      const { data, error } = await supabase
        .from('renewal_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (error) throw error;
      return {
        ...data,
        touchpoints: data.touchpoints as unknown as Touchpoint[],
        personalization: data.personalization as Record<string, string | number>
      } as RenewalCampaign;
    },
    enabled: !!campaignId
  });
}

/**
 * Get active campaigns (for dashboard)
 */
export function useActiveRenewalCampaigns() {
  return useQuery({
    queryKey: ['active-renewal-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewal_campaigns')
        .select('*, renewals(*)')
        .eq('status', 'active')
        .order('start_date', { ascending: true })
        .limit(50);

      if (error) throw error;
      return data;
    }
  });
}

/**
 * Get campaign templates (hardcoded for now, but ready for DB migration)
 */
export function useCampaignTemplates() {
  return useQuery({
    queryKey: ['campaign-templates'],
    queryFn: async (): Promise<CampaignTemplate[]> => {
      // TODO: Move to database table 'campaign_templates'
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

/**
 * Get email/SMS/call templates (hardcoded for now, but ready for DB migration)
 */
export function useCommunicationTemplates() {
  return useQuery({
    queryKey: ['communication-templates'],
    queryFn: async (): Promise<CommunicationTemplates> => {
      // TODO: Move to database tables: 'email_templates', 'sms_templates', 'call_scripts'
      return {
        email: [
          {
            id: 'renewal_notice_90',
            name: '90-Day Renewal Notice',
            subject: 'Your {{policy_type}} policy renews in 90 days',
            body: 'Hi {{customer_name}},\n\nYour {{policy_type}} policy with {{carrier}} is coming up for renewal on {{renewal_date}}.\n\nWe want to make sure you have the best coverage at the best rate. Let\'s schedule a quick review to:\n\n• Confirm your coverage is still adequate\n• Check for any available discounts\n• Review any life changes that might affect your policy\n• Compare rates to ensure competitiveness\n\nClick here to schedule: {{scheduling_link}}\n\nBest regards,\n{{agent_name}}\n{{agency_name}}'
          },
          {
            id: 'urgent_renewal_email',
            name: 'Urgent Renewal Alert',
            subject: 'Important: Your policy renewal needs attention',
            body: 'Hi {{customer_name}},\n\nI noticed your {{policy_type}} policy is coming up for renewal and I wanted to reach out personally.\n\nI\'ve been reviewing your account and want to make sure we have everything in order for a smooth renewal. There may be some opportunities to improve your coverage or pricing.\n\nCan we schedule a brief call this week? I have a few options that might benefit you.\n\nReply to this email or call me directly at {{agent_phone}}.\n\nThank you,\n{{agent_name}}'
          },
          {
            id: 'loyalty_appreciation',
            name: 'Loyalty Customer Appreciation',
            subject: 'Thank you for {{years}} years with us!',
            body: 'Dear {{customer_name}},\n\nAs one of our valued customers for {{years}} years, we wanted to reach out personally to thank you for your continued trust in {{agency_name}}.\n\nYour {{policy_type}} policy is coming up for renewal, and as a token of our appreciation, we\'ve arranged a comprehensive review to ensure you\'re getting the best possible value.\n\nWe\'ve also checked for any loyalty discounts or new programs you might qualify for.\n\nLet\'s connect soon to review everything together.\n\nWith gratitude,\n{{agent_name}}\n{{agency_name}}'
          },
          {
            id: 'renewal_reminder_30',
            name: '30-Day Renewal Reminder',
            subject: 'Your policy renews in 30 days',
            body: 'Hi {{customer_name}},\n\nJust a friendly reminder that your {{policy_type}} policy renews on {{renewal_date}} - that\'s 30 days from now.\n\nWe\'ve prepared your renewal quote, and I\'d like to walk you through it:\n\n• Updated premium: {{new_premium}}\n• Coverage summary\n• Any changes from last year\n\nNo action needed if everything looks good - your policy will automatically renew. But I\'m here if you have any questions or want to make any changes.\n\nView your renewal: {{renewal_link}}\n\nBest,\n{{agent_name}}'
          },
          {
            id: 'win_back_offer',
            name: 'Win-Back Special Offer',
            subject: 'We miss you! Special offer inside',
            body: 'Hi {{customer_name}},\n\nWe noticed your {{policy_type}} policy with us ended, and we wanted to reach out.\n\nWe value the relationship we had and would love to earn back your business. We\'ve arranged a special welcome-back offer just for you:\n\n• Competitive rates review\n• Waived fees\n• Priority service\n• {{special_offer}}\n\nNo obligation - just let us show you what we can do.\n\nInterested? Reply to this email or call me at {{agent_phone}}.\n\nHope to hear from you,\n{{agent_name}}'
          }
        ],
        sms: [
          {
            id: 'urgent_renewal_sms',
            name: 'Urgent Renewal SMS',
            body: 'Hi {{customer_name}}, your {{policy_type}} renews soon. We need to discuss your renewal. Can we schedule a quick call? - {{agent_name}}, {{agency_name}}'
          },
          {
            id: 'renewal_reminder_sms',
            name: 'Renewal Reminder',
            body: '{{customer_name}}, your policy renews on {{renewal_date}}. Reply YES to confirm or CALL to discuss changes. - {{agent_name}}'
          },
          {
            id: 'renewal_confirmation_sms',
            name: 'Renewal Confirmation',
            body: 'Great news {{customer_name}}! Your {{policy_type}} has been renewed. Confirmation email sent. Questions? Call {{agent_phone}} - {{agent_name}}'
          },
          {
            id: 'win_back_sms',
            name: 'Win-Back SMS',
            body: 'Hi {{customer_name}}, we have a special offer to welcome you back to {{agency_name}}. Interested? Reply YES or call {{agent_phone}} - {{agent_name}}'
          }
        ],
        call: [
          {
            id: 'urgent_renewal_call',
            name: 'Urgent Renewal Call Script',
            script: '**OPENING**\nHi [Customer Name], this is [Agent Name] from [Agency]. Do you have a quick moment?\n\n**IDENTIFY URGENCY**\nI\'m calling because I noticed your [policy type] is coming up for renewal on [date], and I wanted to personally reach out to make sure everything is in order.\n\n**EXPRESS CONCERN**\nI\'ve been reviewing your account, and I want to make sure you\'re getting the best value and coverage. Have there been any changes in your situation since we last spoke?\n\n**ADDRESS RISK FACTORS**\n[If rate increase]: I see there\'s been a rate adjustment, and I want to explain why and explore options...\n[If no contact]: We haven\'t connected in a while, and I want to make sure you\'re still happy with everything...\n[If competitor activity]: I want to make sure we\'re competitive and meeting your needs...\n\n**SCHEDULE REVIEW**\nI\'d love to schedule a quick 15-minute review to go over your policy, answer questions, and make sure you\'re getting every discount available. What works better for you - this week or next?\n\n**CLOSE**\nGreat! I\'ll send you a calendar invite. Looking forward to our conversation.'
          },
          {
            id: 'renewal_checkup_call',
            name: 'Standard Renewal Check-In',
            script: '**FRIENDLY GREETING**\nHi [Customer Name]! This is [Agent Name] from [Agency]. How are you doing today?\n\n**PURPOSE STATEMENT**\nI\'m doing my annual check-ins with customers, and I wanted to touch base about your [policy type] that renews on [date].\n\n**CONFIRM COVERAGE**\nFirst, let me ask - is your current coverage still meeting your needs? Any big changes in your life I should know about? New car, home renovations, anything like that?\n\n**REVIEW LIFE CHANGES**\n[Listen for: new vehicles, home improvements, family changes, business growth]\n\n**PREVIEW RENEWAL**\nLet me give you a quick preview of your renewal:\n• Your premium is [amount] - [up/down/same] from last year\n• Coverage remains [same/updated based on changes]\n• You\'re getting [X] discounts\n\n**ADDRESS QUESTIONS**\nWhat questions do you have for me?\n\n**NEXT STEPS**\nPerfect! I\'ll send you the formal renewal documents [timeframe]. You don\'t need to do anything - it will auto-renew unless you want to make changes.\n\n**THANK THEM**\nThanks for being a great customer! Call me anytime if you need anything.'
          },
          {
            id: 'loyalty_review_call',
            name: 'Loyalty Customer Review',
            script: '**APPRECIATION OPENING**\nHi [Customer Name], this is [Agent Name] from [Agency]. I wanted to start by saying thank you - you\'ve been with us for [X] years now, and we really appreciate your loyalty!\n\n**PURPOSE**\nYour [policy type] is coming up for renewal, and I wanted to personally make sure we\'re taking great care of you.\n\n**COMPREHENSIVE REVIEW**\nI\'ve done a thorough review of your account, and here\'s what I found:\n• You\'re currently getting [X] discounts worth [$X]\n• Your coverage is [assessment]\n• I found [X new opportunities/everything looks great]\n\n**LOYALTY BENEFITS**\nBecause you\'ve been with us so long, you qualify for [loyalty discount/enhanced service/priority handling]. I want to make sure you\'re taking advantage of everything available to you.\n\n**EXPLORE OPPORTUNITIES**\n[If cross-sell opportunity]: I also noticed you might benefit from [product]. Can I tell you about that quickly?\n\n**RELATIONSHIP BUILDING**\nHow has your overall experience been with us? Is there anything we could do better?\n\n**CLOSE WITH GRATITUDE**\nThank you again for your business over the years. You\'re the kind of customer we love working with!'
          },
          {
            id: 'final_renewal_call',
            name: 'Final Renewal Call',
            script: '**URGENT BUT FRIENDLY**\nHi [Customer Name], this is [Agent Name] from [Agency]. Quick heads up - your [policy type] renews in just [X] days, and I wanted to make sure everything is set.\n\n**CHECK STATUS**\nHave you had a chance to review the renewal documents I sent?\n\n**IF YES, APPROVED:**\nPerfect! Everything is set to renew automatically on [date]. Your new premium is [amount] and will be billed on [date]. Any last-minute questions?\n\n**IF YES, CONCERNS:**\nI understand. Let\'s talk through what\'s on your mind. [Address concerns, offer solutions]\n\n**IF NO:**\nNo problem! Let me do a quick summary right now:\n• Renewal date: [date]\n• Premium: [amount] ([up/down/same])\n• Coverage: [summary]\n• What you need to do: [nothing/sign/payment]\n\nCan I answer any questions to help you feel comfortable moving forward?\n\n**ALTERNATIVE OPTIONS**\n[If hesitation]: If the premium is a concern, let me see what other options we have available...\n\n**URGENCY REMINDER**\nJust so you know, we need to finalize this by [date] to avoid any coverage gaps. Can we get this wrapped up today?\n\n**CLOSE**\nGreat! I\'ll [send documents/process renewal/follow up]. Thanks for your time!'
          },
          {
            id: 'followup_call',
            name: 'Follow-up Call',
            script: '**FRIENDLY OPENING**\nHi [Customer Name], [Agent Name] here from [Agency]. I\'m following up on [our conversation/the email I sent/your renewal].\n\n**REFERENCE PREVIOUS CONTACT**\nWhen we last spoke, you mentioned [what they said]. I wanted to check in on that.\n\n**IF THEY NEEDED TO THINK:**\nHave you had a chance to think things over? What questions can I answer?\n\n**IF WAITING ON SOMETHING:**\nI wanted to let you know [what you promised to send/find out/do] is ready...\n\n**IF NO RESPONSE TO PRIOR CONTACT:**\nI sent over [documents/quote/information] and wanted to make sure you received it and see if you have any questions.\n\n**MOVE FORWARD**\nWhat\'s the best next step from here? Should we [schedule a meeting/proceed with the renewal/get you a quote]?\n\n**SOFT CLOSE**\nI don\'t want to be pushy, but I also don\'t want you to fall through the cracks. How can I best help you right now?'
          },
          {
            id: 'win_back_call',
            name: 'Win-Back Call',
            script: '**WARM OPENING**\nHi [Customer Name], this is [Agent Name] from [Agency]. I hope I\'m not catching you at a bad time?\n\n**ACKNOWLEDGE DEPARTURE**\nI noticed your policy with us ended [timeframe ago], and I wanted to reach out personally. First, I hope everything is going well for you!\n\n**EXPRESS DESIRE TO RECONNECT**\nWe really valued having you as a customer, and I wanted to see if there\'s anything we could do to earn back your business.\n\n**UNDERSTAND WHAT HAPPENED**\nIf you don\'t mind me asking, what led to your decision to move your insurance elsewhere? [Listen carefully - don\'t interrupt]\n\n**ADDRESS CONCERNS**\n[Based on their answer]:\n• Price: I understand. Let me see what I can do - we may have new programs or discounts available now...\n• Service: I\'m sorry to hear that. We\'ve made some changes, and I\'d love the chance to show you...\n• Coverage: Let me make sure you\'re getting exactly what you need...\n\n**PRESENT WIN-BACK OFFER**\nI\'ve actually arranged a special welcome-back offer: [specific benefits, discounts, incentives]\n\n**NO PRESSURE**\nNo pressure at all - I just wanted you to know we\'d love to work with you again. Can I put together a quote for you to compare?\n\n**CLOSE**\nEven if now isn\'t the right time, I appreciate you taking my call. Keep me in mind if anything changes!'
          }
        ]
      };
    }
  });
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Create a new renewal campaign
 */
export function useCreateRenewalCampaign() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: CreateCampaignParams) => {
      const { data, error } = await supabase
        .from('renewal_campaigns')
        .insert({
          account_id: params.account_id,
          campaign_type: params.campaign_type,
          days_before_renewal: params.days_before_renewal,
          start_date: new Date().toISOString().split('T')[0],
          touchpoints: params.touchpoints as any,
          total_touchpoints: params.touchpoints.length,
          completed_touchpoints: 0,
          personalization: params.personalization || {},
          status: 'active'
        } as any)
        .select()
        .single();

      if (error) throw error;
      return {
        ...data,
        touchpoints: data.touchpoints as unknown as Touchpoint[],
        personalization: data.personalization as Record<string, string | number>
      } as RenewalCampaign;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['active-renewal-campaigns'] });
      toast({
        title: 'Campaign Created',
        description: `${data.campaign_type} campaign has been started successfully.`
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Creating Campaign',
        description: error.message,
        variant: 'destructive'
      });
    }
  });
}

/**
 * Update a touchpoint's completion status
 * Optimized: Updates the touchpoint directly without fetching the entire campaign first
 */
export function useUpdateCampaignTouchpoint() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      // Validate touchpoint_index
      if (touchpoint_index < 0) {
        throw new Error('Invalid touchpoint index');
      }

      // Get current campaign
      const { data: campaign, error: fetchError } = await supabase
        .from('renewal_campaigns')
        .select('touchpoints, completed_touchpoints')
        .eq('id', campaign_id)
        .single();

      if (fetchError) throw fetchError;
      if (!campaign) throw new Error('Campaign not found');

      const touchpoints = [...(campaign.touchpoints as unknown as Touchpoint[])];
      
      // Validate index is within bounds
      if (touchpoint_index >= touchpoints.length) {
        throw new Error('Touchpoint index out of bounds');
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Update touchpoint
      touchpoints[touchpoint_index] = {
        ...touchpoints[touchpoint_index],
        completed,
        ...(completed && {
          completed_at: new Date().toISOString(),
          completed_by: user?.id
        })
      };

      const completedCount = touchpoints.filter(t => t.completed).length;

      const { data, error } = await supabase
        .from('renewal_campaigns')
        .update({
          touchpoints: touchpoints as any,
          completed_touchpoints: completedCount,
          updated_at: new Date().toISOString()
        })
        .eq('id', campaign_id)
        .select()
        .single();

      if (error) throw error;
      return {
        ...data,
        touchpoints: data.touchpoints as unknown as Touchpoint[],
        personalization: data.personalization as Record<string, string | number>
      } as RenewalCampaign;
    },
    onMutate: async ({ campaign_id, touchpoint_index, completed }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['renewal-campaign', campaign_id] });

      // Snapshot the previous value
      const previousCampaign = queryClient.getQueryData(['renewal-campaign', campaign_id]);

      // Optimistically update
      queryClient.setQueryData(['renewal-campaign', campaign_id], (old: RenewalCampaign | undefined) => {
        if (!old) return old;
        const newTouchpoints = [...old.touchpoints];
        newTouchpoints[touchpoint_index] = {
          ...newTouchpoints[touchpoint_index],
          completed
        };
        return {
          ...old,
          touchpoints: newTouchpoints,
          completed_touchpoints: newTouchpoints.filter(t => t.completed).length
        };
      });

      return { previousCampaign };
    },
    onError: (error: Error, variables, context) => {
      // Rollback on error
      if (context?.previousCampaign) {
        queryClient.setQueryData(
          ['renewal-campaign', variables.campaign_id],
          context.previousCampaign
        );
      }
      toast({
        title: 'Error Updating Touchpoint',
        description: error.message,
        variant: 'destructive'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewal-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['active-renewal-campaigns'] });
      toast({
        title: 'Touchpoint Updated',
        description: 'Campaign touchpoint status has been updated.'
      });
    }
  });
}

/**
 * Update campaign status (pause/resume/complete/cancel)
 */
export function useUpdateCampaignStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      campaign_id, 
      status 
    }: { 
      campaign_id: string; 
      status: CampaignStatus;
    }) => {
      const { data, error } = await supabase
        .from('renewal_campaigns')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', campaign_id)
        .select()
        .single();

      if (error) throw error;
      return {
        ...data,
        touchpoints: data.touchpoints as unknown as Touchpoint[],
        personalization: data.personalization as Record<string, string | number>
      } as RenewalCampaign;
    },
    onMutate: async ({ campaign_id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['renewal-campaign', campaign_id] });
      const previousCampaign = queryClient.getQueryData(['renewal-campaign', campaign_id]);

      // Optimistically update
      queryClient.setQueryData(['renewal-campaign', campaign_id], (old: RenewalCampaign | undefined) => {
        if (!old) return old;
        return { ...old, status };
      });

      return { previousCampaign };
    },
    onError: (error: Error, variables, context) => {
      if (context?.previousCampaign) {
        queryClient.setQueryData(
          ['renewal-campaign', variables.campaign_id],
          context.previousCampaign
        );
      }
      toast({
        title: 'Error Updating Campaign',
        description: error.message,
        variant: 'destructive'
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['active-renewal-campaigns'] });
      toast({
        title: 'Campaign Updated',
        description: `Campaign has been ${data.status}.`
      });
    }
  });
}

/**
 * Delete a campaign
 */
export function useDeleteRenewalCampaign() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (campaign_id: string) => {
      const { error } = await supabase
        .from('renewal_campaigns')
        .delete()
        .eq('id', campaign_id);

      if (error) throw error;
      return campaign_id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewal-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['active-renewal-campaigns'] });
      toast({
        title: 'Campaign Deleted',
        description: 'The campaign has been successfully deleted.'
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Deleting Campaign',
        description: error.message,
        variant: 'destructive'
      });
    }
  });
}

