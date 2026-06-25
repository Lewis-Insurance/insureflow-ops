// lewis-crm MCP tools — a thin, authorized layer over the REAL jarvis-os tables.
// Every tool gates on getEmployee() (active staff only). Reads return IDs + masked PII;
// writes stamp the acting employee. Heavy lifting (OCR, ACORD, receipts) reuses existing rails.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supa, getEmployee, sanitizeSearch } from "./supabase.ts";
import { presentClient, maskPolicyNumber } from "./redact.ts";
import { applyDecPageRules, DOMAIN_RULES } from "./domain.ts";
import { generateReceipt } from "./receipt.ts";
import { config } from "./config.ts";

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): Result => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (message: string): Result => ({ content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }], isError: true });

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

export function registerTools(server: McpServer): void {
  // ---- CLIENTS ---------------------------------------------------------------
  server.tool(
    "find_client",
    "Search the book of business (accounts) by name, email, or phone. Returns IDs + masked contact info.",
    { query: z.string().describe("name, email, or phone fragment"), limit: z.number().int().min(1).max(50).default(10) },
    async ({ query, limit }): Promise<Result> => {
      await getEmployee();
      const q = sanitizeSearch(query);
      if (!q) return fail("query was empty after sanitizing");
      const { data, error } = await supa
        .from("accounts")
        .select("id, name, type, account_status, city, state, email, phone")
        .is("deleted_at", null)
        .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(limit);
      if (error) return fail(error.message);
      return ok({ count: data.length, clients: data.map((r) => presentClient(r)) });
    },
  );

  server.tool(
    "get_client",
    "Full client snapshot: account + policies + open tasks + recent notes + recent payments. reveal=true surfaces raw phone/email for an action (call/text).",
    { account_id: z.string().uuid(), reveal: z.boolean().default(false) },
    async ({ account_id, reveal }): Promise<Result> => {
      await getEmployee();
      const { data: acct } = await supa.from("accounts").select("*").eq("id", account_id).is("deleted_at", null).maybeSingle();
      if (!acct) return fail("client not found");
      const [pol, tasks, notes, pays] = await Promise.all([
        supa.from("policies").select("id, policy_number, carrier, line_of_business, status, effective_date, expiration_date, premium").eq("account_id", account_id).is("deleted_at", null),
        supa.from("tasks").select("id, title, status, priority, due_at").eq("account_id", account_id).is("deleted_at", null).neq("status", "completed").order("due_at", { ascending: true }).limit(20),
        supa.from("customer_notes").select("id, note_text, note_category, is_important, created_at").eq("customer_id", account_id).order("created_at", { ascending: false }).limit(10),
        supa.from("premium_payments").select("id, amount, received_date, status").eq("account_id", account_id).is("deleted_at", null).order("received_date", { ascending: false }).limit(5),
      ]);
      return ok({
        client: presentClient(acct, reveal),
        policies: (pol.data ?? []).map((p) => ({ ...p, policy_number: reveal ? p.policy_number : maskPolicyNumber(p.policy_number) })),
        open_tasks: tasks.data ?? [],
        recent_notes: notes.data ?? [],
        recent_payments: pays.data ?? [],
      });
    },
  );

  // ---- POLICIES --------------------------------------------------------------
  server.tool(
    "list_policies",
    "List policies for a client, or policies expiring within N days (cadence sweep). Policy numbers masked.",
    { account_id: z.string().uuid().optional(), expiring_within_days: z.number().int().min(1).max(365).optional() },
    async ({ account_id, expiring_within_days }): Promise<Result> => {
      await getEmployee();
      let q = supa.from("policies").select("id, account_id, policy_number, carrier, line_of_business, status, effective_date, expiration_date, premium").is("deleted_at", null);
      if (account_id) q = q.eq("account_id", account_id);
      if (expiring_within_days) q = q.gte("expiration_date", today()).lte("expiration_date", inDays(expiring_within_days)).order("expiration_date", { ascending: true });
      const { data, error } = await q.limit(200);
      if (error) return fail(error.message);
      return ok({ count: data.length, policies: data.map((p) => ({ ...p, policy_number: maskPolicyNumber(p.policy_number) })) });
    },
  );

  // ---- CONTACT LOG -----------------------------------------------------------
  server.tool(
    "log_contact",
    "Log a client contact to the durable contact log (customer_notes). Use after every call/text/email/meeting.",
    {
      account_id: z.string().uuid(),
      channel: z.enum(["call", "text", "email", "imessage", "in_person", "mail", "note"]),
      summary: z.string().min(1),
      important: z.boolean().default(false),
    },
    async ({ account_id, channel, summary, important }): Promise<Result> => {
      const emp = await getEmployee();
      const { data: acct } = await supa.from("accounts").select("id").eq("id", account_id).maybeSingle();
      if (!acct) return fail("account_id does not exist");
      const { data, error } = await supa
        .from("customer_notes")
        .insert({ customer_id: account_id, note_text: `[${channel}] ${summary}`, note_category: channel, created_by: emp.id, is_important: important })
        .select("id, created_at")
        .single();
      if (error) return fail(error.message);
      return ok({ note_id: data.id, logged_at: data.created_at });
    },
  );

  // ---- TASKS -----------------------------------------------------------------
  server.tool(
    "create_task",
    "Create a task (cadence follow-up, service item). Assigned to the acting employee by default.",
    {
      title: z.string().min(1),
      description: z.string().optional(),
      account_id: z.string().uuid().optional(),
      policy_id: z.string().uuid().optional(),
      due_at: z.string().describe("ISO timestamp or date").optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    },
    async ({ title, description, account_id, policy_id, due_at, priority }): Promise<Result> => {
      const emp = await getEmployee();
      const row: Record<string, unknown> = { title, description, account_id, policy_id, assignee_id: emp.id, created_by: emp.id, priority, source: "agent" };
      if (account_id) { row.entity_type = "account"; row.entity_id = account_id; }
      if (due_at) row.due_at = due_at;
      const { data, error } = await supa.from("tasks").insert(row).select("id").single();
      if (error) return fail(error.message);
      return ok({ task_id: data.id });
    },
  );

  server.tool(
    "list_tasks",
    "List tasks. Defaults to the acting employee's open tasks, soonest due first.",
    {
      status: z.enum(["pending", "in_progress", "completed", "cancelled"]).default("pending"),
      mine_only: z.boolean().default(true),
      due_within_days: z.number().int().min(1).max(365).optional(),
    },
    async ({ status, mine_only, due_within_days }): Promise<Result> => {
      const emp = await getEmployee();
      let q = supa.from("tasks").select("id, title, status, priority, due_at, account_id").is("deleted_at", null).eq("status", status);
      if (mine_only) q = q.eq("assignee_id", emp.id);
      if (due_within_days) q = q.lte("due_at", inDays(due_within_days));
      const { data, error } = await q.order("due_at", { ascending: true }).limit(50);
      if (error) return fail(error.message);
      return ok({ count: data.length, tasks: data });
    },
  );

  // ---- RENEWAL / QUOTE PIPELINE ---------------------------------------------
  server.tool(
    "list_renewals",
    "Upcoming renewals within N days, from the renewals pipeline and (optionally) the Auto-Owners migration pipeline.",
    { within_days: z.number().int().min(1).max(180).default(45), include_ao: z.boolean().default(true) },
    async ({ within_days, include_ao }): Promise<Result> => {
      await getEmployee();
      const until = inDays(within_days);
      const ren = await supa.from("renewals")
        .select("id, account_id, policy_number, carrier, policy_type, renewal_date, current_premium, renewal_premium, status, priority, risk_level")
        .gte("renewal_date", today()).lte("renewal_date", until).neq("status", "completed").order("renewal_date", { ascending: true }).limit(100);
      const ao = include_ao
        ? await supa.from("ao_renewals").select("id, account_id, customer_name, policy_number, policy_type, renewal_date, current_premium, current_carrier, status, priority, follow_up_date").lte("renewal_date", until).order("renewal_date", { ascending: true }).limit(100)
        : { data: [], error: null };
      if (ren.error) return fail(ren.error.message);
      if (ao.error) return fail(ao.error.message);
      const mask = (rows: any[]) => rows.map((r) => ({ ...r, policy_number: maskPolicyNumber(r.policy_number) }));
      return ok({ renewals: mask(ren.data ?? []), ao_renewals: mask(ao.data ?? []) });
    },
  );

  // ---- PAYMENTS + RECEIPT (flagship) ----------------------------------------
  server.tool(
    "record_payment",
    "Record a real customer payment (premium_payments) and optionally generate a branded receipt PDF. NEVER call this from a dec page — a dec page does not confirm payment.",
    {
      account_id: z.string().uuid(),
      amount: z.number().positive(),
      method: z.enum(["cash", "check", "card", "ach", "other"]).default("check"),
      policy_id: z.string().uuid().optional(),
      payment_method_id: z.string().uuid().optional().describe("explicit payment_methods.id; otherwise resolved by method for the workspace"),
      reference: z.string().optional(),
      check_number: z.string().optional(),
      generate_receipt: z.boolean().default(true),
    },
    async ({ account_id, amount, method, policy_id, payment_method_id, reference, check_number, generate_receipt }): Promise<Result> => {
      const emp = await getEmployee();

      // Resolve a payment_method_id (NOT NULL on premium_payments).
      let pmId = payment_method_id ?? null;
      if (!pmId) {
        let pmq = supa.from("payment_methods").select("id, name").limit(25);
        if (emp.workspace_id) pmq = pmq.eq("org_id", emp.workspace_id);
        const { data: pms } = await pmq;
        if (pms && pms.length) {
          pmId = (pms.find((p: any) => (p.name ?? "").toLowerCase().includes(method)) ?? pms[0]).id;
        }
      }
      if (!pmId) return fail("no payment_method_id resolved for this workspace — pass payment_method_id explicitly");

      const insert: Record<string, unknown> = {
        account_id, policy_id, amount, payment_method_id: pmId, received_by: emp.id, payment_source: "office",
      };
      if (emp.workspace_id) insert.org_id = emp.workspace_id;
      if (reference) insert.reference_number = reference;
      if (check_number) insert.check_number = check_number;

      const { data, error } = await supa.from("premium_payments").insert(insert).select("id").single();
      if (error) return fail(error.message);

      let receipt: unknown = null;
      if (generate_receipt) {
        try { receipt = await generateReceipt(data.id, emp); }
        catch (e) { receipt = { error: e instanceof Error ? e.message : String(e) }; }
      }
      return ok({ payment_id: data.id, receipt });
    },
  );

  server.tool(
    "generate_receipt",
    "Generate (or regenerate) a branded receipt PDF for an existing payment. Stored in a private bucket; returns a 1-hour signed URL.",
    { payment_id: z.string().uuid() },
    async ({ payment_id }): Promise<Result> => {
      const emp = await getEmployee();
      try { return ok(await generateReceipt(payment_id, emp)); }
      catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
    },
  );

  // ---- DEC-PAGE INTAKE (reuses existing pipeline; human approval required) ----
  server.tool(
    "extract_dec_page",
    "Register an uploaded dec page (already in a private bucket) for extraction via the existing document pipeline. Returns a document_id and domain warnings. Does NOT write a policy — extraction + human approval happen downstream. A dec page never confirms payment.",
    {
      storage_path: z.string().min(1).describe("object key inside the private bucket"),
      account_id: z.string().uuid().optional(),
      bucket: z.string().optional(),
      carrier_hint: z.string().optional(),
      line_of_business_hint: z.string().optional(),
      vehicles: z.array(z.string()).optional().describe("vehicle descriptions, for the specialty-policy rule"),
    },
    async ({ storage_path, account_id, bucket, carrier_hint, line_of_business_hint, vehicles }): Promise<Result> => {
      const emp = await getEmployee();
      const useBucket = bucket ?? config.docBucket;
      const filename = storage_path.split("/").pop() ?? "dec-page.pdf";
      const { data, error } = await supa
        .from("documents")
        .insert({
          account_id, kind: "dec_page", document_type: "dec_page", filename, file_name: filename,
          storage_path, storage_bucket: useBucket, mime_type: "application/pdf",
          uploaded_by: emp.id, created_by: emp.id, urgency_level: "normal",
        })
        .select("id")
        .single();
      if (error) return fail(error.message);

      const proposal = { carrier: carrier_hint ?? null, line_of_business: line_of_business_hint ?? null, vehicles: vehicles ?? [], paid_in_full: false };
      const warnings = applyDecPageRules(proposal);
      return ok({
        document_id: data.id,
        status: "queued_for_extraction",
        pipeline: "ocr-document -> process-document-tasks -> document_insights (existing rails)",
        requires_human_approval: true,
        domain_rules_applied: [DOMAIN_RULES.aoPaidInFull, DOMAIN_RULES.specialtyOnSeparatePolicy, DOMAIN_RULES.smartRide],
        domain_warnings: warnings,
      });
    },
  );

  // ---- REFERENCE -------------------------------------------------------------
  server.tool(
    "domain_rules",
    "Return the binding Lewis Insurance domain rules (specialty policies, Auto-Owners paid-in-full, SmartRide, bundle definition, FL property, email voice).",
    {},
    async (): Promise<Result> => { await getEmployee(); return ok(DOMAIN_RULES); },
  );
}
