/**
 * useReputation - Hooks for Reputation Management
 *
 * Manages Google reviews, review requests, and NPS surveys.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ============================================================================
// Types
// ============================================================================

export interface GoogleBusinessProfile {
  id: string;
  agency_workspace_id: string;
  google_place_id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  website?: string;
  review_url?: string;
  total_reviews: number;
  average_rating: number;
  rating_1_count: number;
  rating_2_count: number;
  rating_3_count: number;
  rating_4_count: number;
  rating_5_count: number;
  sync_status: 'pending' | 'syncing' | 'synced' | 'error';
  last_sync_at?: string;
  is_primary: boolean;
  status: 'active' | 'disconnected' | 'error';
  created_at: string;
}

export interface Review {
  id: string;
  agency_workspace_id: string;
  google_profile_id?: string;
  google_review_id?: string;
  source: 'google' | 'facebook' | 'yelp' | 'internal' | 'survey';
  reviewer_name?: string;
  reviewer_photo_url?: string;
  contact_id?: string;
  account_id?: string;
  rating: number;
  review_text?: string;
  reviewed_at: string;
  response_text?: string;
  response_at?: string;
  responded_by?: string;
  ai_response_suggestion?: string;
  ai_sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
  ai_topics?: string[];
  status: 'new' | 'acknowledged' | 'responded' | 'flagged' | 'hidden';
  is_featured: boolean;
  internal_notes?: string;
  created_at: string;
}

export interface ReviewRequest {
  id: string;
  agency_workspace_id: string;
  contact_id?: string;
  account_id?: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  channel: 'email' | 'sms' | 'both';
  review_url: string;
  status: 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'reviewed' | 'bounced' | 'failed';
  sent_at?: string;
  clicked_at?: string;
  reviewed_at?: string;
  review_rating?: number;
  created_at: string;
}

export interface NPSCampaign {
  id: string;
  agency_workspace_id: string;
  name: string;
  description?: string;
  trigger_type: 'manual' | 'post_policy' | 'post_claim' | 'periodic' | 'renewal' | 'anniversary';
  trigger_config: Record<string, unknown>;
  status: 'draft' | 'active' | 'paused' | 'archived';
  total_sent: number;
  total_responses: number;
  current_nps_score?: number;
  created_at: string;
}

export interface NPSResponse {
  id: string;
  campaign_id: string;
  agency_workspace_id: string;
  contact_id?: string;
  email?: string;
  score: number;
  category: 'promoter' | 'passive' | 'detractor';
  feedback_text?: string;
  responded_at?: string;
  follow_up_required: boolean;
  follow_up_completed: boolean;
  created_at: string;
}

export interface ReputationSummary {
  agency_workspace_id: string;
  agency_name: string;
  total_reviews: number;
  average_rating: number;
  pending_responses: number;
  low_rating_count: number;
  reviews_last_30_days: number;
  average_nps_score: number;
  nps_responses_last_30_days: number;
}

// ============================================================================
// Google Business Profiles
// ============================================================================

export function useGoogleBusinessProfiles(agencyWorkspaceId?: string) {
  return useQuery({
    queryKey: ['google-business-profiles', agencyWorkspaceId],
    queryFn: async () => {
      let query = supabase
        .from('google_business_profiles')
        .select('*')
        .order('is_primary', { ascending: false })
        .order('name');

      if (agencyWorkspaceId) {
        query = query.eq('agency_workspace_id', agencyWorkspaceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as GoogleBusinessProfile[];
    },
    enabled: !!agencyWorkspaceId,
  });
}

export function usePrimaryGoogleProfile(agencyWorkspaceId?: string) {
  return useQuery({
    queryKey: ['google-business-profile-primary', agencyWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('google_business_profiles')
        .select('*')
        .eq('agency_workspace_id', agencyWorkspaceId!)
        .eq('is_primary', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as GoogleBusinessProfile | null;
    },
    enabled: !!agencyWorkspaceId,
  });
}

// ============================================================================
// Reviews
// ============================================================================

export function useReviews(options?: {
  agencyWorkspaceId?: string;
  status?: Review['status'];
  minRating?: number;
  maxRating?: number;
  limit?: number;
}) {
  const { agencyWorkspaceId, status, minRating, maxRating, limit = 50 } = options || {};

  return useQuery({
    queryKey: ['reviews', agencyWorkspaceId, status, minRating, maxRating, limit],
    queryFn: async () => {
      let query = supabase
        .from('reviews')
        .select('*')
        .order('reviewed_at', { ascending: false })
        .limit(limit);

      if (agencyWorkspaceId) {
        query = query.eq('agency_workspace_id', agencyWorkspaceId);
      }
      if (status) {
        query = query.eq('status', status);
      }
      if (minRating !== undefined) {
        query = query.gte('rating', minRating);
      }
      if (maxRating !== undefined) {
        query = query.lte('rating', maxRating);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Review[];
    },
    enabled: !!agencyWorkspaceId,
  });
}

export function useReview(reviewId?: string) {
  return useQuery({
    queryKey: ['review', reviewId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('id', reviewId!)
        .single();

      if (error) throw error;
      return data as Review;
    },
    enabled: !!reviewId,
  });
}

export function useRespondToReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reviewId,
      responseText,
    }: {
      reviewId: string;
      responseText: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('reputation-manager', {
        body: {
          action: 'respond_to_review',
          review_id: reviewId,
          response_text: responseText,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}

export function useGenerateAIResponse() {
  return useMutation({
    mutationFn: async ({ reviewId }: { reviewId: string }) => {
      const { data, error } = await supabase.functions.invoke('reputation-manager', {
        body: {
          action: 'generate_ai_response',
          review_id: reviewId,
        },
      });

      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateReviewStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reviewId,
      status,
      isFeatured,
    }: {
      reviewId: string;
      status?: Review['status'];
      isFeatured?: boolean;
    }) => {
      const updates: Partial<Review> = {};
      if (status) updates.status = status;
      if (isFeatured !== undefined) updates.is_featured = isFeatured;

      const { data, error } = await supabase
        .from('reviews')
        .update(updates)
        .eq('id', reviewId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}

// ============================================================================
// Review Requests
// ============================================================================

export function useReviewRequests(options?: {
  agencyWorkspaceId?: string;
  status?: ReviewRequest['status'];
  limit?: number;
}) {
  const { agencyWorkspaceId, status, limit = 50 } = options || {};

  return useQuery({
    queryKey: ['review-requests', agencyWorkspaceId, status, limit],
    queryFn: async () => {
      let query = supabase
        .from('review_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (agencyWorkspaceId) {
        query = query.eq('agency_workspace_id', agencyWorkspaceId);
      }
      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ReviewRequest[];
    },
    enabled: !!agencyWorkspaceId,
  });
}

export function useSendReviewRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      agencyWorkspaceId: string;
      contactId?: string;
      email?: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
      channel: 'email' | 'sms' | 'both';
    }) => {
      const { data, error } = await supabase.functions.invoke('reputation-manager', {
        body: {
          action: 'send_review_request',
          agency_workspace_id: params.agencyWorkspaceId,
          contact_id: params.contactId,
          email: params.email,
          phone: params.phone,
          first_name: params.firstName,
          last_name: params.lastName,
          channel: params.channel,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-requests'] });
    },
  });
}

// ============================================================================
// NPS Campaigns
// ============================================================================

export function useNPSCampaigns(agencyWorkspaceId?: string) {
  return useQuery({
    queryKey: ['nps-campaigns', agencyWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nps_campaigns')
        .select('*')
        .eq('agency_workspace_id', agencyWorkspaceId!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as NPSCampaign[];
    },
    enabled: !!agencyWorkspaceId,
  });
}

export function useNPSCampaign(campaignId?: string) {
  return useQuery({
    queryKey: ['nps-campaign', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nps_campaigns')
        .select('*')
        .eq('id', campaignId!)
        .single();

      if (error) throw error;
      return data as NPSCampaign;
    },
    enabled: !!campaignId,
  });
}

export function useCreateNPSCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaign: Partial<NPSCampaign>) => {
      const { data, error } = await supabase
        .from('nps_campaigns')
        .insert(campaign)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nps-campaigns'] });
    },
  });
}

export function useUpdateNPSCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<NPSCampaign> & { id: string }) => {
      const { data, error } = await supabase
        .from('nps_campaigns')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nps-campaigns'] });
    },
  });
}

// ============================================================================
// NPS Responses
// ============================================================================

export function useNPSResponses(options?: {
  campaignId?: string;
  agencyWorkspaceId?: string;
  category?: 'promoter' | 'passive' | 'detractor';
  limit?: number;
}) {
  const { campaignId, agencyWorkspaceId, category, limit = 50 } = options || {};

  return useQuery({
    queryKey: ['nps-responses', campaignId, agencyWorkspaceId, category, limit],
    queryFn: async () => {
      let query = supabase
        .from('nps_responses')
        .select('*')
        .order('responded_at', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      }
      if (agencyWorkspaceId) {
        query = query.eq('agency_workspace_id', agencyWorkspaceId);
      }
      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as NPSResponse[];
    },
    enabled: !!(campaignId || agencyWorkspaceId),
  });
}

export function useSendNPSSurvey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      campaignId: string;
      contactId?: string;
      email?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('reputation-manager', {
        body: {
          action: 'send_nps_survey',
          campaign_id: params.campaignId,
          contact_id: params.contactId,
          email: params.email,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nps-responses'] });
      queryClient.invalidateQueries({ queryKey: ['nps-campaigns'] });
    },
  });
}

export function useSubmitNPSResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      responseId: string;
      score: number;
      feedbackText?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('reputation-manager', {
        body: {
          action: 'submit_nps_response',
          response_id: params.responseId,
          score: params.score,
          feedback_text: params.feedbackText,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nps-responses'] });
      queryClient.invalidateQueries({ queryKey: ['nps-campaigns'] });
    },
  });
}

// ============================================================================
// Reputation Summary & Stats
// ============================================================================

export function useReputationSummary(agencyWorkspaceId?: string) {
  return useQuery({
    queryKey: ['reputation-summary', agencyWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('reputation-manager', {
        body: {
          action: 'get_review_stats',
          agency_workspace_id: agencyWorkspaceId,
        },
      });

      if (error) throw error;
      return data as ReputationSummary;
    },
    enabled: !!agencyWorkspaceId,
  });
}

export function useReviewStats(agencyWorkspaceId?: string) {
  return useQuery({
    queryKey: ['review-stats', agencyWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_agency_reputation_summary')
        .select('*')
        .eq('agency_workspace_id', agencyWorkspaceId!)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as ReputationSummary | null;
    },
    enabled: !!agencyWorkspaceId,
  });
}

// ============================================================================
// Reputation Settings
// ============================================================================

export function useReputationSettings(agencyWorkspaceId?: string) {
  return useQuery({
    queryKey: ['reputation-settings', agencyWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reputation_settings')
        .select('*')
        .eq('agency_workspace_id', agencyWorkspaceId!)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!agencyWorkspaceId,
  });
}

export function useUpdateReputationSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      agencyWorkspaceId,
      ...settings
    }: {
      agencyWorkspaceId: string;
      [key: string]: unknown;
    }) => {
      const { data, error } = await supabase
        .from('reputation_settings')
        .upsert({
          agency_workspace_id: agencyWorkspaceId,
          ...settings,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reputation-settings'] });
    },
  });
}

// ============================================================================
// Review Response Templates
// ============================================================================

export function useReviewResponseTemplates(agencyWorkspaceId?: string) {
  return useQuery({
    queryKey: ['review-response-templates', agencyWorkspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_response_templates')
        .select('*')
        .or(`is_system.eq.true,agency_workspace_id.eq.${agencyWorkspaceId}`)
        .eq('status', 'active')
        .order('rating_min');

      if (error) throw error;
      return data;
    },
    enabled: !!agencyWorkspaceId,
  });
}
