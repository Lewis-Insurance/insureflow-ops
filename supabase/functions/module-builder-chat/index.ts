/**
 * Module Builder Chat - Edge Function
 * 
 * Handles the wizard conversation for creating/improving AI modules.
 * Actions: start, message, save_draft, publish, improve
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { requireAuth } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODULE_BUILDER_SYSTEM_PROMPT = `You are Lewi, an AI assistant that helps insurance agency staff create custom AI tools (called "modules"). Your job is to interview the user about what they want to build, then generate a complete module configuration.

## YOUR PERSONALITY
- Friendly and encouraging
- Ask clarifying questions but don't overwhelm
- Make intelligent assumptions based on insurance industry knowledge
- Suggest improvements and best practices

## CONVERSATION FLOW

### Phase 1: Discovery (2-4 exchanges)
Start by understanding what they want. Ask:
- What problem does this solve?
- What documents will it analyze?
- What output do they need?

### Phase 2: Clarification (1-3 exchanges)
Based on their description, ask targeted questions about:
- Document inputs (how many? what types?)
- Specific data to extract or analyze
- Output format preferences (summary, table, email draft, etc.)
- Any special instructions or edge cases

Keep questions grouped (2-3 at a time max) to avoid overwhelming.

### Phase 3: Generation
Once you have enough information, generate the module config and present it conversationally:

"Perfect! Based on what you've told me, here's what I'll create:

**[Module Name]**
[Brief description]

**What it does:**
- [Capability 1]
- [Capability 2]

**Inputs needed:**
- [X] document(s): [description]

**Output includes:**
- [Output 1]
- [Email draft if applicable]

Does this look right? I can adjust anything before you test it."

Then output the config in <module_config> tags.

### Phase 4: Refinement
If they want changes, make them and regenerate. Be flexible.

## OUTPUT FORMAT

When the user confirms they're happy OR when you have gathered enough information (usually after 2-3 exchanges), output the final config in this exact JSON structure wrapped in <module_config> tags:

<module_config>
{
  "name": "Module Name",
  "slug": "module-name-lowercase-hyphenated",
  "description": "Brief description for the card",
  "icon": "LucideIconName",
  "color": "blue|green|purple|orange|teal|indigo|slate|amber",
  "category": "analysis|extraction|review|generation|comparison",
  "system_prompt": "The full system prompt for this module...",
  "input_config": {
    "min_documents": 1,
    "max_documents": 3,
    "document_labels": ["Label 1", "Label 2"],
    "allow_text_input": true,
    "input_placeholder": "Any specific questions or focus areas?",
    "additional_fields": []
  },
  "output_config": {
    "format": "structured",
    "sections": ["section1", "section2"],
    "show_email_draft": true,
    "show_download_report": true
  }
}
</module_config>

## GENERATING SYSTEM PROMPTS

When generating the module's system_prompt, follow this structure:

You are an insurance document analyst specializing in [DOMAIN].

When given [DOCUMENT TYPE(S)], analyze and provide:
1. [EXTRACTION/ANALYSIS POINT 1]
2. [EXTRACTION/ANALYSIS POINT 2]
3. [EXTRACTION/ANALYSIS POINT 3]

[SPECIFIC INSTRUCTIONS FOR EDGE CASES]

Format your response as JSON with these sections:
{
  "section1": {...},
  "section2": {...},
  "email_draft": { "subject": "...", "body": "..." }
}

## ICON SUGGESTIONS
- Document analysis: FileSearch, FileText, FileBarChart, FileCheck
- Comparison: Scale, GitCompare, Columns
- Extraction: FileDigit, ClipboardList, TableProperties
- Review/Audit: FileCheck, ShieldCheck, AlertTriangle
- Generation: FileEdit, PenTool, Mail

## COLOR SUGGESTIONS
- analysis: blue, indigo
- extraction: teal, green
- review: orange, amber
- generation: purple, rose
- comparison: blue, slate

## INSURANCE DOMAIN KNOWLEDGE
You understand insurance concepts:
- Policy types: Auto, Home, Commercial, Workers Comp, GL, Umbrella, E&O, D&O, Cyber
- Document types: Declarations, COIs, Loss Runs, Applications, Endorsements, Quotes, Binders
- Common analyses: Coverage comparison, gap analysis, premium comparison, claims summary
- Industry terms: Limits, deductibles, endorsements, exclusions, named insured, additional insured

## IMPORTANT RULES
1. Never generate a module that claims to access external systems or APIs
2. All modules are document-focused (analyze uploaded documents)
3. Keep system prompts clear and specific
4. Generate reasonable defaults - user can always adjust
5. If unsure about something, ask rather than assume wrong
6. After 2-3 exchanges where you have enough info, generate the config - don't over-interview`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Authenticate
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }
    const user = authResult;

    const body = await req.json();
    const { session_id, message, action, module_id } = body;

    console.log('Module Builder action:', action, { session_id, module_id });

    // ========================================================================
    // ACTION: START NEW SESSION
    // ========================================================================
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

      if (error) throw error;

      const greeting = {
        role: 'assistant',
        content: "Hi! I'm here to help you create a new AI tool for the team. Tell me what you'd like to build - describe it in your own words, and I'll ask a few questions to make sure I get it right.\n\nFor example, you might say:\n- \"I want a tool that reads loss runs and summarizes claim history\"\n- \"I need something to compare two COIs and find differences\"\n- \"Help me create a module that extracts key info from applications\"",
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

    // ========================================================================
    // ACTION: IMPROVE EXISTING MODULE
    // ========================================================================
    if (action === 'improve') {
      if (!module_id) throw new Error('module_id required');

      const { data: existingModule, error: moduleError } = await supabase
        .from('ai_modules')
        .select('*')
        .eq('id', module_id)
        .single();

      if (moduleError || !existingModule) throw new Error('Module not found');

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
        content: `I see you want to improve the **${existingModule.name}** module. Here's what it currently does:\n\n"${existingModule.description}"\n\nWhat would you like to change or improve? You can:\n- Add new capabilities\n- Change what it extracts or analyzes\n- Modify the output format\n- Adjust the instructions\n\nJust tell me what's not working well or what you'd like to add!`,
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

    // ========================================================================
    // ACTION: SEND MESSAGE
    // ========================================================================
    if (action === 'message') {
      if (!session_id || !message) {
        throw new Error('session_id and message required');
      }

      const { data: session, error: sessionError } = await supabase
        .from('ai_module_builder_sessions')
        .select('*')
        .eq('id', session_id)
        .single();

      if (sessionError || !session) throw new Error('Session not found');

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

      // Call AI
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: aiMessages,
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });

      if (!aiResponse.ok) {
        throw new Error(`AI request failed: ${await aiResponse.text()}`);
      }

      const aiData = await aiResponse.json();
      const assistantContent = aiData.choices?.[0]?.message?.content || '';

      // Check for module config
      let generatedConfig = null;
      let status = 'in_progress';

      const configMatch = assistantContent.match(/<module_config>([\s\S]*?)<\/module_config>/);
      if (configMatch) {
        try {
          generatedConfig = JSON.parse(configMatch[1].trim());
          status = 'ready_to_test';
        } catch (e) {
          console.error('Failed to parse module config:', e);
        }
      }

      // Clean content (remove config tags for display)
      const cleanContent = assistantContent
        .replace(/<module_config>[\s\S]*?<\/module_config>/, '')
        .trim();

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

    // ========================================================================
    // ACTION: SAVE DRAFT
    // ========================================================================
    if (action === 'save_draft') {
      if (!session_id) throw new Error('session_id required');

      const { data: session, error: sessionError } = await supabase
        .from('ai_module_builder_sessions')
        .select('*')
        .eq('id', session_id)
        .single();

      if (sessionError || !session) throw new Error('Session not found');
      if (!session.generated_config) throw new Error('No module config generated yet');

      const config = session.generated_config;

      // Create draft module with unique slug
      const { data: module, error: moduleError } = await supabase
        .from('ai_modules')
        .insert({
          slug: `${config.slug}-${Date.now()}`,
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

      if (moduleError) throw moduleError;

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

    // ========================================================================
    // ACTION: PUBLISH
    // ========================================================================
    if (action === 'publish') {
      if (!module_id) throw new Error('module_id required');

      const { data: module, error: fetchError } = await supabase
        .from('ai_modules')
        .select('*')
        .eq('id', module_id)
        .single();

      if (fetchError || !module) throw new Error('Module not found');
      if (module.created_by !== user.id) throw new Error('Not authorized');

      // Generate clean slug
      const baseSlug = module.slug.replace(/-\d+$/, '');

      // Check if slug exists
      const { data: existing } = await supabase
        .from('ai_modules')
        .select('id')
        .eq('slug', baseSlug)
        .eq('status', 'published')
        .neq('id', module_id)
        .maybeSingle();

      const finalSlug = existing ? `${baseSlug}-${Date.now()}` : baseSlug;

      // Update to published
      const { data: published, error: publishError } = await supabase
        .from('ai_modules')
        .update({
          slug: finalSlug,
          status: 'published',
          is_active: true,
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

    // ========================================================================
    // ACTION: UPDATE CONFIG (manual edits)
    // ========================================================================
    if (action === 'update_config') {
      if (!session_id) throw new Error('session_id required');
      const { config } = body;
      if (!config) throw new Error('config required');

      await supabase
        .from('ai_module_builder_sessions')
        .update({ generated_config: config })
        .eq('id', session_id);

      return new Response(
        JSON.stringify({ success: true, config }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error: any) {
    console.error('Module builder error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

