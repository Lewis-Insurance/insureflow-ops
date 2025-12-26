import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireAuth } from '../_shared/auth.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FollowUpRule {
  id: string;
  name: string;
  trigger_type: string;
  delay_hours: number;
  max_follow_ups: number;
  follow_up_interval_hours: number;
  action_type: string;
  task_template_id?: string;
  email_template_id?: string;
  sms_template_text?: string;
  assign_to_role?: string;
  assign_to_user_id?: string;
  task_priority?: string;
  min_quote_score?: number;
  max_quote_score?: number;
  line_of_business?: string[];
  carrier_names?: string[];
}

interface Quote {
  id: string;
  account_id: string;
  quote_ref: string;
  premium?: number;
  quote_score?: number;
  line_of_business: string;
  status: string;
  created_at: string;
  quoted_at?: string;
  expires_at?: string;
  carrier_info?: { name: string };
  account?: { name: string };
}

/**
 * Process Quote Follow-Ups
 * Batch job that evaluates quotes and creates follow-up tasks based on rules
 * Should be called on a schedule (e.g., hourly or daily)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabaseClient, corsHeaders);
    if (authResult instanceof Response) {
      return authResult; // Return 401 if auth failed
    }
    const authenticatedUser = authResult;

    const { quote_id, force_reprocess } = await req.json().catch(() => ({}));

    console.log("Starting follow-up processor", {
      quote_id,
      force_reprocess,
      timestamp: new Date().toISOString(),
    });

    // Step 1: Get active follow-up rules
    const { data: rules, error: rulesError } = await supabaseClient
      .from("quote_followup_rules")
      .select("*")
      .eq("is_active", true);

    if (rulesError) throw rulesError;

    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No active follow-up rules found",
          processed: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${rules.length} active follow-up rules`);

    // Step 2: Get quotes that need follow-up
    let quotesQuery = supabaseClient
      .from("quotes")
      .select(`
        *,
        carrier_info:carriers!quotes_carrier_id_fkey(name),
        account:accounts!quotes_account_id_fkey(name)
      `)
      .in("status", ["open", "pending"]); // Only process open/pending quotes

    if (quote_id) {
      quotesQuery = quotesQuery.eq("id", quote_id);
    }

    const { data: quotes, error: quotesError } = await quotesQuery;
    if (quotesError) throw quotesError;

    console.log(`Found ${quotes?.length || 0} quotes to evaluate`);

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Step 3: Process each quote against each rule
    for (const quote of quotes || []) {
      for (const rule of rules) {
        try {
          // Check if quote matches rule criteria
          if (!await matchesRuleCriteria(quote, rule, supabaseClient, force_reprocess)) {
            skipped++;
            continue;
          }

          // Calculate when follow-up should be scheduled
          const scheduledAt = calculateScheduledTime(quote, rule);

          if (!scheduledAt) {
            skipped++;
            continue;
          }

          // Check if follow-up already exists for this quote and rule
          const { data: existing } = await supabaseClient
            .from("quote_followups")
            .select("id, follow_up_number")
            .eq("quote_id", quote.id)
            .eq("rule_id", rule.id)
            .order("follow_up_number", { ascending: false })
            .limit(1)
            .single();

          const followUpNumber = (existing?.follow_up_number || 0) + 1;

          // Check if we've exceeded max follow-ups
          if (followUpNumber > rule.max_follow_ups) {
            console.log(`Max follow-ups reached for quote ${quote.id} and rule ${rule.id}`);
            skipped++;
            continue;
          }

          // Create follow-up record
          const { data: followUp, error: createError } = await supabaseClient
            .from("quote_followups")
            .insert({
              quote_id: quote.id,
              rule_id: rule.id,
              scheduled_at: scheduledAt.toISOString(),
              status: "scheduled",
              follow_up_number: followUpNumber,
              metadata: {
                rule_name: rule.name,
                quote_score: quote.quote_score,
                quote_ref: quote.quote_ref,
              },
            })
            .select()
            .single();

          if (createError) {
            console.error(`Failed to create follow-up:`, createError);
            errors.push(`Quote ${quote.id}: ${createError.message}`);
            continue;
          }

          // Log to history
          await supabaseClient.from("quote_followup_history").insert({
            followup_id: followUp.id,
            quote_id: quote.id,
            event_type: "created",
            event_data: {
              rule_id: rule.id,
              rule_name: rule.name,
              scheduled_at: scheduledAt.toISOString(),
              follow_up_number: followUpNumber,
            },
          });

          created++;
          console.log(`Created follow-up for quote ${quote.id} (attempt #${followUpNumber})`);
        } catch (error) {
          console.error(`Error processing quote ${quote.id} with rule ${rule.id}:`, error);
          errors.push(`Quote ${quote.id}: ${(error instanceof Error ? error.message : String(error))}`);
        }
      }
    }

    // Step 4: Execute scheduled follow-ups that are due
    const executedCount = await executeScheduledFollowups(supabaseClient);

    return new Response(
      JSON.stringify({
        success: true,
        rules_evaluated: rules.length,
        quotes_evaluated: quotes?.length || 0,
        followups_created: created,
        followups_skipped: skipped,
        followups_executed: executedCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Error in process-quote-followups:", error);
    return new Response(
      JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * Check if quote matches rule criteria
 */
