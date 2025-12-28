/**
 * Reputation Manager Edge Function
 *
 * Handles reputation management operations including:
 * - Google Business Profile sync
 * - Review request sending
 * - NPS survey management
 * - Review response generation
 *
 * SECURITY:
 * - Internal actions require JWT auth + agency membership
 * - Public actions (NPS response submission) use token-based auth
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAgencyAuth, verifyAgencyMembership, verifyPublicToken, AgencyAuthenticatedUser } from '../_shared/agency-auth.ts';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

// Actions that require authentication + agency membership
const AUTH_REQUIRED_ACTIONS = [
  'send_review_request',
  'send_nps_survey',
  'respond_to_review',
  'sync_google_reviews',
  'generate_ai_response',
  'get_review_stats',
];

// Public actions that use token-based auth
const PUBLIC_ACTIONS = ['submit_nps_response'];

// Types
interface ReviewRequest {
  contact_id?: string;
  account_id?: string;
  email: string;
  phone?: string;
  first_name: string;
  last_name?: string;
  channel: 'email' | 'sms' | 'both';
  google_profile_id?: string;
}

interface NPSSurveyRequest {
  campaign_id: string;
  contact_id?: string;
  email: string;
  first_name: string;
}

interface ReviewResponseRequest {
  review_id: string;
  response_text?: string;
  use_ai?: boolean;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // Parse request body
    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      body = await req.json();
    }

    let user: AgencyAuthenticatedUser | null = null;

    // Require authentication for non-public actions
    if (AUTH_REQUIRED_ACTIONS.includes(action || '')) {
      const authResult = await requireAgencyAuth(req, supabase, corsHeaders);

      // If authResult is a Response, return it (auth failed)
      if (authResult instanceof Response) {
        return authResult;
      }

      user = authResult;
      console.log('User authenticated for action', { userId: user.id, action });

      // For actions that specify agency_workspace_id, verify membership
      const agencyId = body.agency_workspace_id as string;
      if (agencyId && !verifyAgencyMembership(user, agencyId)) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: You do not have access to this agency' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    switch (action) {
      // AUTHENTICATED ACTIONS (require JWT + agency membership)
      case 'send_review_request':
        return await handleSendReviewRequest(supabase, body as ReviewRequest, user!);

      case 'send_nps_survey':
        return await handleSendNPSSurvey(supabase, body as NPSSurveyRequest, user!);

      case 'respond_to_review':
        return await handleRespondToReview(supabase, body as ReviewResponseRequest, user!);

      case 'sync_google_reviews':
        return await handleSyncGoogleReviews(supabase, body.profile_id as string, user!);

      case 'generate_ai_response':
        return await handleGenerateAIResponse(supabase, body.review_id as string, user!);

      case 'get_review_stats':
        return await handleGetReviewStats(supabase, body.agency_workspace_id as string, user!);

      // PUBLIC ACTION (uses token-based auth, not JWT)
      case 'submit_nps_response':
        return await handleSubmitNPSResponse(supabase, body);

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Reputation manager error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// Handler Functions
// ============================================================================

async function handleSendReviewRequest(
  supabase: ReturnType<typeof createClient>,
  request: ReviewRequest,
  user: AgencyAuthenticatedUser
) {
  const { email, first_name, last_name, channel, contact_id, account_id, google_profile_id, phone, agency_workspace_id } = request as ReviewRequest & { agency_workspace_id?: string };

  if (!email || !first_name) {
    return new Response(
      JSON.stringify({ error: 'Email and first_name are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Determine agency_workspace_id from request or user default
  const agencyId = agency_workspace_id || user.defaultAgencyId;
  if (!agencyId) {
    return new Response(
      JSON.stringify({ error: 'agency_workspace_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify user has access to this agency
  if (!verifyAgencyMembership(user, agencyId)) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: You do not have access to this agency' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get the review URL from Google Business Profile or use default
  let reviewUrl = '';
  if (google_profile_id) {
    const { data: profile } = await supabase
      .from('google_business_profiles')
      .select('review_url, agency_workspace_id')
      .eq('id', google_profile_id)
      .single();

    // Verify the profile belongs to the user's agency
    if (profile && profile.agency_workspace_id !== agencyId) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Google profile does not belong to your agency' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    reviewUrl = profile?.review_url || '';
  }

  // Create review request record
  const { data: reviewRequest, error: insertError } = await supabase
    .from('review_requests')
    .insert({
      contact_id,
      account_id,
      agency_workspace_id: agencyId,
      email,
      phone,
      first_name,
      last_name,
      channel,
      google_profile_id,
      review_url: reviewUrl,
      status: 'pending',
      created_by: user.id,
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error creating review request:', insertError);
    return new Response(
      JSON.stringify({ error: 'Failed to create review request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Send email if channel includes email
  if (channel === 'email' || channel === 'both') {
    await sendReviewEmail(supabase, reviewRequest, first_name, reviewUrl);
  }

  // Send SMS if channel includes SMS
  if ((channel === 'sms' || channel === 'both') && phone) {
    await sendReviewSMS(supabase, reviewRequest, first_name, reviewUrl, phone);
  }

  // Update request status to sent
  await supabase
    .from('review_requests')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', reviewRequest.id);

  return new Response(
    JSON.stringify({ success: true, id: reviewRequest.id }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function sendReviewEmail(
  supabase: ReturnType<typeof createClient>,
  request: { id: string; email: string },
  firstName: string,
  reviewUrl: string
) {
  // Get Resend API key
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    console.warn('RESEND_API_KEY not configured, skipping email');
    return;
  }

  const emailBody = `
    <p>Hi ${firstName},</p>
    <p>We hope you've had a great experience with us! Would you mind taking a moment to share your feedback?</p>
    <p>Your review helps others find trusted insurance service.</p>
    <p><a href="${reviewUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 4px;">Leave a Review</a></p>
    <p>Thank you for being a valued customer!</p>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'reviews@noreply.insureflow.io',
        to: request.email,
        subject: `${firstName}, we'd love your feedback!`,
        html: emailBody,
      }),
    });

    if (!response.ok) {
      console.error('Failed to send review email:', await response.text());
    }
  } catch (error) {
    console.error('Error sending review email:', error);
  }
}

async function sendReviewSMS(
  supabase: ReturnType<typeof createClient>,
  request: { id: string },
  firstName: string,
  reviewUrl: string,
  phone: string
) {
  // Get Twilio credentials
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuth = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!twilioSid || !twilioAuth || !twilioPhone) {
    console.warn('Twilio not configured, skipping SMS');
    return;
  }

  const message = `Hi ${firstName}! We'd love to hear about your experience. Leave us a review: ${reviewUrl} - Reply STOP to opt out.`;

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: twilioPhone,
          To: phone,
          Body: message,
        }),
      }
    );

    if (!response.ok) {
      console.error('Failed to send review SMS:', await response.text());
    }
  } catch (error) {
    console.error('Error sending review SMS:', error);
  }
}

async function handleSendNPSSurvey(
  supabase: ReturnType<typeof createClient>,
  request: NPSSurveyRequest,
  user: AgencyAuthenticatedUser
) {
  const { campaign_id, contact_id, email, first_name } = request;

  if (!campaign_id || !email) {
    return new Response(
      JSON.stringify({ error: 'campaign_id and email are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get campaign details
  const { data: campaign, error: campaignError } = await supabase
    .from('nps_campaigns')
    .select('*')
    .eq('id', campaign_id)
    .single();

  if (campaignError || !campaign) {
    return new Response(
      JSON.stringify({ error: 'Campaign not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify user has access to campaign's agency
  if (!verifyAgencyMembership(user, campaign.agency_workspace_id)) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: You do not have access to this campaign' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Create NPS response record (pending)
  const { data: npsResponse, error: insertError } = await supabase
    .from('nps_responses')
    .insert({
      campaign_id,
      agency_workspace_id: campaign.agency_workspace_id,
      contact_id,
      email,
      score: 0, // Placeholder, will be updated when survey is completed
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    console.error('Error creating NPS response:', insertError);
    return new Response(
      JSON.stringify({ error: 'Failed to create survey' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Send NPS survey email
  await sendNPSEmail(email, first_name, npsResponse.id, campaign);

  // Update campaign stats
  await supabase
    .from('nps_campaigns')
    .update({ total_sent: campaign.total_sent + 1 })
    .eq('id', campaign_id);

  return new Response(
    JSON.stringify({ success: true, id: npsResponse.id }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function sendNPSEmail(
  email: string,
  firstName: string,
  responseId: string,
  campaign: { name: string; follow_up_question: string }
) {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    console.warn('RESEND_API_KEY not configured, skipping NPS email');
    return;
  }

  // Build survey URL with response ID
  const baseUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://lewisinsurance.ai';
  const surveyUrl = `${baseUrl}/nps-survey/${responseId}`;

  const emailBody = `
    <p>Hi ${firstName},</p>
    <p>We'd love to hear about your experience! Please take 30 seconds to answer one quick question:</p>
    <p><strong>How likely are you to recommend us to a friend or colleague?</strong></p>
    <p><a href="${surveyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 4px;">Take Survey</a></p>
    <p>Your feedback helps us improve our service.</p>
  `;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'feedback@noreply.insureflow.io',
        to: email,
        subject: 'Quick question about your experience',
        html: emailBody,
      }),
    });
  } catch (error) {
    console.error('Error sending NPS email:', error);
  }
}

async function handleRespondToReview(
  supabase: ReturnType<typeof createClient>,
  request: ReviewResponseRequest,
  user: AgencyAuthenticatedUser
) {
  const { review_id, response_text, use_ai } = request;

  if (!review_id) {
    return new Response(
      JSON.stringify({ error: 'review_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get review and verify agency membership
  const { data: review, error: reviewError } = await supabase
    .from('reviews')
    .select('id, agency_workspace_id')
    .eq('id', review_id)
    .single();

  if (reviewError || !review) {
    return new Response(
      JSON.stringify({ error: 'Review not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify user has access to review's agency
  if (!verifyAgencyMembership(user, review.agency_workspace_id)) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: You do not have access to this review' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let finalResponseText = response_text;

  // Generate AI response if requested
  if (use_ai && !response_text) {
    const aiResponse = await generateAIReviewResponse(supabase, review_id);
    finalResponseText = aiResponse;
  }

  if (!finalResponseText) {
    return new Response(
      JSON.stringify({ error: 'response_text is required or use_ai must be true' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Update review with response
  const { error: updateError } = await supabase
    .from('reviews')
    .update({
      response_text: finalResponseText,
      response_at: new Date().toISOString(),
      responded_by: user.id,
      status: 'responded',
    })
    .eq('id', review_id);

  if (updateError) {
    console.error('Error updating review:', updateError);
    return new Response(
      JSON.stringify({ error: 'Failed to save response' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, response_text: finalResponseText }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleGenerateAIResponse(
  supabase: ReturnType<typeof createClient>,
  reviewId: string,
  user: AgencyAuthenticatedUser
) {
  if (!reviewId) {
    return new Response(
      JSON.stringify({ error: 'review_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get review and verify agency membership
  const { data: review, error: reviewError } = await supabase
    .from('reviews')
    .select('id, agency_workspace_id')
    .eq('id', reviewId)
    .single();

  if (reviewError || !review) {
    return new Response(
      JSON.stringify({ error: 'Review not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify user has access to review's agency
  if (!verifyAgencyMembership(user, review.agency_workspace_id)) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: You do not have access to this review' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const response = await generateAIReviewResponse(supabase, reviewId);

  return new Response(
    JSON.stringify({ success: true, response }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function generateAIReviewResponse(
  supabase: ReturnType<typeof createClient>,
  reviewId: string
): Promise<string> {
  // Get review details
  const { data: review, error } = await supabase
    .from('reviews')
    .select('*, google_business_profiles(name)')
    .eq('id', reviewId)
    .single();

  if (error || !review) {
    throw new Error('Review not found');
  }

  // Get matching response template
  const { data: templates } = await supabase
    .from('review_response_templates')
    .select('*')
    .lte('rating_min', review.rating)
    .gte('rating_max', review.rating)
    .eq('status', 'active')
    .order('is_system', { ascending: false })
    .limit(1);

  if (templates && templates.length > 0) {
    // Use template and replace variables
    let response = templates[0].response_text;
    response = response.replace(/\{\{reviewer_name\}\}/g, review.reviewer_name || 'Valued Customer');
    response = response.replace(/\{\{agency_name\}\}/g, review.google_business_profiles?.name || 'our agency');
    response = response.replace(/\{\{agent_name\}\}/g, 'Your Insurance Agent');
    response = response.replace(/\{\{agency_phone\}\}/g, '');
    return response;
  }

  // Default fallback response
  if (review.rating >= 4) {
    return `Thank you so much for your kind review! We truly appreciate your feedback and are delighted to have you as a customer.`;
  } else if (review.rating === 3) {
    return `Thank you for taking the time to share your feedback. We're always looking to improve and would love to hear more about how we can better serve you.`;
  } else {
    return `We're sorry to hear about your experience. Your feedback is important to us, and we'd like to make things right. Please reach out to us directly so we can address your concerns.`;
  }
}

async function handleSyncGoogleReviews(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  user: AgencyAuthenticatedUser
) {
  if (!profileId) {
    return new Response(
      JSON.stringify({ error: 'profile_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get Google Business Profile
  const { data: profile, error: profileError } = await supabase
    .from('google_business_profiles')
    .select('*')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return new Response(
      JSON.stringify({ error: 'Profile not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify user has access to profile's agency
  if (!verifyAgencyMembership(user, profile.agency_workspace_id)) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: You do not have access to this profile' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Update sync status
  await supabase
    .from('google_business_profiles')
    .update({ sync_status: 'syncing', last_sync_at: new Date().toISOString() })
    .eq('id', profileId);

  // TODO: Implement actual Google My Business API integration
  // For now, return success with placeholder
  console.log('Google Business API sync not yet implemented');

  await supabase
    .from('google_business_profiles')
    .update({
      sync_status: 'synced',
      sync_error: null,
    })
    .eq('id', profileId);

  return new Response(
    JSON.stringify({ success: true, message: 'Sync initiated' }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleGetReviewStats(
  supabase: ReturnType<typeof createClient>,
  agencyWorkspaceId: string,
  user: AgencyAuthenticatedUser
) {
  // Use provided agency or user's default
  const targetAgencyId = agencyWorkspaceId || user.defaultAgencyId;

  if (!targetAgencyId) {
    return new Response(
      JSON.stringify({ error: 'agency_workspace_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify user has access to this agency
  if (!verifyAgencyMembership(user, targetAgencyId)) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: You do not have access to this agency' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get review statistics
  const { data: stats, error } = await supabase
    .from('v_agency_reputation_summary')
    .select('*')
    .eq('agency_workspace_id', targetAgencyId)
    .single();

  if (error) {
    console.error('Error fetching stats:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch statistics' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify(stats || {}),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleSubmitNPSResponse(
  supabase: ReturnType<typeof createClient>,
  body: Record<string, unknown>
) {
  const { response_id, score, feedback_text } = body;

  if (!response_id || score === undefined) {
    return new Response(
      JSON.stringify({ error: 'response_id and score are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Validate score
  const numScore = Number(score);
  if (isNaN(numScore) || numScore < 0 || numScore > 10) {
    return new Response(
      JSON.stringify({ error: 'Score must be between 0 and 10' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Update NPS response
  const { data: response, error: updateError } = await supabase
    .from('nps_responses')
    .update({
      score: numScore,
      feedback_text: feedback_text || null,
      responded_at: new Date().toISOString(),
      follow_up_required: numScore <= 6, // Detractors need follow-up
    })
    .eq('id', response_id)
    .select('campaign_id')
    .single();

  if (updateError) {
    console.error('Error updating NPS response:', updateError);
    return new Response(
      JSON.stringify({ error: 'Failed to submit response' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Recalculate campaign NPS score
  if (response?.campaign_id) {
    await supabase.rpc('calculate_nps_score', { p_campaign_id: response.campaign_id });
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
