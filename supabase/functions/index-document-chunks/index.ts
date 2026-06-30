/**
 * Index Document OCR Text into Embeddings (RAG)
 *
 * Input:
 *  - document_id (uuid) OR analysis_id (uuid)
 *  - force_reindex?: boolean
 *
 * Requires Supabase secrets:
 *  - AZURE_OPENAI_ENDPOINT
 *  - AZURE_OPENAI_KEY
 *  - AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT_NAME
 *
 * Notes:
 *  - Uses ocr_text from public.document_analysis (latest completed row for document_id)
 *  - Splits by "--- PAGE BREAK ---" (used by ai-document-analysis-azure) and falls back to chunking by size.
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { modelBoundaryFetch } from '../_shared/modelBoundaryFetch.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sha1Hex(input: string): string {
  // Deno crypto
  const data = new TextEncoder().encode(input);
  const hash = crypto.subtle.digestSync("SHA-1", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function splitIntoPageTexts(ocrText: string): Array<{ page: number; text: string }> {
  const parts = ocrText.split("\n\n--- PAGE BREAK ---\n\n");
  if (parts.length <= 1) {
    // No explicit breaks; treat as single stream
    return [{ page: 1, text: ocrText }];
  }
  return parts.map((t, idx) => ({ page: idx + 1, text: t }));
}

function chunkBySize(text: string, maxChars = 3500): string[] {
  const chunks: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if ((cur + "\n" + line).length > maxChars) {
      if (cur.trim()) chunks.push(cur.trim());
      cur = line;
    } else {
      cur += (cur ? "\n" : "") + line;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

async function embedTextAzureOpenAI(input: string, endpoint: string, apiKey: string, deployment: string) {
  const cleanEndpoint = endpoint.replace(/\/$/, "");
  const url = `${cleanEndpoint}/openai/deployments/${deployment}/embeddings?api-version=2024-02-15-preview`;

  const resp = await modelBoundaryFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({ input }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Azure embeddings failed: ${resp.status} - ${text}`);
  }

  const data = await resp.json();
  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error("Azure embeddings response missing embedding");
  return embedding as number[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase credentials not configured");

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) return authResult;

    const { document_id, analysis_id, force_reindex } = await req.json();
    if (!document_id && !analysis_id) throw new Error("document_id or analysis_id is required");

    const AZURE_OPENAI_ENDPOINT = Deno.env.get("AZURE_OPENAI_ENDPOINT");
    const AZURE_OPENAI_KEY = Deno.env.get("AZURE_OPENAI_KEY");
    const EMBED_DEPLOYMENT = Deno.env.get("AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT_NAME");

    if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY || !EMBED_DEPLOYMENT) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Embeddings not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, and AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT_NAME.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // Find document_analysis row
    let docId = document_id as string | null;
    let analysisRow: any = null;
    if (analysis_id) {
      const { data, error } = await supabase
        .from("document_analysis")
        .select("id, document_id, account_id, ocr_text, storage_bucket, storage_path, processing_status, created_at")
        .eq("id", analysis_id)
        .maybeSingle();
      if (error) throw error;
      analysisRow = data;
      docId = data?.document_id || docId;
    }

    if (!analysisRow && docId) {
      const { data, error } = await supabase
        .from("document_analysis")
        .select("id, document_id, account_id, ocr_text, storage_bucket, storage_path, processing_status, created_at")
        .eq("document_id", docId)
        .eq("processing_status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      analysisRow = data;
    }

    if (!analysisRow?.ocr_text) {
      throw new Error("No OCR text found to index. Run OCR/analysis first.");
    }

    const accountId = analysisRow.account_id ?? null;

    // Optionally wipe existing chunks
    if (force_reindex && docId) {
      await supabase.from("document_chunks").delete().eq("document_id", docId);
    } else if (docId) {
      const { count } = await supabase
        .from("document_chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_id", docId);
      if ((count ?? 0) > 0) {
        return new Response(
          JSON.stringify({ success: true, document_id: docId, indexed: false, reason: "already_indexed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
    }

    const pages = splitIntoPageTexts(String(analysisRow.ocr_text));
    const chunks: Array<{
      chunk_index: number;
      page_start: number;
      page_end: number;
      content: string;
      content_hash: string;
    }> = [];

    // Chunk per page, but split large pages into smaller pieces
    let chunkIndex = 0;
    for (const p of pages) {
      const pageChunks = chunkBySize(p.text, 3500);
      for (const c of pageChunks) {
        chunks.push({
          chunk_index: chunkIndex++,
          page_start: p.page,
          page_end: p.page,
          content: c,
          content_hash: sha1Hex(c),
        });
      }
    }

    // Embed + insert in batches
    const batchSize = 12;
    let inserted = 0;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      const embeddings = await Promise.all(
        batch.map((b) => embedTextAzureOpenAI(b.content, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, EMBED_DEPLOYMENT)),
      );

      const rows = batch.map((b, idx) => ({
        document_id: docId,
        account_id: accountId,
        storage_bucket: analysisRow.storage_bucket ?? null,
        storage_path: analysisRow.storage_path ?? null,
        chunk_index: b.chunk_index,
        page_start: b.page_start,
        page_end: b.page_end,
        content: b.content,
        content_hash: b.content_hash,
        embedding: embeddings[idx],
      }));

      const { error } = await supabase.from("document_chunks").insert(rows);
      if (error) throw error;
      inserted += rows.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        document_id: docId,
        chunks_indexed: inserted,
        pages_detected: pages.length,
        embeddings_deployment: EMBED_DEPLOYMENT,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error: any) {
    console.error("Index document chunks error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});


