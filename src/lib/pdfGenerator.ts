import jsPDF from 'jspdf';
import { z } from 'zod';
import { PDFLayoutManager } from './PDFLayoutManager';

// Validation schema for COI PDF data
const COIPDFDataSchema = z.object({
  certificate_number: z.string().min(1, "Certificate number is required"),
  certificate_holder_name: z.string().min(1, "Certificate holder name is required").max(200, "Name too long"),
  certificate_holder_address: z.string().min(1, "Address is required").max(500, "Address too long"),
  effective_date: z.string().min(1, "Effective date is required"),
  expiration_date: z.string().min(1, "Expiration date is required"),
  coverage_details: z.object({
    general_liability: z.string().max(200).optional(),
    auto_liability: z.string().max(200).optional(),
    workers_comp: z.string().max(200).optional(),
    umbrella: z.string().max(200).optional(),
  }).refine(data => Object.values(data).some(v => v && v.length > 0), {
    message: "At least one coverage type is required"
  }),
  additional_insureds: z.array(z.string().max(200)).optional(),
  special_provisions: z.string().max(2000).optional(),
  account: z.object({
    name: z.string().min(1),
    address_line1: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip_code: z.string().optional(),
  }).optional(),
  policy: z.object({
    carrier: z.string().optional(),
    policy_number: z.string().optional(),
  }).optional(),
}).refine(data => {
  const effective = new Date(data.effective_date);
  const expiration = new Date(data.expiration_date);
  return effective < expiration;
}, {
  message: "Effective date must be before expiration date",
  path: ["expiration_date"],
});

export type COIPDFData = z.infer<typeof COIPDFDataSchema>;

export function generateCOIPDF(rawData: unknown): Blob {
  // Validate and parse data
  const data = COIPDFDataSchema.parse(rawData);
  
  const doc = new jsPDF();
  const layout = new PDFLayoutManager(doc, 20);

  // Header
  layout.addText('CERTIFICATE OF LIABILITY INSURANCE', 105, 18, 'bold', 'center');
  layout.moveDown(15);
  
  layout.addText(`Certificate No: ${data.certificate_number}`, 20, 10, 'normal');
  layout.moveDown(10);
  
  layout.addLine();
  layout.moveDown(10);
  
  // Producer/Insured Information
  layout.addText('PRODUCER', 20, 10, 'bold');
  layout.addText('INSURED', 110, 10, 'bold');
  layout.moveDown(8);
  
  if (data.account) {
    const currentY = layout.getY();
    const insuredLines = [
      data.account.name,
      data.account.address_line1,
      `${data.account.city || ''}, ${data.account.state || ''} ${data.account.zip_code || ''}`.trim(),
    ].filter(Boolean);
    
    insuredLines.forEach((line) => {
      layout.addText(line, 110, 10, 'normal');
      layout.moveDown(6);
    });
  }
  
  // Reset position for next section
  const minY = Math.max(layout.getY(), 80);
  layout.setY(minY);
  
  // Certificate Holder
  layout.addText('CERTIFICATE HOLDER', 20, 10, 'bold');
  layout.moveDown(8);
  
  layout.addText(data.certificate_holder_name, 20, 10, 'normal');
  layout.moveDown(6);
  
  if (data.certificate_holder_address) {
    const addressLines = data.certificate_holder_address.split('\n');
    addressLines.forEach((line) => {
      layout.addText(line, 20, 10, 'normal');
      layout.moveDown(6);
    });
  }
  
  layout.moveDown(5);
  layout.addLine();
  layout.moveDown(10);
  
  // Coverage Information
  layout.addText('COVERAGES', 20, 10, 'bold');
  layout.moveDown(8);
  
  // Coverage table header
  layout.addText('TYPE OF INSURANCE', 20, 10, 'bold');
  layout.addText('POLICY NUMBER', 90, 10, 'bold');
  layout.addText('LIMITS', 140, 10, 'bold');
  layout.moveDown(6);
  
  layout.addLine();
  layout.moveDown(6);
  
  // Coverage details
  if (data.coverage_details.general_liability) {
    layout.addText('GENERAL LIABILITY', 20, 10, 'normal');
    layout.addText(data.policy?.policy_number || 'N/A', 90, 10, 'normal');
    layout.addText(data.coverage_details.general_liability, 140, 10, 'normal');
    layout.moveDown(8);
  }
  
  if (data.coverage_details.auto_liability) {
    layout.addText('AUTOMOBILE LIABILITY', 20, 10, 'normal');
    layout.addText(data.policy?.policy_number || 'N/A', 90, 10, 'normal');
    layout.addText(data.coverage_details.auto_liability, 140, 10, 'normal');
    layout.moveDown(8);
  }
  
  if (data.coverage_details.workers_comp) {
    layout.addText('WORKERS COMPENSATION', 20, 10, 'normal');
    layout.addText(data.policy?.policy_number || 'N/A', 90, 10, 'normal');
    layout.addText(data.coverage_details.workers_comp, 140, 10, 'normal');
    layout.moveDown(8);
  }
  
  if (data.coverage_details.umbrella) {
    layout.addText('UMBRELLA LIABILITY', 20, 10, 'normal');
    layout.addText(data.policy?.policy_number || 'N/A', 90, 10, 'normal');
    layout.addText(data.coverage_details.umbrella, 140, 10, 'normal');
    layout.moveDown(8);
  }
  
  layout.moveDown(5);
  layout.addLine();
  layout.moveDown(10);
  
  // Policy Period
  layout.addText('POLICY PERIOD', 20, 10, 'bold');
  layout.moveDown(8);
  
  layout.addText(`Effective: ${new Date(data.effective_date).toLocaleDateString()}`, 20, 10, 'normal');
  layout.addText(`Expiration: ${new Date(data.expiration_date).toLocaleDateString()}`, 90, 10, 'normal');
  layout.moveDown(10);
  
  // Additional Insureds
  if (data.additional_insureds && data.additional_insureds.length > 0) {
    layout.addText('ADDITIONAL INSUREDS', 20, 10, 'bold');
    layout.moveDown(8);
    
    data.additional_insureds.forEach((insured) => {
      layout.addText(insured, 20, 10, 'normal');
      layout.moveDown(6);
    });
    
    layout.moveDown(4);
  }
  
  // Special Provisions
  if (data.special_provisions) {
    layout.addText('DESCRIPTION OF OPERATIONS / SPECIAL PROVISIONS', 20, 10, 'bold');
    layout.moveDown(8);
    
    layout.addMultilineText(data.special_provisions, 20, 170, 10, 'normal');
  }
  
  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      'This certificate is issued as a matter of information only and confers no rights upon the certificate holder.',
      105,
      285,
      { align: 'center' }
    );
  }
  
  return doc.output('blob');
}
  
