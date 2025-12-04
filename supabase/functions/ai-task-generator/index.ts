import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TaskGenerationRequest {
  triggerType: 'document_analysis_complete' | 'coverage_gap_identified' | 'renewal_risk_alert' | 'lead_score_increase' | 'policy_expiring_soon' | 'quote_expired' | 'customer_interaction' | 'claim_filed' | 'payment_overdue';
  triggerData: {
    account_id?: string;
    customer_name?: string;
    entity_type?: string;
    entity_id?: string;
    [key: string]: any;
  };
  ruleId?: string; // Optional: specify specific rule
  enhanceWithAI?: boolean; // Whether to enhance with AI context
}

interface TaskGenerationRule {
  id: string;
  name: string;
  task_title_template: string;
  task_description_template: string;
  task_type: string;
  priority: string;
  assign_to_type: string;
  assign_to_user_id?: string;
  assign_to_role?: string;
  due_in_days?: number;
  due_in_hours?: number;
  tags: string[];
  ai_prompt?: string;
  conditions: any;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const request: TaskGenerationRequest = await req.json();
    const { triggerType, triggerData, ruleId, enhanceWithAI = true } = request;

    console.log("Task generation request:", { triggerType, ruleId, enhanceWithAI });

    // Find matching rules
    let rules: TaskGenerationRule[] = [];

    if (ruleId) {
      // Use specific rule
      const { data, error } = await supabaseClient
        .from("task_generation_rules")
        .select("*")
        .eq("id", ruleId)
        .eq("is_active", true)
        .single();

      if (error) throw error;
      if (data) rules = [data];
    } else {
      // Find all matching rules for trigger type
      const { data, error } = await supabaseClient
        .from("task_generation_rules")
        .select("*")
        .eq("trigger_type", triggerType)
        .eq("is_active", true);

      if (error) throw error;
      rules = data || [];
    }

    if (rules.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "No active rules found for trigger type",
          generatedTasks: []
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`Found ${rules.length} matching rules`);

    // Generate tasks from each matching rule
    const generatedTasks = [];

