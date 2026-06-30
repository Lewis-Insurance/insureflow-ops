import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { modelBoundaryFetch } from '../_shared/modelBoundaryFetch.ts';

// System prompt for the AI that helps build modules
const MODULE_BUILDER_SYSTEM_PROMPT = `You are Lewi, an AI assistant that helps insurance agency staff create custom AI tools (called "modules"). Your job is to interview the user about what they want to build, then generate a complete module configuration.

## YOUR PERSONALITY
- Friendly and encouraging
- Ask clarifying questions but don't overwhelm
- Make intelligent assumptions based on insurance industry knowledge
- Suggest improvements and best practices

## CONVERSATION FLOW

### Phase 1: Discovery (2-4 exchanges)
Start by understanding what they want. Ask about:
- What problem does this solve?
- What documents will it analyze?
- What output do they need?

### Phase 2: Clarification (1-3 exchanges)
Ask targeted questions about:
- Document inputs (how many? what types?)
- Specific data to extract or analyze
- Output format preferences
- Any special instructions

Keep questions grouped (2-3 at a time max).

### Phase 3: Generation
Once you have enough information, generate the module config and present it:

"Perfect! Based on what you've told me, here's what I'll create:

**[Module Name]**
[Brief description]

**What it does:**
- [Capability 1]
- [Capability 2]

**Inputs needed:**
- [X] document(s)

**Output includes:**
- [Output 1]
- [Output 2]

Does this look right? Say 'yes' or 'create it' to generate the final configuration, or tell me what to change."

### Phase 4: Final Generation
When user confirms, output the config in this exact format wrapped in <module_config> tags:

<module_config>
{
  "name": "Module Name",
  "slug": "module-name-lowercase",
  "description": "Brief description",
  "icon": "LucideIconName",
  "color": "blue",
  "category": "analysis",
  "system_prompt": "The full system prompt...",
  "input_config": {
    "min_documents": 1,
    "max_documents": 3,
    "document_labels": ["Label 1"],
    "allow_text_input": true,
    "text_input_placeholder": "Optional placeholder"
  },
  "output_config": {
    "format": "structured",
    "sections": ["section1", "section2"],
    "show_email_draft": true,
    "show_download_report": true
  }
}
</module_config>

## ICON OPTIONS
FileSearch, FileText, FileBarChart, FileCheck, Scale, GitCompare, Columns, FileDigit, ClipboardList, TableProperties, ShieldCheck, AlertTriangle, FileEdit, PenTool, Mail, Brain, Search, Sparkles

## COLOR OPTIONS
blue, green, purple, orange, teal, indigo, rose, amber, slate

## CATEGORY OPTIONS
analysis, extraction, review, generation, comparison

## INSURANCE KNOWLEDGE
You understand: Policy types (Auto, Home, Commercial, WC, GL, Umbrella, E&O, D&O, Cyber), Document types (Declarations, COIs, Loss Runs, Applications, Endorsements, Quotes, Binders), Common analyses (coverage comparison, gap analysis, premium comparison, claims summary).

## RULES
1. All modules analyze uploaded documents - never promise external API access
2. Keep system prompts clear and specific
3. Generate reasonable defaults
4. If unsure, ask rather than assume`;

