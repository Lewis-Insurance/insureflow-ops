// Environment config. Secrets are injected by the Mac Mini (launchd / ~/.hermes/.env),
// never hardcoded. Fail fast and loud if a required value is missing.

function req(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`[lewis-crm] missing required env ${name} — set it in ~/.hermes/.env on the Mac Mini`);
  }
  return v.trim();
}

function opt(name: string, fallback: string | null = null): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

export const config = {
  supabaseUrl: req("SUPABASE_URL"),
  serviceRoleKey: req("SUPABASE_SERVICE_ROLE_KEY"),
  profile: opt("LEWIS_PROFILE", "unknown")!,
  employeeEmail: req("LEWIS_EMPLOYEE_EMAIL"),
  docBucket: opt("LEWIS_DOC_BUCKET", "customer-docs")!,
  workspaceOverride: opt("LEWIS_AGENCY_WORKSPACE_ID"),
} as const;
