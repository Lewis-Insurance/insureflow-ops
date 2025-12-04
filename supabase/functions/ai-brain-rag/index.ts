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

    const { action, query, category, context, knowledge } = await req.json();
    console.log('AI Brain RAG Request:', { action, query, category });

    // Get user's account
    const { data: membership } = await supabase
      .from('account_memberships')
      .select('account_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!membership) {
      throw new Error('No account found');
    }

    switch (action) {
      case 'query': {
        // Generate embedding for query
        const embeddingResponse = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: query,
          }),
        });

        if (!embeddingResponse.ok) {
          throw new Error('Failed to generate query embedding');
        }

        const embeddingData = await embeddingResponse.json();
        const queryEmbedding = embeddingData.data[0].embedding;

        // Search knowledge base using vector similarity
        const { data: results, error: searchError } = await supabase.rpc('search_knowledge', {
          query_embedding: queryEmbedding,
          match_threshold: 0.7,
          match_count: 5,
          filter_category: category || null,
          filter_account_id: membership.account_id
        });

        if (searchError) throw searchError;

        // Build context from search results
        const contextText = results
          .map((r: any) => `Title: ${r.title}\nContent: ${r.content}\nCategory: ${r.category}`)
          .join('\n\n---\n\n');

        // Generate AI response with RAG context
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content: `You are an AI assistant with access to the company's knowledge base. Use the following context to answer the user's question. If the context doesn't contain relevant information, say so and provide a general answer.

Context from knowledge base:
${contextText}

Always cite which knowledge entries you used to answer the question.`
              },
              {
                role: 'user',
                content: query
              }
            ],
          }),
        });

        if (!aiResponse.ok) {
          throw new Error('Failed to generate AI response');
        }

        const aiData = await aiResponse.json();
        const answer = aiData.choices[0].message.content;

        return new Response(
          JSON.stringify({
            answer,
            sources: results.map((r: any) => ({
              id: r.id,
              title: r.title,
              category: r.category,
              similarity: r.similarity
            })),
            context: context || {}
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        );
      }

      case 'add_knowledge': {
        if (!knowledge) {
          throw new Error('Knowledge data required');
        }

        // Generate embedding for content
        const embeddingResponse = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: `${knowledge.title}\n${knowledge.content}`,
          }),
        });

        if (!embeddingResponse.ok) {
          throw new Error('Failed to generate embedding');
        }

        const embeddingData = await embeddingResponse.json();
        const embedding = embeddingData.data[0].embedding;

        // Insert knowledge with embedding
        const { data: insertedKnowledge, error: insertError } = await supabase
          .from('knowledge_base')
          .insert({
            account_id: membership.account_id,
            title: knowledge.title,
            content: knowledge.content,
            category: knowledge.category,
            tags: knowledge.tags || [],
            source: knowledge.source || 'manual',
            embedding: embedding,
            created_by: user.id
          })
          .select()
          .single();

        if (insertError) throw insertError;

        return new Response(
          JSON.stringify({
            success: true,
            knowledge: insertedKnowledge
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        );
      }

      case 'update_embeddings': {
        // Get all knowledge entries without embeddings
        const { data: knowledgeEntries, error: fetchError } = await supabase
          .from('knowledge_base')
          .select('id, title, content')
          .eq('account_id', membership.account_id)
          .is('embedding', null);

        if (fetchError) throw fetchError;

        let updated = 0;

        for (const entry of knowledgeEntries || []) {
          try {
            // Generate embedding
            const embeddingResponse = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'text-embedding-3-small',
                input: `${entry.title}\n${entry.content}`,
              }),
            });

            if (!embeddingResponse.ok) continue;

            const embeddingData = await embeddingResponse.json();
            const embedding = embeddingData.data[0].embedding;

            // Update knowledge entry
            await supabase
              .from('knowledge_base')
              .update({ embedding })
              .eq('id', entry.id);

            updated++;
          } catch (err) {
            console.error(`Failed to update embedding for ${entry.id}:`, err);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            updated,
            total: knowledgeEntries?.length || 0
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error: unknown) {
    console.error('Error in ai-brain-rag:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error occurred'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
