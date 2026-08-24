import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canonicalizeRow, dedupKey, parseCsv, sourceRowHash, validateRow } from "./radarIngest.ts";

Deno.test("CSV parser preserves quoted commas and escaped quotes", () => {
  assertEquals(parseCsv('Employer,County\r\n"Acme, Inc.",Lee\r\n"A ""Good"" Co",Collier\r\n'), [
    { Employer: "Acme, Inc.", County: "Lee" },
    { Employer: 'A "Good" Co', County: "Collier" },
  ]);
});

Deno.test("CSV parser rejects an unterminated quoted field", async () => {
  await assertRejects(async () => parseCsv('Employer\n"Acme'), Error, "unterminated");
});

Deno.test("canonical row maps live POC headers and normalizes values", () => {
  assertEquals(canonicalizeRow({
    "Employer Name": " Acme LLC ", "Policy #": "WC-12", "Insurance Company": "Carrier",
    "Cancellation Date": "8/24/2026", "Class Code": "8810 - Clerical",
    Premium: "$12,345.67", "PEO Client": "no",
  }), {
    employer_name: "Acme LLC", policy_number: "WC-12", carrier: "Carrier",
    expiration_date: "2026-08-24", class_code: "8810", estimated_premium: 12345.67,
    peo_client: false, county: undefined, fein: undefined, agency_of_record: undefined,
  });
});

Deno.test("validation requires deterministic identity, never name alone", () => {
  assertEquals(validateRow({ employer_name: "Acme" }), ["policy_number or county plus expiration_date is required"]);
  assertEquals(validateRow({ employer_name: "Acme", county: "Lee", expiration_date: "2026-09-01" }), []);
});

Deno.test("dedupe prefers normalized policy plus carrier", () => {
  assertEquals(dedupKey({ employer_name: "ignored", policy_number: "WC-12", carrier: "A & B", expiration_date: "2026-08-24" }), "policy:wc12:aandb:2026-08-24");
  assertEquals(dedupKey({ employer_name: "Acme, LLC", county: "Lee", expiration_date: "2026-09-01" }),
    "employer:acmellc:lee:2026-09-01");
});

Deno.test("invalid calendar dates become row parse errors", () => {
  const row = canonicalizeRow({ Employer: "Acme", County: "Lee", "Expiration Date": "2026-02-30" });
  assertEquals(validateRow(row), ["expiration_date is invalid"]);
});

Deno.test("source row hashes are deterministic and kind-sensitive", async () => {
  const row = { employer_name: "Acme", policy_number: "WC1", carrier: "Carrier" };
  assertEquals(await sourceRowHash("cancel", row), await sourceRowHash("cancel", { ...row }));
  assertEquals((await sourceRowHash("cancel", row)) === (await sourceRowHash("swo", row)), false);
});