serve(async (req) => {
    // Handle CORS preflight
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const origin = req.headers.get('origin');
    const corsHeaders = getCorsHeaders(origin);

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Require authentication
        const authResult = await requireAuth(req, supabase, corsHeaders);
        if (authResult instanceof Response) {
            return authResult;
        }
        const user = authResult;

        const body = await req.json();
        const { action, session_id, message, module_id } = body;

        console.log(`Module builder action: ${action}, user: ${user.id}`);

        // ACTION: Start new session
        if (action === 'start') {
            const { data: session, error } = await supabase
                .from('ai_module_builder_sessions')
                .insert({
                    session_type: 'create',
                    messages: [],
                    status: 'in_progress',
                    created_by: user.id,
                })
                .select()
                .single();

            if (error) {
                console.error('Error creating session:', error);
                throw error;
            }

            const greeting = {
                role: 'assistant',
                content: "Hi! I'm here to help you create a new AI tool for the team. Tell me what you'd like to build - describe it in your own words, and I'll ask a few questions to make sure I get it right.\n\nFor example:\n- \"I want a tool that reads loss runs and summarizes claim history\"\n- \"I need something to compare two COIs and find differences\"\n- \"Help me create a module that extracts key info from applications\"",
                timestamp: new Date().toISOString(),
            };

            await supabase
                .from('ai_module_builder_sessions')
                .update({ messages: [greeting] })
                .eq('id', session.id);

            return new Response(
                JSON.stringify({
                    session_id: session.id,
                    message: greeting,
                    status: 'in_progress',
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ACTION: Send message
        if (action === 'message') {
            if (!session_id || !message) {
                throw new Error('session_id and message required');
            }

            // Fetch session
            const { data: session, error: sessionError } = await supabase
                .from('ai_module_builder_sessions')
                .select('*')
                .eq('id', session_id)
                .single();

            if (sessionError || !session) {
                throw new Error('Session not found');
            }

            // Add user message
            const userMessage = {
                role: 'user',
                content: message,
                timestamp: new Date().toISOString(),
            };

            const updatedMessages = [...(session.messages || []), userMessage];

            // Build messages for AI
            const aiMessages = [
                { role: 'system', content: MODULE_BUILDER_SYSTEM_PROMPT },
                ...updatedMessages.map((m: any) => ({
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: m.content,
                })),
            ];

            let assistantContent: string;

            if (!openaiApiKey) {
                throw new Error('OPENAI_API_KEY not configured. Please add it to Supabase Edge Function secrets.');
            }

            // Call OpenAI API
            const aiResponse = await modelBoundaryFetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`,
                },
                body: JSON.stringify({
                    model: 'gpt-5-mini',
                    messages: aiMessages,
                    temperature: 0.7,
                    max_tokens: 2000,
                }),
            });

            if (!aiResponse.ok) {
                const errorText = await aiResponse.text();
                console.error('OpenAI API error:', errorText);
                throw new Error(`OpenAI request failed: ${aiResponse.status}`);
            }

            const aiData = await aiResponse.json();
            assistantContent = aiData.choices[0].message.content;

            // Check for module config in response
            let generatedConfig = null;
            let status = 'in_progress';

            const configMatch = assistantContent.match(/<module_config>([\s\S]*?)<\/module_config>/);
            if (configMatch) {
                try {
                    generatedConfig = JSON.parse(configMatch[1].trim());
                    status = 'ready_to_test';
                    console.log('Generated config:', generatedConfig);
                } catch (e) {
                    console.error('Failed to parse module config:', e);
                }
            }

            // Clean assistant message (remove config tags for display)
            const cleanContent = assistantContent.replace(/<module_config>[\s\S]*?<\/module_config>/, '').trim();

            const assistantMessage = {
                role: 'assistant',
                content: cleanContent,
                timestamp: new Date().toISOString(),
                generated_config: generatedConfig,
            };

            const finalMessages = [...updatedMessages, assistantMessage];

            // Update session
            await supabase
                .from('ai_module_builder_sessions')
                .update({
                    messages: finalMessages,
                    generated_config: generatedConfig || session.generated_config,
                    status,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', session_id);

            return new Response(
                JSON.stringify({
                    session_id,
                    message: assistantMessage,
                    generated_config: generatedConfig,
                    status,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ACTION: Save as draft for testing
        if (action === 'save_draft') {
            if (!session_id) throw new Error('session_id required');

            const { data: session } = await supabase
                .from('ai_module_builder_sessions')
                .select('*')
                .eq('id', session_id)
                .single();

            if (!session?.generated_config) {
                throw new Error('No module config generated yet');
            }

            const config = session.generated_config;

            // Create draft module with unique slug
            const uniqueSlug = `${config.slug}-${Date.now()}`;

            const { data: module, error: moduleError } = await supabase
                .from('ai_modules')
                .insert({
                    slug: uniqueSlug,
                    name: config.name,
                    description: config.description,
                    icon: config.icon || 'FileText',
                    color: config.color || 'blue',
                    category: config.category || 'analysis',
                    system_prompt: config.system_prompt,
                    input_config: config.input_config,
                    output_config: config.output_config,
                    status: 'testing',
                    wizard_conversation: session.messages,
                    created_by: user.id,
                })
                .select()
                .single();

            if (moduleError) {
                console.error('Error creating module:', moduleError);
                throw moduleError;
            }

            // Update session
            await supabase
                .from('ai_module_builder_sessions')
                .update({
                    module_id: module.id,
                    status: 'testing',
                    final_config: config,
                })
                .eq('id', session_id);

            return new Response(
                JSON.stringify({
                    session_id,
                    module_id: module.id,
                    module,
                    status: 'testing',
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ACTION: Publish module
        if (action === 'publish') {
            if (!module_id) throw new Error('module_id required');

            // Get module
            const { data: module, error: fetchError } = await supabase
                .from('ai_modules')
                .select('*')
                .eq('id', module_id)
                .single();

            if (fetchError || !module) throw new Error('Module not found');
            if (module.created_by !== user.id) throw new Error('Not authorized');

            // Generate clean slug
            const baseSlug = module.slug.replace(/-\d+$/, '');

            // Check for existing published module with same slug
            const { data: existing } = await supabase
                .from('ai_modules')
                .select('id')
                .eq('slug', baseSlug)
                .eq('status', 'published')
                .single();

            const finalSlug = existing ? `${baseSlug}-${Date.now()}` : baseSlug;

            // Update to published
            const { data: published, error: publishError } = await supabase
                .from('ai_modules')
                .update({
                    slug: finalSlug,
                    status: 'published',
                    published_at: new Date().toISOString(),
                    published_by: user.id,
                })
                .eq('id', module_id)
                .select()
                .single();

            if (publishError) throw publishError;

            // Update session if provided
            if (session_id) {
                await supabase
                    .from('ai_module_builder_sessions')
                    .update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                    })
                    .eq('id', session_id);
            }

            return new Response(
                JSON.stringify({
                    module: published,
                    status: 'published',
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ACTION: Start improvement session
        if (action === 'improve') {
            if (!module_id) throw new Error('module_id required');

            const { data: existingModule } = await supabase
                .from('ai_modules')
                .select('*')
                .eq('id', module_id)
                .single();

            if (!existingModule) throw new Error('Module not found');

            const { data: session, error } = await supabase
                .from('ai_module_builder_sessions')
                .insert({
                    module_id,
                    session_type: 'improve',
                    messages: [],
                    generated_config: {
                        name: existingModule.name,
                        slug: existingModule.slug,
                        description: existingModule.description,
                        icon: existingModule.icon,
                        color: existingModule.color,
                        category: existingModule.category,
                        system_prompt: existingModule.system_prompt,
                        input_config: existingModule.input_config,
                        output_config: existingModule.output_config,
                    },
                    status: 'in_progress',
                    created_by: user.id,
                })
                .select()
                .single();

            if (error) throw error;

            const greeting = {
                role: 'assistant',
                content: `I see you want to improve the **${existingModule.name}** module.\n\nCurrent description: "${existingModule.description}"\n\nWhat would you like to change? You can:\n- Add new capabilities\n- Change what it extracts or analyzes\n- Modify the output format\n- Adjust the instructions\n\nJust tell me what's not working well or what you'd like to add!`,
                timestamp: new Date().toISOString(),
            };

            await supabase
                .from('ai_module_builder_sessions')
                .update({ messages: [greeting] })
                .eq('id', session.id);

            return new Response(
                JSON.stringify({
                    session_id: session.id,
                    message: greeting,
                    existing_config: session.generated_config,
                    status: 'in_progress',
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        throw new Error(`Unknown action: ${action}`);

    } catch (error) {
        console.error('Module builder error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
});