async function matchesRuleCriteria(
  quote: Quote,
  rule: FollowUpRule,
  supabaseClient: any,
  forceReprocess?: boolean
): Promise<boolean> {
  // Score filters
  if (rule.min_quote_score !== null && (quote.quote_score || 0) < rule.min_quote_score) {
    return false;
  }
  if (rule.max_quote_score !== null && (quote.quote_score || 0) > rule.max_quote_score) {
    return false;
  }

  // Line of business filter
  if (rule.line_of_business && rule.line_of_business.length > 0) {
    if (!rule.line_of_business.includes(quote.line_of_business)) {
      return false;
    }
  }

  // Carrier filter
  if (rule.carrier_names && rule.carrier_names.length > 0) {
    const carrierName = quote.carrier_info?.name;
    if (!carrierName || !rule.carrier_names.includes(carrierName)) {
      return false;
    }
  }

  // Trigger-specific logic
  switch (rule.trigger_type) {
    case "quote_created":
      // Check if enough time has passed since creation
      const hoursSinceCreation = getHoursSince(quote.created_at);
      return hoursSinceCreation >= rule.delay_hours;

    case "quote_score_threshold":
      // Immediate trigger for high-value quotes
      return (quote.quote_score || 0) >= (rule.min_quote_score || 85);

    case "days_since_activity":
      // Check last activity on quote (tasks, comments, etc.)
      const { data: lastActivity } = await supabaseClient
        .from("tasks")
        .select("updated_at")
        .eq("entity_type", "quote")
        .eq("entity_id", quote.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      const lastActivityDate = lastActivity?.updated_at || quote.created_at;
      const hoursSinceActivity = getHoursSince(lastActivityDate);
      return hoursSinceActivity >= rule.delay_hours;

    case "quote_expired":
      // Trigger before/after expiration
      if (!quote.expires_at) return false;
      const hoursUntilExpiration = getHoursUntil(quote.expires_at);
      // Negative delay_hours means "before expiration"
      if (rule.delay_hours < 0) {
        return Math.abs(hoursUntilExpiration) <= Math.abs(rule.delay_hours);
      }
      // Positive delay_hours means "after expiration"
      return hoursUntilExpiration >= rule.delay_hours;

    default:
      return false;
  }
}

/**
 * Calculate when follow-up should be scheduled
 */
function calculateScheduledTime(quote: Quote, rule: FollowUpRule): Date | null {
  const now = new Date();

  switch (rule.trigger_type) {
    case "quote_created":
    case "days_since_activity":
      // Schedule for now + delay
      return new Date(now.getTime() + rule.delay_hours * 60 * 60 * 1000);

    case "quote_score_threshold":
      // Immediate follow-up for high-value quotes
      return now;

    case "quote_expired":
      if (!quote.expires_at) return null;
      const expirationDate = new Date(quote.expires_at);
      // Schedule relative to expiration date
      return new Date(expirationDate.getTime() + rule.delay_hours * 60 * 60 * 1000);

    default:
      return null;
  }
}

/**
 * Execute follow-ups that are scheduled and due
 */
async function executeScheduledFollowups(supabaseClient: any): Promise<number> {
  const now = new Date().toISOString();

  // Get due follow-ups
  const { data: dueFollowups, error } = await supabaseClient
    .from("quote_followups")
    .select(`
      *,
      rule:quote_followup_rules!quote_followups_rule_id_fkey(*),
      quote:quotes!quote_followups_quote_id_fkey(
        *,
        account:accounts!quotes_account_id_fkey(name),
        carrier_info:carriers!quotes_carrier_id_fkey(name)
      )
    `)
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true });

  if (error) {
    console.error("Error fetching due follow-ups:", error);
    return 0;
  }

  let executed = 0;

  for (const followup of dueFollowups || []) {
    try {
      const actions = followup.rule.action_type;

      // Execute actions based on rule configuration
      if (actions === "create_task" || actions === "all") {
        await createFollowUpTask(followup, supabaseClient);
      }

      if (actions === "send_email" || actions === "all") {
        await sendFollowUpEmail(followup, supabaseClient);
      }

      if (actions === "send_sms" || actions === "all") {
        await sendFollowUpSMS(followup, supabaseClient);
      }

      if (actions === "create_notification" || actions === "all") {
        await createFollowUpNotification(followup, supabaseClient);
      }

      // Update status to sent
      await supabaseClient
        .from("quote_followups")
        .update({
          status: "sent",
          executed_at: new Date().toISOString(),
        })
        .eq("id", followup.id);

      // Log to history
      await supabaseClient.from("quote_followup_history").insert({
        followup_id: followup.id,
        quote_id: followup.quote_id,
        event_type: "sent",
        event_data: { actions_taken: actions },
      });

      executed++;
    } catch (error) {
      console.error(`Failed to execute follow-up ${followup.id}:`, error);

      // Mark as failed
      await supabaseClient
        .from("quote_followups")
        .update({
          status: "failed",
          error_message: (error instanceof Error ? error.message : String(error)),
        })
        .eq("id", followup.id);

      await supabaseClient.from("quote_followup_history").insert({
        followup_id: followup.id,
        quote_id: followup.quote_id,
        event_type: "failed",
        event_data: { error: (error instanceof Error ? error.message : String(error)) },
      });
    }
  }

  return executed;
}

