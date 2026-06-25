// Runtime smoke test: proves the service-role connection, the active-staff gate,
// and live reads work end to end. Prints sanitized results only (no names/emails/PII).
import { getEmployee, supa } from "../src/supabase.ts";

try {
  const emp = await getEmployee();
  const a = await supa.from("accounts").select("id", { count: "exact", head: true }).is("deleted_at", null);
  const p = await supa.from("policies").select("id", { count: "exact", head: true }).is("deleted_at", null);
  console.log(JSON.stringify({
    ok: true, gate: "passed", is_staff: emp.is_staff, role: emp.role,
    has_workspace: !!emp.workspace_id, account_count: a.count, policy_count: p.count,
  }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ ok: false, gate: "rejected", reason: e instanceof Error ? e.message : String(e) }, null, 2));
}
