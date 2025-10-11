import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ticketId, messages, ticketContext } = await req.json();

    console.log('AI Ticket Automation Request:', {
      action,
      ticketId,
      messagesCount: messages?.length || 0,
    });

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    let systemPrompt = '';
    let userPrompt = '';

    if (action === 'summarize') {
      systemPrompt = 'You are an expert customer service analyst. Provide concise, actionable summaries of support tickets.';
      userPrompt = `Summarize this customer support ticket conversation. Include:\n1. Key issue\n2. Customer concerns\n3. Current status\n4. Recommended next actions\n\nConversation:\n${messages.map((m: any) => `${m.role}: ${m.content}`).join('\n\n')}`;
    } else if (action === 'draft_response') {
      systemPrompt = 'You are a professional customer service representative. Write clear, empathetic, and helpful responses to customer inquiries.';
      userPrompt = `Draft a response to this customer support ticket.\n\nTicket Subject: ${ticketContext?.subject}\nCustomer: ${ticketContext?.accountName}\n\nConversation:\n${messages.map((m: any) => `${m.role}: ${m.content}`).join('\n\n')}\n\nWrite a professional, empathetic response that addresses the customer's concerns and provides clear next steps.`;
    } else if (action === 'extract_action_items') {
      systemPrompt = 'You are an expert at extracting actionable tasks from conversations. Return JSON array of action items.';
      userPrompt = `Extract actionable tasks from this support ticket conversation. Return ONLY a JSON array of objects with fields: title, priority (low|medium|high|urgent), category.\n\nConversation:\n${messages.map((m: any) => `${m.role}: ${m.content}`).join('\n\n')}`;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    console.log('AI Response generated successfully');

    let result: any = {};
    if (action === 'summarize') {
      result = { summary: aiResponse };
    } else if (action === 'draft_response') {
      result = { draftResponse: aiResponse };
    } else if (action === 'extract_action_items') {
      try {
        const parsed = JSON.parse(aiResponse);
        result = { actionItems: Array.isArray(parsed) ? parsed : [parsed] };
      } catch {
        result = { actionItems: [] };
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in ai-ticket-automation:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