/**
 * Create a follow-up task
 */
async function createFollowUpTask(followup: any, supabaseClient: any) {
  const quote = followup.quote;
  const rule = followup.rule;

  const taskData = {
    account_id: quote.account_id,
    entity_type: "quote",
    entity_id: quote.id,
    title: `Follow up on quote ${quote.quote_ref || quote.id.slice(0, 8)} - Attempt #${followup.follow_up_number}`,
    description: `Automated follow-up for ${quote.account?.name || "customer"}.\n\nQuote Details:\n- Score: ${quote.quote_score || "Not scored"}/100\n- Premium: ${quote.premium ? `$${quote.premium}` : "TBD"}\n- Carrier: ${quote.carrier_info?.name || "Unknown"}\n\nRule: ${rule.name}`,
    priority: rule.task_priority || "medium",
    status: "pending",
    category: "quote",
    assignee_id: rule.assign_to_user_id,
    due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Due in 24 hours
    metadata: {
      auto_generated: true,
      followup_id: followup.id,
      followup_number: followup.follow_up_number,
      rule_id: rule.id,
    },
  };

  const { data: task, error } = await supabaseClient
    .from("tasks")
    .insert(taskData)
    .select()
    .single();

  if (error) throw error;

  // Update follow-up with task reference
  await supabaseClient
    .from("quote_followups")
    .update({ task_created_id: task.id })
    .eq("id", followup.id);

  console.log(`Created task ${task.id} for follow-up ${followup.id}`);
}

/**
 * Send follow-up email (placeholder - integrate with email-send function)
 */
async function sendFollowUpEmail(followup: any, supabaseClient: any) {
  // TODO: Integrate with email-send edge function
  // For now, just log the timestamp
  await supabaseClient
    .from("quote_followups")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", followup.id);

  console.log(`Email follow-up sent for ${followup.id}`);
}

/**
 * Send follow-up SMS (placeholder - integrate with twilio-sms function)
 */
async function sendFollowUpSMS(followup: any, supabaseClient: any) {
  // TODO: Integrate with twilio-sms edge function
  // For now, just log the timestamp
  await supabaseClient
    .from("quote_followups")
    .update({ sms_sent_at: new Date().toISOString() })
    .eq("id", followup.id);

  console.log(`SMS follow-up sent for ${followup.id}`);
}

/**
 * Create in-app notification
 */
async function createFollowUpNotification(followup: any, supabaseClient: any) {
  const quote = followup.quote;
  const rule = followup.rule;

  // Get assignee from rule or quote owner
  const userId = rule.assign_to_user_id; // TODO: Or get from quote/account ownership

  if (!userId) {
    console.log("No user to notify for follow-up", followup.id);
    return;
  }

  const { data: notification, error } = await supabaseClient
    .from("notifications")
    .insert({
      user_id: userId,
      type: "task_reminder",
      title: `Follow up on quote ${quote.quote_ref || quote.id.slice(0, 8)}`,
      message: `Automated follow-up reminder (Attempt #${followup.follow_up_number}). Quote score: ${quote.quote_score || "N/A"}/100`,
      entity_type: "quote",
      entity_id: quote.id,
      action_url: `/quotes/${quote.id}`,
      metadata: {
        followup_id: followup.id,
        rule_name: rule.name,
      },
    })
    .select()
    .single();

  if (error) throw error;

  // Update follow-up with notification reference
  await supabaseClient
    .from("quote_followups")
    .update({ notification_created_id: notification.id })
    .eq("id", followup.id);

  console.log(`Created notification ${notification.id} for follow-up ${followup.id}`);
}

/**
 * Helper: Get hours since a date
 */
function getHoursSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60);
}

/**
 * Helper: Get hours until a date
 */
function getHoursUntil(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  return (date.getTime() - now.getTime()) / (1000 * 60 * 60);
}
