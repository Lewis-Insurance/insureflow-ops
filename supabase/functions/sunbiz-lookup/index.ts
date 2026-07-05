// ============================================================================
// SUNBIZ LOOKUP (Commercial Lines SOW v3, Section 3.5 feeder #6 - Phase 2)
// ============================================================================
// FL Division of Corporations (search.sunbiz.org) entity lookup for the
// commercial profile intake: search by entity name -> candidate list; fetch
// one candidate's detail page -> structured fields (legal name, entity type,
// document number, FEI/EIN, status, date filed, principal address, registered
// agent). Server-side because the browser cannot cross-origin fetch Sunbiz.
//
// Suggest-then-confirm: this function only RETURNS data. The client shows the
// candidates, the agent picks and reviews, and the normal profile save writes
// the fields (provenance src='extracted'). Nothing here touches the database.
//
// Auth: staff JWT (requireAuth + is_staff). Public-records data only - the
// query string is an entity name, no PII leaves the system.
// Parsing: defensive regex over Sunbiz's server-rendered HTML; every field is
// optional and a parse miss degrades to fewer fields, never an error.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const SUNBIZ_BASE = "https://search.sunbiz.org";
const UA = "Mozilla/5.0 (compatible; InsureFlowOps/1.0; +https://lewisinsurance.ai)";

interface SunbizCandidate {
  name: string;
  document_number: string | null;
  status: string | null;
  detail_url: string;
}

interface SunbizDetail {
  legal_name: string | null;
  entity_type_raw: string | null;
  /** Mapped to the commercial_profiles vocabulary when recognizable. */
  entity_type: string | null;
  document_number: string | null;
  fei_ein: string | null;
  status: string | null;
  date_filed: string | null;
  principal_address: string | null;
  registered_agent: string | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " "));
}

/** Search results: rows in the corporate search table link to detail pages. */
function parseCandidates(html: string): SunbizCandidate[] {
  const out: SunbizCandidate[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null && out.length < 10) {
    const row = m[1];
    const link = /<a[^>]+href="(\/Inquiry\/CorporationSearch\/SearchResultDetail[^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!link) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => stripTags(c[1]));
    out.push({
      name: stripTags(link[2]),
      document_number: cells[1] || null,
      status: cells[2] || null,
      detail_url: SUNBIZ_BASE + decodeEntities(link[1]),
    });
  }
  return out;
}

const ENTITY_TYPE_MAP: Array<[RegExp, string]> = [
  [/limited liability/i, "llc"],
  [/\bL\.?L\.?C\.?\b/i, "llc"],
  [/profit corporation|\bcorp\b|\binc\b/i, "corporation"],
  [/limited partnership|general partnership|\bpartnership\b/i, "partnership"],
  [/trust/i, "trust"],
];

function mapEntityType(raw: string | null): string | null {
  if (!raw) return null;
  for (const [re, mapped] of ENTITY_TYPE_MAP) {
    if (re.test(raw)) return mapped;
  }
  return "other";
}

/** Labeled-section grab: Sunbiz detail pages use <span>Label</span> blocks. */
function sectionAfter(html: string, label: string): string | null {
  const re = new RegExp(label + "[\\s\\S]{0,80}?</[^>]+>([\\s\\S]{0,600}?)(?:<div|<section|<span class=\"detailSection)", "i");
  const m = re.exec(html);
  return m ? stripTags(m[1]) || null : null;
}

function labeledValue(html: string, label: string): string | null {
  const re = new RegExp("<label[^>]*>\\s*" + label + "\\s*</label>\\s*<span[^>]*>([\\s\\S]*?)</span>", "i");
  const m = re.exec(html);
  return m ? stripTags(m[1]) || null : null;
}

function parseDetail(html: string): SunbizDetail {
  // Corporation name: the detail header block.
  const nameMatch = /<div class="detailSection corporationName">[\s\S]*?<p>([\s\S]*?)<\/p>\s*<p>([\s\S]*?)<\/p>/i.exec(html);
  const entityTypeRaw = nameMatch ? stripTags(nameMatch[1]) : null;
  const legalName = nameMatch ? stripTags(nameMatch[2]) : null;

  const detail: SunbizDetail = {
    legal_name: legalName,
    entity_type_raw: entityTypeRaw,
    entity_type: mapEntityType(entityTypeRaw),
    document_number: labeledValue(html, "Document Number"),
    fei_ein: labeledValue(html, "FEI/EIN Number"),
    status: labeledValue(html, "Status"),
    date_filed: labeledValue(html, "Date Filed"),
    principal_address: sectionAfter(html, "Principal Address"),
    registered_agent: sectionAfter(html, "Registered Agent Name (?:&amp;|&) Address"),
  };
  // 'NONE' / 'APPLIED FOR' FEI values are not an EIN.
  if (detail.fei_ein && !/\d{2}-?\d{7}/.test(detail.fei_ein)) detail.fei_ein = null;
  return detail;
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
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) return authResult;

    // Staff only (JWT-scoped is_staff, same pattern as the send surfaces).
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: isStaff } = await callerClient.rpc("is_staff");
    if (isStaff !== true) {
      return json({ success: false, error: "Forbidden: staff access required" }, 403);
    }

    let body: { mode?: string; query?: string; detail_url?: string };
    try {
      body = await req.json();
    } catch {
      return json({ success: false, error: "Invalid or empty JSON body" }, 400);
    }

    if (body.mode === "search") {
      const query = (body.query ?? "").trim();
      if (query.length < 3) return json({ success: false, error: "Query too short" }, 400);
      const url = `${SUNBIZ_BASE}/Inquiry/CorporationSearch/SearchResults?inquiryType=EntityName&searchNameOrder=${encodeURIComponent(query)}&searchTerm=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) return json({ success: false, error: `Sunbiz returned ${res.status}` }, 502);
      const candidates = parseCandidates(await res.text());
      return json({ success: true, candidates });
    }

    if (body.mode === "detail") {
      const detailUrl = body.detail_url ?? "";
      // Only ever fetch Sunbiz detail pages (no open proxy).
      if (!detailUrl.startsWith(`${SUNBIZ_BASE}/Inquiry/CorporationSearch/SearchResultDetail`)) {
        return json({ success: false, error: "Invalid detail_url" }, 400);
      }
      const res = await fetch(detailUrl, { headers: { "User-Agent": UA } });
      if (!res.ok) return json({ success: false, error: `Sunbiz returned ${res.status}` }, 502);
      const detail = parseDetail(await res.text());
      return json({ success: true, detail });
    }

    return json({ success: false, error: "mode must be 'search' or 'detail'" }, 400);
  } catch (error) {
    console.error("sunbiz-lookup error:", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
