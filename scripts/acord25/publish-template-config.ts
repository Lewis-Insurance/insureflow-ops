// publish-template-config.ts
//
// Writes the authored validation_rules onto the current acord_templates form-25
// row (doc 05 Section 2.2 step 6, Section 5.1; blueprint B Section 5). Reads the
// readable, logical-key-keyed rules from validationRules.ts and substitutes each
// rule's logicalField with ACORD25_FIELD_MAP[logicalField].pdfField so the JSON
// stored on the row carries exact PDF field names.
//
// Dry-run by default: prints the resolved JSON and does NOT write. Pass --yes to
// persist. Equivalent to useAcordTemplates.updateTemplate's validation_rules
// write, but run headless with the service role.
//
// Operator tool:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/acord25/publish-template-config.ts [--yes]
// Excluded from Vite/vitest.

import { createClient } from '@supabase/supabase-js';
import {
  ACORD25_FIELD_MAP,
  type Acord25LogicalKey,
} from '../../src/lib/acord/acord25/fieldMap';
import { ACORD25_VALIDATION_RULES } from '../../src/lib/acord/acord25/validationRules';

const FORM_NUMBER = '25';

interface PublishedRule {
  id: string;
  type: 'required';
  field: string; // exact pdfField
  message: string;
  severity: 'error' | 'warning';
}

function resolveRules(): PublishedRule[] {
  const out: PublishedRule[] = [];
  for (const rule of ACORD25_VALIDATION_RULES) {
    const entry = ACORD25_FIELD_MAP[rule.logicalField as Acord25LogicalKey];
    if (!entry) {
      console.error(`Rule ${rule.id} references logical key "${rule.logicalField}" that is not in the field map. Author the map first.`);
      process.exit(1);
    }
    out.push({
      id: rule.id,
      type: rule.type,
      field: entry.pdfField,
      message: rule.message,
      severity: rule.severity,
    });
  }
  return out;
}

async function main(): Promise<void> {
  const write = process.argv.includes('--yes');
  const rules = resolveRules();

  console.log(`Resolved ${rules.length} validation rule(s):`);
  console.log(JSON.stringify(rules, null, 2));

  if (!write) {
    console.log('\nDry run (no --yes). Re-run with --yes to write onto the acord_templates row.');
    return;
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }
  const supabase = createClient(url, key);

  const { data: row, error: selError } = await supabase
    .from('acord_templates')
    .select('id, form_number, version, is_current')
    .eq('form_number', FORM_NUMBER)
    .eq('is_current', true)
    .maybeSingle();
  if (selError) {
    console.error(`Failed to load acord_templates row: ${selError.message}`);
    process.exit(2);
  }
  if (!row) {
    console.error(`No current acord_templates row for form ${FORM_NUMBER}.`);
    process.exit(2);
  }

  const { error: updError } = await supabase
    .from('acord_templates')
    .update({ validation_rules: rules })
    .eq('id', (row as { id: string }).id);
  if (updError) {
    console.error(`Failed to write validation_rules: ${updError.message}`);
    process.exit(2);
  }

  console.log(`\nWrote ${rules.length} validation rule(s) onto form ${FORM_NUMBER} (row ${(row as { id: string }).id}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
