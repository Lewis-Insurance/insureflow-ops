// Supabase service-role client + the "active Lewis employee" gate.
//
// The adapter connects with the SERVICE ROLE key, which bypasses RLS by design.
// Because RLS is bypassed, authorization is enforced HERE in app logic: every tool
// resolves the calling Hermes profile to a profiles row and refuses to act unless
// that person is active staff (profiles.is_staff = true). Per Brian: everyone shares
// every client, so the gate is simply "active Lewis employee, yes/no" — no per-rep scope.

import { createClient } from "@supabase/supabase-js";
import { config } from "./config.ts";

export const supa = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { "x-lewis-crm-profile": config.profile } },
});

export interface Employee {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  is_staff: boolean;
  workspace_id: string | null;
}

let cached: Employee | null = null;

/** Resolve + authorize the staff member this agent acts as. Throws if not active staff. */
export async function getEmployee(): Promise<Employee> {
  if (cached) return cached;
  const { data, error } = await supa
    .from("profiles")
    .select("id, full_name, email, role, is_staff, default_agency_workspace_id")
    .eq("email", config.employeeEmail)
    .maybeSingle();

  if (error) throw new Error(`[lewis-crm] employee lookup failed: ${error.message}`);
  if (!data) {
    throw new Error(
      `[lewis-crm] no profile for ${config.employeeEmail}. This adapter only acts for an active Lewis staff member.`,
    );
  }
  if (data.is_staff !== true) {
    throw new Error(`[lewis-crm] ${config.employeeEmail} is not active staff (is_staff != true). Access denied.`);
  }

  cached = {
    id: data.id,
    full_name: data.full_name,
    email: data.email,
    role: data.role,
    is_staff: data.is_staff,
    workspace_id: config.workspaceOverride ?? data.default_agency_workspace_id ?? null,
  };
  return cached;
}

/** Strip Supabase's PostgREST filter metacharacters from free-text search input. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,%()*]/g, " ").trim();
}
