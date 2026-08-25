import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { verifyAgencyAuth } from "../_shared/agency-auth.ts";
import { classCodeAllowed, dedupKey, normalizeEntity, type RadarRow } from "../_shared/radarIngest.ts";
import { radarOwnBookKeys } from "../_shared/radarOwnBook.ts";

const reply = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors(req);
  const cors = getCorsHeaders(req.headers.get("origin"));
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405, cors);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  try {
    const { agencyWorkspaceId, uploadId, limit = 500 } = await req.json();
    const internal = req.headers.get("X-Radar-Internal-Secret");
    const expectedInternal = Deno.env.get("RADAR_INTERNAL_SECRET");
    let actorId: string | null = null;
    if (internal) {
      if (!expectedInternal || !constantTimeEqual(internal, expectedInternal)) return reply({ error: "Unauthorized" }, 401, cors);
    } else {
      const auth = await verifyAgencyAuth(req, db);
      if (!auth.user) return reply({ error: auth.error }, auth.statusCode, cors);
      if (!auth.user.isStaff || !auth.user.agencyWorkspaceIds.includes(agencyWorkspaceId)) {
        return reply({ error: "Active staff workspace membership required" }, 403, cors);
      }
      actorId = auth.user.id;
    }
    const batchLimit = Math.min(Math.max(Number(limit) || 500, 1), 1_000);
    const { data: config, error: configError } = await db.from("radar_config").select("*")
      .eq("agency_workspace_id", agencyWorkspaceId).maybeSingle();
    if (configError) throw configError;
    if (!config) return reply({ error: "radar_config is required for this workspace" }, 409, cors);
    await expireUntouched(db, agencyWorkspaceId, config.untouched_expiry_days);

    let stagingQuery = db.from("poc_staging").select("*")
      .eq("agency_workspace_id", agencyWorkspaceId).is("processed_at", null)
      .eq("parse_errors", "{}").order("created_at").limit(batchLimit);
    if (uploadId) stagingQuery = stagingQuery.eq("poc_upload_id", uploadId);
    const { data: rows, error: rowsError } = await stagingQuery;
    if (rowsError) throw rowsError;

    const { data: ownBook, error: ownBookError } = await db.rpc("radar_own_book_match_keys", {
      p_agency_workspace_id: agencyWorkspaceId,
    });
    if (ownBookError) throw ownBookError;
    const { policies: ownPolicies, entities: ownEntities } = radarOwnBookKeys(ownBook);
    const allowlist = new Set((config.class_allowlist ?? []).map((code: string) => code.replace(/\D/g, "")));
    if (!allowlist.size) return reply({ error: "radar_config.class_allowlist must not be empty" }, 409, cors);
    const summary = { processed: 0, inserted: 0, duplicates: 0, excluded: 0, tasked: 0, queued: 0, errors: [] as unknown[] };

    for (const staged of rows ?? []) {
      try {
        const row: RadarRow = staged;
        const policyCarrier = `${normalizeEntity(row.policy_number)}:${normalizeEntity(row.carrier)}`;
        const employerFein = `${normalizeEntity(row.employer_name)}:${String(row.fein ?? "").replace(/\D/g, "")}`;
        let exclusion = "none";
        if (staged.peo_client) exclusion = "peo";
        else if (ownPolicies.has(policyCarrier) && policyCarrier !== ":") exclusion = "own_client";
        else if (row.fein && ownEntities.has(employerFein)) exclusion = "own_client";
        else if (/LEWIS/i.test(staged.agency_of_record ?? "")) exclusion = "lewis_aor";
        else if (allowlist.size && !classCodeAllowed(staged.class_code, allowlist)) exclusion = "class";
        const opportunity = {
          agency_workspace_id: agencyWorkspaceId, employer_name: staged.employer_name, fein: staged.fein, county: staged.county,
          policy_number: staged.policy_number, carrier: staged.carrier, expiration_date: staged.expiration_date,
          kind: staged.kind, class_code: staged.class_code, estimated_premium: staged.estimated_premium,
          source: staged.kind === "swo" ? "fl_dfs_swo" : "fl_poc_cancel", source_row_hash: staged.source_row_hash,
          last_verified_at: staged.created_at, poc_upload_id: staged.poc_upload_id,
          agency_of_record: staged.agency_of_record, peo_client: staged.peo_client,
          exclusion, dedup_key: dedupKey(row), stage: exclusion === "none" ? "new" : "excluded",
        };
        const { data: inserted, error: insertError } = await db.from("renewal_opportunities")
          .insert(opportunity).select("id").single();
        let opportunityId = inserted?.id as string | undefined;
        if (insertError?.code === "23505") {
          summary.duplicates++;
          const { data: existing, error: existingError } = await db.from("renewal_opportunities")
            .select("id,stage,radar_score").eq("agency_workspace_id", agencyWorkspaceId)
            .eq("source_row_hash", staged.source_row_hash).maybeSingle();
          if (existingError) throw existingError;
          if (!existing) {
            const { error: duplicateError } = await db.from("poc_staging").update({
              processed_at: new Date().toISOString(),
              parse_errors: ["duplicate: deterministic dedup_key collision; existing opportunity retained"],
            }).eq("id", staged.id);
            if (duplicateError) throw duplicateError;
            summary.processed++;
            continue;
          }
          if (existing.stage !== "new") {
            await markProcessed(db, staged.id);
            summary.processed++;
            continue;
          }
          opportunityId = existing.id;
        }
        if (insertError && insertError.code !== "23505") throw insertError;
        if (!opportunityId) throw new Error("Opportunity insert returned no row");
        if (inserted) summary.inserted++;
        if (exclusion !== "none") {
          summary.excluded++;
          await markProcessed(db, staged.id);
          summary.processed++;
          continue;
        }

        const scoring = await fetch(`${supabaseUrl}/functions/v1/lead-scoring-engine`, {
          method: "POST",
          headers: internal
            ? { "Content-Type": "application/json", "X-Radar-Internal-Secret": internal }
            : { "Content-Type": "application/json", Authorization: req.headers.get("Authorization") ?? "" },
          body: JSON.stringify({ radar: { opportunityId } }),
          signal: AbortSignal.timeout(15_000),
        });
        const scored = await scoring.json();
        if (!scoring.ok || typeof scored.score !== "number") throw new Error(scored.error ?? "Radar scoring failed");
        if (scored.score >= config.score_threshold) {
          const { data: created, error: taskError } = await db.rpc("radar_create_task_if_capacity", {
            p_opportunity_id: opportunityId, p_created_by: actorId,
          });
          if (taskError) throw taskError;
          if (created) {
            summary.tasked++;
          } else {
            const { error: queueError } = await db.from("renewal_opportunities")
              .update({ stage: "queued", updated_at: new Date().toISOString() }).eq("id", opportunityId).eq("stage", "new");
            if (queueError) throw queueError;
            summary.queued++;
          }
        } else {
          const { error: queueError } = await db.from("renewal_opportunities")
            .update({ stage: "queued", updated_at: new Date().toISOString() }).eq("id", opportunityId);
          if (queueError) throw queueError;
          summary.queued++;
        }
        await markProcessed(db, staged.id);
        summary.processed++;
      } catch (error) {
        summary.errors.push({ stagingId: staged.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return reply(summary, summary.errors.length ? 207 : 200, cors);
  } catch (error) {
    console.error("radar-opportunity-upsert", error);
    return reply({ error: error instanceof Error ? error.message : "Opportunity upsert failed" }, 500, cors);
  }
});

function constantTimeEqual(left: string, right: string): boolean {
  const size = Math.max(left.length, right.length); let mismatch = left.length ^ right.length;
  for (let i = 0; i < size; i++) mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return mismatch === 0;
}

async function markProcessed(db: ReturnType<typeof createClient>, id: string) {
  const { error } = await db.from("poc_staging").update({ processed_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

async function expireUntouched(
  db: ReturnType<typeof createClient>,
  workspaceId: string,
  expiryDays: number,
) {
  const cutoff = new Date(Date.now() - expiryDays * 86_400_000).toISOString();
  const { data: stale, error } = await db.from("renewal_opportunities").select("id,stage")
    .eq("agency_workspace_id", workspaceId).in("stage", ["queued", "tasked"]).lt("created_at", cutoff);
  if (error) throw error;
  const queued = (stale ?? []).filter((row) => row.stage === "queued").map((row) => row.id);
  if (queued.length) {
    const { error: updateError } = await db.from("renewal_opportunities")
      .update({ stage: "expired", expiration_reason: "capacity_overflow", updated_at: new Date().toISOString() })
      .in("id", queued);
    if (updateError) throw updateError;
  }
  const tasked = (stale ?? []).filter((row) => row.stage === "tasked").map((row) => row.id);
  if (!tasked.length) return;
  const { data: untouched, error: taskError } = await db.from("tasks").select("id,entity_id")
    .eq("source", "wc_renewal_radar").eq("status", "pending").in("entity_id", tasked);
  if (taskError) throw taskError;
  const taskIds = (untouched ?? []).map((task) => task.id);
  const opportunityIds = (untouched ?? []).map((task) => task.entity_id);
  if (!taskIds.length) return;
  const { error: cancelError } = await db.from("tasks").update({ status: "cancelled" }).in("id", taskIds);
  if (cancelError) throw cancelError;
  const { error: expireError } = await db.from("renewal_opportunities")
    .update({ stage: "expired", expiration_reason: "capacity_overflow", updated_at: new Date().toISOString() })
    .in("id", opportunityIds);
  if (expireError) throw expireError;
}
