// Flagship pipeline tail: generate a branded Lewis Insurance receipt PDF from a
// recorded payment, store it in a PRIVATE bucket, and file a documents row.
// Receipts hold customer financial data, so they NEVER go in a public bucket.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supa, type Employee } from "./supabase.ts";
import { config } from "./config.ts";
import { EMAIL_VOICE } from "./domain.ts";

export async function generateReceipt(paymentId: string, emp: Employee) {
  const { data: pay, error } = await supa
    .from("premium_payments")
    .select("id, amount, received_date, account_id, policy_id, reference_number, check_number, receipt_number")
    .eq("id", paymentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !pay) throw new Error(`payment ${paymentId} not found`);

  const { data: acct } = await supa
    .from("accounts")
    .select("name, address_line1, city, state, zip_code")
    .eq("id", pay.account_id)
    .maybeSingle();

  let policyNumber: string | null = null;
  if (pay.policy_id) {
    const { data: pol } = await supa.from("policies").select("policy_number").eq("id", pay.policy_id).maybeSingle();
    policyNumber = pol?.policy_number ?? null;
  }

  const receiptNo = pay.receipt_number || `LIA-${new Date().getFullYear()}-${paymentId.slice(0, 8).toUpperCase()}`;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // US Letter
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.09, 0.18, 0.36);
  let y = 740;
  const line = (t: string, o: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb> } = {}) => {
    page.drawText(t, { x: 56, y, size: o.size ?? 11, font: o.f ?? font, color: o.color ?? rgb(0.1, 0.1, 0.1) });
    y -= (o.size ?? 11) + 8;
  };

  line("Lewis Insurance", { size: 22, f: bold, color: navy });
  line("(386) 755-0050", { size: 10, color: rgb(0.4, 0.4, 0.4) });
  y -= 12;
  line("Payment Receipt", { size: 16, f: bold });
  line(`Receipt #: ${receiptNo}`);
  line(`Date: ${pay.received_date}`);
  y -= 6;
  line("Received from:", { f: bold });
  line(acct?.name ?? "Customer");
  if (acct?.address_line1) line(acct.address_line1);
  if (acct?.city) line(`${acct.city}, ${acct.state ?? ""} ${acct.zip_code ?? ""}`.trim());
  y -= 6;
  if (policyNumber) line(`Policy: ${policyNumber}`);
  if (pay.check_number) line(`Check #: ${pay.check_number}`);
  if (pay.reference_number) line(`Reference: ${pay.reference_number}`);
  line(`Amount paid: $${Number(pay.amount).toFixed(2)}`, { size: 14, f: bold, color: navy });
  y -= 18;
  line("Thanks for your business.", { size: 10 });
  for (const ln of EMAIL_VOICE.signature.split("\n")) line(ln, { size: 9, color: rgb(0.4, 0.4, 0.4) });

  const bytes = await pdf.save();
  const path = `${pay.account_id}/receipts/${receiptNo}.pdf`;
  const up = await supa.storage.from(config.docBucket).upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`receipt upload failed: ${up.error.message}`);

  const { data: doc, error: docErr } = await supa
    .from("documents")
    .insert({
      account_id: pay.account_id,
      policy_id: pay.policy_id,
      kind: "receipt",
      document_type: "receipt",
      filename: `${receiptNo}.pdf`,
      file_name: `${receiptNo}.pdf`,
      storage_path: path,
      storage_bucket: config.docBucket,
      mime_type: "application/pdf",
      uploaded_by: emp.id,
      created_by: emp.id,
      customer_visible: true,
    })
    .select("id")
    .single();
  if (docErr) throw new Error(`receipt document row failed: ${docErr.message}`);

  if (!pay.receipt_number) {
    await supa.from("premium_payments").update({ receipt_number: receiptNo }).eq("id", paymentId);
  }

  const signed = await supa.storage.from(config.docBucket).createSignedUrl(path, 3600);
  return { document_id: doc.id, receipt_number: receiptNo, storage_path: path, signed_url: signed.data?.signedUrl ?? null };
}