    for (const rule of rules) {
      try {
        // Check if conditions match
        if (rule.conditions && Object.keys(rule.conditions).length > 0) {
          const conditionsMet = checkConditions(rule.conditions, triggerData);
          if (!conditionsMet) {
            console.log(`Conditions not met for rule: ${rule.name}`);
            continue;
          }
        }

        // Replace template variables
        const taskTitle = replaceTemplateVariables(rule.task_title_template, triggerData);
        const taskDescription = replaceTemplateVariables(rule.task_description_template || "", triggerData);

        // Enhance with AI if requested
        let aiContext = "";
        let aiSuggestions: any = null;

        if (enhanceWithAI && rule.ai_prompt) {
          try {
            const aiEnhancement = await enhanceWithAIContext(rule.ai_prompt, triggerData, taskDescription);
            aiContext = aiEnhancement.context;
            aiSuggestions = aiEnhancement.suggestions;
          } catch (aiError) {
            console.error("AI enhancement failed:", aiError);
            // Continue without AI enhancement
          }
        }

        // Determine assignment
        let assignedTo: string | null = null;
        let assignmentReason = "";

        if (rule.assign_to_type === "specific_user" && rule.assign_to_user_id) {
          assignedTo = rule.assign_to_user_id;
          assignmentReason = "Assigned to specific user per rule";
        } else if (rule.assign_to_type === "account_owner" && triggerData.account_id) {
          // Get account owner
          const { data: membership } = await supabaseClient
            .from("account_memberships")
            .select("user_id")
            .eq("account_id", triggerData.account_id)
            .eq("role", "owner")
            .single();

          if (membership) {
            assignedTo = membership.user_id;
            assignmentReason = "Assigned to account owner";
          }
        } else if (rule.assign_to_type === "creator") {
          assignedTo = user.id;
          assignmentReason = "Assigned to task creator";
        }

        // Calculate due date
        let dueDate: string | null = null;
        if (rule.due_in_days) {
          const date = new Date();
          date.setDate(date.getDate() + rule.due_in_days);
          dueDate = date.toISOString();
        } else if (rule.due_in_hours) {
          const date = new Date();
          date.setHours(date.getHours() + rule.due_in_hours);
          dueDate = date.toISOString();
        }

        // Create the task
        const finalDescription = aiContext
          ? `${taskDescription}\n\n**AI Insights:**\n${aiContext}`
          : taskDescription;

        const { data: task, error: taskError } = await supabaseClient
          .from("tasks")
          .insert({
            title: taskTitle,
            description: finalDescription,
            type: rule.task_type,
            priority: rule.priority,
            assigned_to: assignedTo,
            due_date: dueDate,
            account_id: triggerData.account_id,
            status: "pending",
            tags: rule.tags,
          })
          .select()
          .single();

        if (taskError) {
          console.error("Task creation error:", taskError);

          // Log failure
          await supabaseClient.from("generated_tasks_log").insert({
            rule_id: rule.id,
            trigger_type: triggerType,
            trigger_entity_type: triggerData.entity_type,
            trigger_entity_id: triggerData.entity_id,
            trigger_data: triggerData,
            generation_status: "failed",
            generation_error: taskError.message,
          });

          continue;
        }

        // Log successful generation
        await supabaseClient.from("generated_tasks_log").insert({
          task_id: task.id,
          rule_id: rule.id,
          trigger_type: triggerType,
          trigger_entity_type: triggerData.entity_type,
          trigger_entity_id: triggerData.entity_id,
          trigger_data: triggerData,
          was_ai_enhanced: !!aiContext,
          ai_context: aiContext || null,
          ai_suggestions: aiSuggestions,
          assigned_to: assignedTo,
          assignment_reason: assignmentReason,
          generation_status: "success",
        });

        generatedTasks.push({
          taskId: task.id,
          taskTitle,
          ruleName: rule.name,
          assignedTo,
          dueDate,
        });

        console.log(`Successfully generated task: ${taskTitle}`);
      } catch (ruleError) {
        console.error(`Error processing rule ${rule.name}:`, ruleError);

        // Log failure
        await supabaseClient.from("generated_tasks_log").insert({
          rule_id: rule.id,
          trigger_type: triggerType,
          trigger_entity_type: triggerData.entity_type,
          trigger_entity_id: triggerData.entity_id,
          trigger_data: triggerData,
          generation_status: "failed",
          generation_error: ruleError.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Generated ${generatedTasks.length} task(s)`,
        generatedTasks,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Task generation error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});

// Helper: Replace template variables like {{variable_name}}
function replaceTemplateVariables(template: string, data: any): string {
  let result = template;

  // Replace {{variable}} with data values
  const matches = template.match(/\{\{([^}]+)\}\}/g);
  if (matches) {
    matches.forEach((match) => {
      const key = match.replace(/\{\{|\}\}/g, "").trim();
      const value = data[key] || `[${key}]`;
      result = result.replace(match, value);
    });
  }

  return result;
}

// Helper: Check if conditions are met
function checkConditions(conditions: any, data: any): boolean {
  // Simple condition checking - can be enhanced
  for (const [key, value] of Object.entries(conditions)) {
    if (key.endsWith("_min")) {
      const dataKey = key.replace("_min", "");
      if (data[dataKey] < value) return false;
    } else if (key.endsWith("_max")) {
      const dataKey = key.replace("_max", "");
      if (data[dataKey] > value) return false;
    } else {
      // Exact match
      if (data[key] !== value) return false;
    }
  }
  return true;
}

// Helper: Enhance task with AI context
async function enhanceWithAIContext(
  aiPrompt: string,
  triggerData: any,
  taskDescription: string
): Promise<{ context: string; suggestions: any }> {
  // Call OpenAI/Claude to enhance task context
  const lovableApiUrl = Deno.env.get("LOVABLE_API_URL") || "https://api.lovable.app/v1/chat";
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

  if (!lovableApiKey) {
    throw new Error("LOVABLE_API_KEY not configured");
  }

  const systemPrompt = `You are an AI assistant helping generate actionable task context for insurance agents.
Provide specific, actionable insights based on the trigger data.`;

  const userPrompt = `${aiPrompt}

Trigger Data:
${JSON.stringify(triggerData, null, 2)}

Current Task Description:
${taskDescription}

Provide:
1. Additional context (2-3 sentences)
2. Specific action recommendations (bullet points)
3. Key considerations or risks`;

  const response = await fetch(lovableApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableApiKey}`,
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.statusText}`);
  }

  const result = await response.json();
  const aiResponse = result.choices?.[0]?.message?.content || "";

  return {
    context: aiResponse,
    suggestions: {
      raw_response: aiResponse,
      timestamp: new Date().toISOString(),
    },
  };
}
