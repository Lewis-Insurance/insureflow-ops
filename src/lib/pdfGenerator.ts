import jsPDF from 'jspdf';
import { z } from 'zod';

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
  let yPosition = 20;

  // Header
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('CERTIFICATE OF LIABILITY INSURANCE', 105, yPosition, { align: 'center' });
  
  yPosition += 15;
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`Certificate No: ${data.certificate_number}`, 20, yPosition);
  
  yPosition += 10;
  doc.line(20, yPosition, 190, yPosition);
  
  // Producer/Insured Information
  yPosition += 10;
  doc.setFont(undefined, 'bold');
  doc.text('PRODUCER', 20, yPosition);
  doc.text('INSURED', 110, yPosition);
  
  yPosition += 8;
  doc.setFont(undefined, 'normal');
  if (data.account) {
    const insuredLines = [
      data.account.name,
      data.account.address_line1,
      `${data.account.city || ''}, ${data.account.state || ''} ${data.account.zip_code || ''}`.trim(),
    ].filter(Boolean);
    
    insuredLines.forEach((line) => {
      doc.text(line, 110, yPosition);
      yPosition += 6;
    });
  }
  
  // Reset position for next section
  yPosition = Math.max(yPosition, 80);
  
  // Certificate Holder
  doc.setFont(undefined, 'bold');
  doc.text('CERTIFICATE HOLDER', 20, yPosition);
  
  yPosition += 8;
  doc.setFont(undefined, 'normal');
  doc.text(data.certificate_holder_name, 20, yPosition);
  yPosition += 6;
  
  if (data.certificate_holder_address) {
    const addressLines = data.certificate_holder_address.split('\n');
    addressLines.forEach((line) => {
      doc.text(line, 20, yPosition);
      yPosition += 6;
    });
  }
  
  yPosition += 5;
  doc.line(20, yPosition, 190, yPosition);
  
  // Coverage Information
  yPosition += 10;
  doc.setFont(undefined, 'bold');
  doc.text('COVERAGES', 20, yPosition);
  
  yPosition += 8;
  doc.setFont(undefined, 'normal');
  
  // Coverage table header
  const tableStartY = yPosition;
  doc.setFont(undefined, 'bold');
  doc.text('TYPE OF INSURANCE', 20, yPosition);
  doc.text('POLICY NUMBER', 90, yPosition);
  doc.text('LIMITS', 140, yPosition);
  
  yPosition += 6;
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 6;
  
  doc.setFont(undefined, 'normal');
  
  // Coverage details
  if (data.coverage_details.general_liability) {
    doc.text('GENERAL LIABILITY', 20, yPosition);
    doc.text(data.policy?.policy_number || 'N/A', 90, yPosition);
    doc.text(data.coverage_details.general_liability, 140, yPosition);
    yPosition += 8;
  }
  
  if (data.coverage_details.auto_liability) {
    doc.text('AUTOMOBILE LIABILITY', 20, yPosition);
    doc.text(data.policy?.policy_number || 'N/A', 90, yPosition);
    doc.text(data.coverage_details.auto_liability, 140, yPosition);
    yPosition += 8;
  }
  
  if (data.coverage_details.workers_comp) {
    doc.text('WORKERS COMPENSATION', 20, yPosition);
    doc.text(data.policy?.policy_number || 'N/A', 90, yPosition);
    doc.text(data.coverage_details.workers_comp, 140, yPosition);
    yPosition += 8;
  }
  
  if (data.coverage_details.umbrella) {
    doc.text('UMBRELLA LIABILITY', 20, yPosition);
    doc.text(data.policy?.policy_number || 'N/A', 90, yPosition);
    doc.text(data.coverage_details.umbrella, 140, yPosition);
    yPosition += 8;
  }
  
  yPosition += 5;
  doc.line(20, yPosition, 190, yPosition);
  
  // Policy Period
  yPosition += 10;
  doc.setFont(undefined, 'bold');
  doc.text('POLICY PERIOD', 20, yPosition);
  
  yPosition += 8;
  doc.setFont(undefined, 'normal');
  doc.text(`Effective: ${new Date(data.effective_date).toLocaleDateString()}`, 20, yPosition);
  doc.text(`Expiration: ${new Date(data.expiration_date).toLocaleDateString()}`, 90, yPosition);
  
  // Additional Insureds
  if (data.additional_insureds && data.additional_insureds.length > 0) {
    yPosition += 10;
    doc.setFont(undefined, 'bold');
    doc.text('ADDITIONAL INSUREDS', 20, yPosition);
    
    yPosition += 8;
    doc.setFont(undefined, 'normal');
    data.additional_insureds.forEach((insured) => {
      doc.text(insured, 20, yPosition);
      yPosition += 6;
    });
  }
  
  // Special Provisions
  if (data.special_provisions) {
    yPosition += 10;
    doc.setFont(undefined, 'bold');
    doc.text('DESCRIPTION OF OPERATIONS / SPECIAL PROVISIONS', 20, yPosition);
    
    yPosition += 8;
    doc.setFont(undefined, 'normal');
    const provisions = doc.splitTextToSize(data.special_provisions, 170);
    provisions.forEach((line: string) => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }
      doc.text(line, 20, yPosition);
      yPosition += 6;
    });
  }
  
  // Footer
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
