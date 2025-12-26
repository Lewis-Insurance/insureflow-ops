import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { requireAuth } from '../_shared/auth.ts';
import { validateEnvVars, configErrorResponse } from '../_shared/env-validator.ts';
import { chatCompletion, getAIProvider, type ChatMessage, type Tool, type AIResponse } from '../_shared/ai-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate all required environment variables upfront
    const env = validateEnvVars({
      SUPABASE_URL: 'Supabase project URL',
      SUPABASE_SERVICE_ROLE_KEY: 'Supabase service role key',
    });

    // Get AI provider (validates API key internally)
    const aiProvider = getAIProvider();
    console.log(`Using AI provider: ${aiProvider}`);

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult; // Return 401 if auth failed
    }
    const authenticatedUser = authResult;

    const { messages, context } = await req.json();
    console.log('AI Assistant Chat Request:', { messageCount: messages.length, context });

    // Get user's account
    const { data: membership } = await supabase
      .from('account_memberships')
      .select('account_id')
      .eq('user_id', authenticatedUser.id)
      .limit(1)
      .single();

    const accountId = membership?.account_id;

    // Define tools for data access
    const tools = [
      {
        type: "function",
        function: {
          name: "search_leads",
          description: "Search and retrieve leads/prospects. Use this to find lead information, check lead status, or get lead details.",
          parameters: {
            type: "object",
            properties: {
              search_query: {
                type: "string",
                description: "Search term for lead name, email, or phone"
              },
                status: {
                type: "string",
                enum: ["new", "contacted", "qualified", "quoted", "pending", "won", "lost"],
                description: "Filter by lead status"
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10)"
              }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_customers",
          description: "Search and retrieve customer/account information. Use this to find customer details, contact information, or account status.",
          parameters: {
            type: "object",
            properties: {
              search_query: {
                type: "string",
                description: "Search term for customer name, email, or phone"
              },
              account_type: {
                type: "string",
                enum: ["individual", "business"],
                description: "Filter by account type"
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10)"
              }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_policies",
          description: "Search and retrieve policy information. Use this to find policy details, coverage information, or policy status.",
          parameters: {
            type: "object",
            properties: {
              policy_number: {
                type: "string",
                description: "Specific policy number to look up"
              },
              search_query: {
                type: "string",
                description: "Search term for policy holder name or carrier"
              },
              policy_type: {
                type: "string",
                description: "Filter by policy type (e.g., auto, home, life)"
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10)"
              }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_renewals",
          description: "Search and retrieve renewal information. Use this to find upcoming renewals, check renewal status, or get renewal details.",
          parameters: {
            type: "object",
            properties: {
              search_query: {
                type: "string",
                description: "Search term for policy holder name or policy number"
              },
              status: {
                type: "string",
                enum: ["upcoming", "in_progress", "completed", "lost"],
                description: "Filter by renewal status"
              },
              days_until_renewal: {
                type: "number",
                description: "Filter renewals due within X days"
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10)"
              }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_ao_renewals",
          description: "Search and retrieve Auto-Owners renewal information. Use this for Auto-Owners specific renewal data, quotes, and competitive analysis.",
          parameters: {
            type: "object",
            properties: {
              search_query: {
                type: "string",
                description: "Search term for customer name or policy number"
              },
              status: {
                type: "string",
                enum: ["pending", "contacted", "quoted", "renewed", "lost", "cancelled"],
                description: "Filter by AO renewal status"
              },
              priority: {
                type: "string",
                enum: ["low", "normal", "high", "urgent"],
                description: "Filter by priority level"
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10)"
              }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_tasks",
          description: "Search and retrieve task information. Use this to find tasks, check task status, due dates, or assignments.",
          parameters: {
            type: "object",
            properties: {
              search_query: {
                type: "string",
                description: "Search term for task title or description"
              },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed", "cancelled"],
                description: "Filter by task status"
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description: "Filter by priority level"
              },
              assigned_to: {
                type: "string",
                description: "Filter by assignee user ID"
              },
              due_soon: {
                type: "boolean",
                description: "Filter tasks due within next 7 days"
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10)"
              }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_quotes",
          description: "Search and retrieve quote information. Use this to find quotes, check quote status, or get pricing details.",
          parameters: {
            type: "object",
            properties: {
              search_query: {
                type: "string",
                description: "Search term for customer name or quote details"
              },
              status: {
                type: "string",
                enum: ["draft", "pending", "sent", "accepted", "rejected", "expired"],
                description: "Filter by quote status"
              },
              line_of_business: {
                type: "string",
                description: "Filter by insurance type (e.g., auto, home, life)"
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10)"
              }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_contacts",
          description: "Search and retrieve contact information. Use this to find specific contacts associated with accounts.",
          parameters: {
            type: "object",
            properties: {
              search_query: {
                type: "string",
                description: "Search term for contact name, email, or phone"
              },
              account_id: {
                type: "string",
                description: "Filter by specific account ID"
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 10)"
              }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_dashboard_summary",
          description: "Get aggregated dashboard metrics like task counts, upcoming renewals, policy expirations, and key statistics.",
          parameters: {
            type: "object",
            properties: {
              include_tasks: {
                type: "boolean",
                description: "Include task statistics"
              },
              include_renewals: {
                type: "boolean",
                description: "Include renewal statistics"
              },
              include_policies: {
                type: "boolean",
                description: "Include policy statistics"
              }
            },
            additionalProperties: false
          }
        }
      }
    ];

    // Build system prompt with context
    let systemPrompt = `You are an intelligent AI assistant for an insurance agency management system. You have access to tools that allow you to search and retrieve information about:
- Leads and prospects
- Customers and accounts
- Insurance policies
- Policy renewals
- Auto-Owners renewals
- Tasks and assignments
- Quotes
- Contacts
- Dashboard metrics and summaries

When a user asks about any of these topics, use the appropriate tool to fetch real data from the database. Always:
1. Use the tools to get accurate, current information
2. Provide specific details from the data you retrieve
3. Format responses in a clear, professional manner with clickable links
4. Create markdown links to records using these URL patterns:
   - Leads: [Lead Name](/leads?id={id})
   - Customers: [Customer Name](/customers/{id})
   - Policies: [Policy Number](/policies/{id})
   - Renewals: [Renewal](/renewals/{id})
   - AO Renewals: [AO Renewal](/ao-renewals/{id}/edit)
   - Tasks: [Task Title](/tasks)
   - Quotes: [Quote](/quotes)
5. When showing lists, provide key information and links for easy navigation
6. If you need to search for something, use the appropriate tool
7. Be helpful and proactive in suggesting relevant information
8. For numerical data, format currency with $ and dates in a readable format

Current user context: ${context ? JSON.stringify(context) : 'General assistant'}`;

    // Build chat messages
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: any) => ({ role: m.role, content: m.content }))
    ];

    // Make initial API call with tools using the new AI client
    const initialResponse = await chatCompletion(chatMessages, tools as Tool[]);

    // Check if AI wants to use tools
    if (initialResponse.tool_calls && initialResponse.tool_calls.length > 0) {
      const toolResults: ChatMessage[] = [];

      for (const toolCall of initialResponse.tool_calls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        console.log('Tool call:', functionName, args);

        let result: any;

        try {
          switch (functionName) {
            case 'search_leads': {
              let query = supabase
                .from('leads')
                .select('*')
                .limit(args.limit || 10);

              if (args.status) query = query.eq('status', args.status);
              if (args.search_query) {
                query = query.or(`first_name.ilike.%${args.search_query}%,last_name.ilike.%${args.search_query}%,email.ilike.%${args.search_query}%,phone.ilike.%${args.search_query}%`);
              }

              const { data, error } = await query.order('created_at', { ascending: false });
              if (error) throw error;
              
              // Format results with URLs
              result = data?.map((lead: any) => ({
                id: lead.id,
                name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
                email: lead.email,
                phone: lead.phone,
                status: lead.status,
                source: lead.source,
                score: lead.score,
                url: `/leads?id=${lead.id}`,
                summary: `${lead.first_name || ''} ${lead.last_name || ''} - ${lead.status} - Score: ${lead.score || 0}`
              })) || [];
              break;
            }

            case 'search_customers': {
              let query = supabase
                .from('accounts')
                .select('*')
                .is('deleted_at', null)
                .limit(args.limit || 10);

              if (args.account_type) query = query.eq('account_type', args.account_type);
              if (args.search_query) {
                query = query.or(`name.ilike.%${args.search_query}%,email.ilike.%${args.search_query}%,phone.ilike.%${args.search_query}%`);
              }

              const { data, error } = await query.order('created_at', { ascending: false });
              if (error) throw error;
              
              // Format results with URLs
              result = data?.map((account: any) => ({
                id: account.id,
                name: account.name,
                email: account.email,
                phone: account.phone,
                account_type: account.account_type,
                url: `/customers/${account.id}`,
                summary: `${account.name} - ${account.account_type || 'N/A'}`
              })) || [];
              break;
            }

            case 'search_policies': {
              // First get policies
              let policyQuery = supabase
                .from('policies')
                .select('*')
                .limit(args.limit || 10);

              if (args.policy_number) policyQuery = policyQuery.eq('policy_number', args.policy_number);
              if (args.policy_type) policyQuery = policyQuery.eq('line_of_business', args.policy_type);
              if (args.search_query) {
                policyQuery = policyQuery.or(`policy_number.ilike.%${args.search_query}%,carrier.ilike.%${args.search_query}%`);
              }

              const { data: policies, error: policyError } = await policyQuery.order('created_at', { ascending: false });
              if (policyError) throw policyError;

              // Get account associations for these policies
              const policyIds = policies?.map((p: any) => p.id) || [];
              let accountNames: Record<string, string> = {};
              
              if (policyIds.length > 0) {
                const { data: associations } = await supabase
                  .from('policies_accounts')
                  .select('policy_id, accounts(name)')
                  .in('policy_id', policyIds);
                
                associations?.forEach((assoc: any) => {
                  if (assoc.policy_id && assoc.accounts) {
                    accountNames[assoc.policy_id] = (assoc.accounts as any).name;
                  }
                });
              }

              // Format results with URLs
              result = policies?.map((policy: any) => ({
                id: policy.id,
                policy_number: policy.policy_number,
                carrier: policy.carrier,
                line_of_business: policy.line_of_business,
                premium: policy.premium,
                effective_date: policy.effective_date,
                expiration_date: policy.expiration_date,
                status: policy.status,
                account_name: accountNames[policy.id] || 'Unknown',
                url: `/policies/${policy.id}`,
                summary: `${policy.policy_number} - ${policy.carrier} - ${policy.line_of_business || 'N/A'} - $${policy.premium || 0}`
              })) || [];
              break;
            }

            case 'search_renewals': {
              let query = supabase
                .from('renewals')
                .select('*')
                .limit(args.limit || 10);

              if (args.status) query = query.eq('status', args.status);
              if (args.search_query) {
                query = query.or(`policy_number.ilike.%${args.search_query}%`);
              }
              if (args.days_until_renewal) {
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + args.days_until_renewal);
                query = query.lte('renewal_date', futureDate.toISOString());
              }

              const { data, error } = await query.order('renewal_date', { ascending: true });
              if (error) throw error;
              
              // Format results with URLs
              result = data?.map((renewal: any) => ({
                id: renewal.id,
                policy_number: renewal.policy_number,
                carrier: renewal.carrier,
                renewal_date: renewal.renewal_date,
                status: renewal.status,
                current_premium: renewal.current_premium,
                url: `/renewals/${renewal.id}`,
                summary: `${renewal.policy_number} - ${renewal.carrier} - Due: ${renewal.renewal_date}`
              })) || [];
              break;
            }

            case 'search_ao_renewals': {
              let query = supabase
                .from('ao_renewals')
                .select('*, ao_renewal_quotes(*)')
                .is('deleted_at', null)
                .limit(args.limit || 10);

              if (args.status) query = query.eq('status', args.status);
              if (args.priority) query = query.eq('priority', args.priority);
              if (args.search_query) {
                query = query.or(`customer_name.ilike.%${args.search_query}%,policy_number.ilike.%${args.search_query}%`);
              }

              const { data, error } = await query.order('renewal_date', { ascending: true });
              if (error) throw error;
              
              // Format results with URLs
              result = data?.map((aoRenewal: any) => ({
                id: aoRenewal.id,
                customer_name: aoRenewal.customer_name,
                policy_number: aoRenewal.policy_number,
                renewal_date: aoRenewal.renewal_date,
                status: aoRenewal.status,
                priority: aoRenewal.priority,
                current_premium: aoRenewal.current_premium,
                quote_count: aoRenewal.ao_renewal_quotes?.length || 0,
                url: `/ao-renewals/${aoRenewal.id}/edit`,
                summary: `${aoRenewal.customer_name} - ${aoRenewal.policy_number} - ${aoRenewal.status} - Priority: ${aoRenewal.priority}`
              })) || [];
              break;
            }

            case 'search_tasks': {
              let query = supabase
                .from('tasks')
                .select('*, profiles(full_name)')
                .limit(args.limit || 10);

              if (args.status) query = query.eq('status', args.status);
              if (args.priority) query = query.eq('priority', args.priority);
              if (args.assigned_to) query = query.eq('assignee_id', args.assigned_to);
              if (args.due_soon) {
                const weekFromNow = new Date();
                weekFromNow.setDate(weekFromNow.getDate() + 7);
                query = query.lte('due_at', weekFromNow.toISOString());
              }
              if (args.search_query) {
                query = query.or(`title.ilike.%${args.search_query}%,description.ilike.%${args.search_query}%`);
              }

              const { data, error } = await query.order('due_at', { ascending: true });
              if (error) throw error;
              
              // Format results with URLs
              result = data?.map((task: any) => ({
                id: task.id,
                title: task.title,
                description: task.description,
                status: task.status,
                priority: task.priority,
                due_at: task.due_at,
                assignee: task.profiles?.full_name || 'Unassigned',
                url: `/tasks`,
                summary: `${task.title} - ${task.status} - Priority: ${task.priority} - Due: ${task.due_at || 'No due date'}`
              })) || [];
              break;
            }

            case 'search_quotes': {
              let query = supabase
                .from('quotes')
                .select('*, accounts(name), carriers(name)')
                .limit(args.limit || 10);

              if (args.status) query = query.eq('status', args.status);
              if (args.line_of_business) query = query.eq('line_of_business', args.line_of_business);
              if (args.search_query) {
                query = query.or(`quote_number.ilike.%${args.search_query}%`);
              }

              const { data, error } = await query.order('created_at', { ascending: false });
              if (error) throw error;
              
              // Format results with URLs
              result = data?.map((quote: any) => ({
                id: quote.id,
                quote_number: quote.quote_number,
                account_name: (quote.accounts as any)?.name || 'Unknown',
                carrier: (quote.carriers as any)?.name || quote.carrier_id,
                line_of_business: quote.line_of_business,
                premium: quote.premium,
                status: quote.status,
                url: `/quotes`,
                summary: `${quote.quote_number || 'Quote'} - ${(quote.accounts as any)?.name} - $${quote.premium || 0}`
              })) || [];
              break;
            }

            case 'search_contacts': {
              let query = supabase
                .from('contacts')
                .select('*, accounts(name)')
                .limit(args.limit || 10);

              if (args.account_id) query = query.eq('account_id', args.account_id);
              if (args.search_query) {
                query = query.or(`first_name.ilike.%${args.search_query}%,last_name.ilike.%${args.search_query}%,email.ilike.%${args.search_query}%,phone.ilike.%${args.search_query}%`);
              }

              const { data, error } = await query.order('created_at', { ascending: false });
              if (error) throw error;
              
              // Format results with URLs
              result = data?.map((contact: any) => ({
                id: contact.id,
                name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
                email: contact.email,
                phone: contact.phone,
                account_name: (contact.accounts as any)?.name || 'Unknown',
                account_id: contact.account_id,
                url: `/customers/${contact.account_id}`,
                summary: `${contact.first_name} ${contact.last_name} - ${(contact.accounts as any)?.name}`
              })) || [];
              break;
            }

            case 'get_dashboard_summary': {
              const summaryData: any = {};

              if (args.include_tasks !== false) {
                const { data: taskStats } = await supabase
                  .from('tasks')
                  .select('status, priority')
                  .in('status', ['pending', 'in_progress']);
                
                const overdueTasks = await supabase
                  .from('tasks')
                  .select('id')
                  .lt('due_at', new Date().toISOString())
                  .eq('status', 'pending');

                summaryData.tasks = {
                  total_active: taskStats?.length || 0,
                  overdue: overdueTasks.data?.length || 0,
                  by_priority: {
                    high: taskStats?.filter((t: any) => t.priority === 'high').length || 0,
                    medium: taskStats?.filter((t: any) => t.priority === 'medium').length || 0,
                    low: taskStats?.filter((t: any) => t.priority === 'low').length || 0
                  }
                };
              }

              if (args.include_renewals !== false) {
                const thirtyDaysFromNow = new Date();
                thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

                const { data: upcomingRenewals } = await supabase
                  .from('renewals')
                  .select('id, renewal_date, current_premium')
                  .lte('renewal_date', thirtyDaysFromNow.toISOString())
                  .gte('renewal_date', new Date().toISOString())
                  .in('status', ['upcoming', 'in_progress']);

                const { data: aoUpcomingRenewals } = await supabase
                  .from('ao_renewals')
                  .select('id, renewal_date, current_premium')
                  .lte('renewal_date', thirtyDaysFromNow.toISOString())
                  .gte('renewal_date', new Date().toISOString())
                  .is('deleted_at', null);

                summaryData.renewals = {
                  upcoming_30_days: (upcomingRenewals?.length || 0) + (aoUpcomingRenewals?.length || 0),
                  total_premium_at_risk: (upcomingRenewals?.reduce((sum, r) => sum + (r.current_premium || 0), 0) || 0) +
                                        (aoUpcomingRenewals?.reduce((sum, r) => sum + (r.current_premium || 0), 0) || 0)
                };
              }

              if (args.include_policies !== false) {
                const ninetyDaysFromNow = new Date();
                ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

                const { data: expiringPolicies } = await supabase
                  .from('policies')
                  .select('id, expiration_date, premium')
                  .lte('expiration_date', ninetyDaysFromNow.toISOString())
                  .gte('expiration_date', new Date().toISOString());

                const { data: allPolicies } = await supabase
                  .from('policies')
                  .select('premium')
                  .eq('status', 'active');

                summaryData.policies = {
                  expiring_90_days: expiringPolicies?.length || 0,
                  total_active: allPolicies?.length || 0,
                  total_premium: allPolicies?.reduce((sum, p) => sum + (p.premium || 0), 0) || 0
                };
              }

              result = summaryData;
              break;
            }

            default:
              result = { error: 'Unknown function' };
          }
        } catch (error) {
          console.error(`Error executing ${functionName}:`, error);
          result = { error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error' };
        }

        toolResults.push({
          role: 'tool' as const,
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
          name: functionName,
        });
      }

      // Build messages for second call including assistant's tool call and results
      const followUpMessages: ChatMessage[] = [
        ...chatMessages,
        { role: 'assistant', content: '' }, // Placeholder for assistant's tool call request
        ...toolResults
      ];

      // Make second API call with tool results
      const finalResponse = await chatCompletion(followUpMessages, tools as Tool[]);

      return new Response(
        JSON.stringify({
          content: finalResponse.content,
          tool_calls_made: toolResults.length
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // No tool calls needed, return direct response
    return new Response(
      JSON.stringify({ content: initialResponse.content }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: unknown) {
    console.error('Error in ai-assistant-chat:', error);

    // Check if this is a configuration error (missing env vars)
    if (error instanceof Error && error.message.includes('Missing required environment')) {
      return configErrorResponse(error, corsHeaders);
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
