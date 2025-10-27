import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { messages, context } = await req.json();
    console.log('AI Assistant Chat Request:', { messageCount: messages.length, context });

    // Get user's account
    const { data: membership } = await supabase
      .from('account_memberships')
      .select('account_id')
      .eq('user_id', user.id)
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
                enum: ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"],
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
                enum: ["pending", "in_progress", "completed", "cancelled"],
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

When a user asks about any of these topics, use the appropriate tool to fetch real data from the database. Always:
1. Use the tools to get accurate, current information
2. Provide specific details from the data you retrieve
3. Format responses in a clear, professional manner
4. If you need to search for something, use the appropriate tool
5. Be helpful and proactive in suggesting relevant information

Current user context: ${context ? JSON.stringify(context) : 'General assistant'}`;

    // Make initial API call with tools
    const initialResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        tools,
      }),
    });

    if (!initialResponse.ok) {
      const errorText = await initialResponse.text();
      console.error('AI API error:', initialResponse.status, errorText);
      throw new Error(`AI API error: ${initialResponse.status}`);
    }

    const initialData = await initialResponse.json();
    const firstMessage = initialData.choices[0].message;

    // Check if AI wants to use tools
    if (firstMessage.tool_calls && firstMessage.tool_calls.length > 0) {
      const toolResults = [];

      for (const toolCall of firstMessage.tool_calls) {
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

              if (accountId) query = query.eq('account_id', accountId);
              if (args.status) query = query.eq('status', args.status);
              if (args.search_query) {
                query = query.or(`first_name.ilike.%${args.search_query}%,last_name.ilike.%${args.search_query}%,email.ilike.%${args.search_query}%,phone.ilike.%${args.search_query}%`);
              }

              const { data, error } = await query;
              if (error) throw error;
              result = data;
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

              const { data, error } = await query;
              if (error) throw error;
              result = data;
              break;
            }

            case 'search_policies': {
              let query = supabase
                .from('policies')
                .select('*, accounts(name)')
                .limit(args.limit || 10);

              if (accountId) query = query.eq('account_id', accountId);
              if (args.policy_number) query = query.eq('policy_number', args.policy_number);
              if (args.policy_type) query = query.eq('line_of_business', args.policy_type);
              if (args.search_query) {
                query = query.or(`policy_number.ilike.%${args.search_query}%,carrier.ilike.%${args.search_query}%`);
              }

              const { data, error } = await query;
              if (error) throw error;
              result = data;
              break;
            }

            case 'search_renewals': {
              let query = supabase
                .from('renewals')
                .select('*')
                .limit(args.limit || 10);

              if (accountId) query = query.eq('account_id', accountId);
              if (args.status) query = query.eq('status', args.status);
              if (args.search_query) {
                query = query.or(`policy_number.ilike.%${args.search_query}%`);
              }
              if (args.days_until_renewal) {
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + args.days_until_renewal);
                query = query.lte('renewal_date', futureDate.toISOString());
              }

              const { data, error } = await query;
              if (error) throw error;
              result = data;
              break;
            }

            case 'search_ao_renewals': {
              let query = supabase
                .from('ao_renewals')
                .select('*, ao_renewal_quotes(*)')
                .is('deleted_at', null)
                .limit(args.limit || 10);

              if (accountId) query = query.eq('account_id', accountId);
              if (args.status) query = query.eq('status', args.status);
              if (args.priority) query = query.eq('priority', args.priority);
              if (args.search_query) {
                query = query.or(`customer_name.ilike.%${args.search_query}%,policy_number.ilike.%${args.search_query}%`);
              }

              const { data, error } = await query;
              if (error) throw error;
              result = data;
              break;
            }

            case 'search_tasks': {
              let query = supabase
                .from('tasks')
                .select('*, profiles(full_name)')
                .limit(args.limit || 10);

              if (accountId) query = query.eq('account_id', accountId);
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

              const { data, error } = await query.order('created_at', { ascending: false });
              if (error) throw error;
              result = data;
              break;
            }

            default:
              result = { error: 'Unknown function' };
          }
        } catch (error) {
          console.error(`Error executing ${functionName}:`, error);
          result = { error: error instanceof Error ? error.message : 'Unknown error' };
        }

        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: functionName,
          content: JSON.stringify(result)
        });
      }

      // Make second API call with tool results
      const finalResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
            firstMessage,
            ...toolResults
          ],
        }),
      });

      if (!finalResponse.ok) {
        throw new Error('Failed to generate final response');
      }

      const finalData = await finalResponse.json();
      const finalMessage = finalData.choices[0].message.content;

      return new Response(
        JSON.stringify({ 
          content: finalMessage,
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
      JSON.stringify({ content: firstMessage.content }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in ai-assistant-chat:', error);
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
