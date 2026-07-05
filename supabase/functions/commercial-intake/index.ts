// ============================================================================
// COMMERCIAL INTAKE PORTAL (public, token-gated - SOW v3 3.5 feeder #3)
// ============================================================================
// The anon path for the client intake link (/portal/intake/:token). Mirrors
// the document-collection portal pattern: verify_jwt=false, action-based body,
// the TOKEN is the credential and this function is its only validator.
//
//   { action: 'fetch',  token }            -> business name + non-sensitive
//                                             prefill (never FEIN) + expiry
//   { action: 'submit', token, payload }   -> sanitized, allowlisted payload
//                                             staged for agent review
//
// Security: uniform 'invalid or expired link' on every token failure (no
// enumeration); allowlist + type/length caps on the payload; 5 submissions
// per link per hour; nothing here writes live data - staged rows only
// (Invariant 4), applied later by a staff user with provenance src='client'.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const LINK_ERROR = "This link is invalid or has expired. Contact your agent for a new one.";

/** Allowlisted payload fields: key -> [kind, max length]. */
const FIELDS: Record<string, ["string" | "number", number]> = {
  legal_name: ["string", 300],
  dba: ["string", 300],
  fein: ["string", 20],
  entity_type: ["string", 30],
  naics_code: ["string", 10],
  years_in_business: ["number", 0],
  employee_count: ["number", 0],
  annual_revenue: ["number", 0],
  website: ["string", 300],
  description_of_operations: ["string", 2000],
};
const ENTITY_TYPES = new Set(["individual", "partnership", "corporation", "llc", "joint_venture", "trust", "other"]);

function sanitizePayload(raw: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const rec = raw as Record<string, unknown>;
  for (const [key, [kind, maxLen]] of Object.entries(FIELDS)) {
    const v = rec[key];
    if (v == null) continue;
    if (kind === "string" && typeof v === "string") {
      const trimmed = v.trim().slice(0, maxLen);
      if (trimmed === "") continue;
      if (key === "entity_type" && !ENTITY_TYPES.has(trimmed)) continue;
      out[key] = trimmed;
    } else if (kind === "number") {
      const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
      if (Number.isFinite(n) && n >= 0 && n < 1e15) out[key] = n;
    }
  }
  return out;
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let body: { action?: string; token?: string; payload?: unknown; client_note?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid request" }, 400);
    }

    const token = typeof body.token === "string" ? body.token.trim() : "";
    // Tokens are 48 hex chars; anything else is invalid without a lookup.
    if (!/^[a-f0-9]{40,64}$/i.test(token)) return json({ error: LINK_ERROR }, 404);

    const { data: link } = await supabase
      .from("commercial_intake_links")
      .select("id, account_id, submission_id, expires_at, revoked_at")
      .eq("token", token)
      .maybeSingle();
    if (!link || link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) {
      return json({ error: LINK_ERROR }, 404);
    }

    if (body.action === "fetch") {
      const { data: account } = await supabase
        .from("accounts")
        .select("name")
        .eq("id", link.account_id)
        .maybeSingle();
      // Non-sensitive prefill only - FEIN is asked for but never echoed out.
      const { data: existing } = await supabase
        .from("commercial_profiles")
        .select("legal_name, dba, entity_type, naics_code, years_in_business, employee_count, annual_revenue, website, description_of_operations")
        .eq("account_id", link.account_id)
        .is("deleted_at", null)
        .maybeSingle();
      return json({
        business_name: account?.name ?? "your business",
        expires_at: link.expires_at,
        prefill: existing ?? {},
      });
    }

    if (body.action === "submit") {
      // Rate limit: 5 staged submissions per link per hour.
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("commercial_intake_submissions")
        .select("id", { count: "exact", head: true })
        .eq("link_id", link.id)
        .gte("submitted_at", oneHourAgo);
      if ((count ?? 0) >= 5) {
        return json({ error: "Too many submissions. Please try again later." }, 429);
      }

      const payload = sanitizePayload(body.payload);
      if (Object.keys(payload).length === 0) {
        return json({ error: "Nothing to submit - fill in at least one field." }, 400);
      }
      const clientNote =
        typeof body.client_note === "string" ? body.client_note.trim().slice(0, 2000) || null : null;

      const { error: insertError } = await supabase.from("commercial_intake_submissions").insert({
        link_id: link.id,
        account_id: link.account_id,
        payload,
        client_note: clientNote,
      });
      if (insertError) {
        console.error("intake staged insert failed:", insertError);
        return json({ error: "Could not save your submission. Please try again." }, 500);
      }
      await supabase
        .from("commercial_intake_links")
        .update({ last_submitted_at: new Date().toISOString() })
        .eq("id", link.id);

      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("commercial-intake error:", error);
    return json({ error: "Unexpected error" }, 500);
  }
});
