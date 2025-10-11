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

class COIPDFGenerator {
  private doc: jsPDF;
  private layout: PDFLayoutManager;
  
  constructor() {
    this.doc = new jsPDF();
    this.layout = new PDFLayoutManager(this.doc);
  }
  
  private addHeader(certificateNumber: string): void {
    this.layout.addText('CERTIFICATE OF LIABILITY INSURANCE', 105, 18, 'bold', 'center');
    this.layout.moveDown(15);
    this.layout.addText(`Certificate No: ${certificateNumber}`, 20, 10);
    this.layout.moveDown(10);
    this.layout.addLine();
    this.layout.moveDown(10);
  }
  
  private addSection(title: string, content: string[], x: number = 20): void {
    this.layout.addText(title, x, 10, 'bold');
    this.layout.moveDown(8);
    
    content.forEach(line => {
      if (line) {
        this.layout.addText(line, x, 10, 'normal');
        this.layout.moveDown(6);
      }
    });
  }
  
  private addProducerAndInsured(account?: COIPDFData['account']): void {
    this.layout.addText('PRODUCER', 20, 10, 'bold');
    this.layout.addText('INSURED', 110, 10, 'bold');
    this.layout.moveDown(8);
    
    if (account) {
      const insuredLines = [
        account.name,
        account.address_line1,
        `${account.city || ''}, ${account.state || ''} ${account.zip_code || ''}`.trim(),
      ].filter(Boolean);
      
      const startY = this.layout.getY();
      insuredLines.forEach((line) => {
        this.layout.addText(line, 110, 10, 'normal');
        this.layout.moveDown(6);
      });
    }
    
    // Ensure minimum spacing
    const minY = Math.max(this.layout.getY(), 80);
    this.layout.setY(minY);
  }
  
  private addCertificateHolder(name: string, address: string): void {
    this.layout.addText('CERTIFICATE HOLDER', 20, 10, 'bold');
    this.layout.moveDown(8);
    
    this.layout.addText(name, 20, 10, 'normal');
    this.layout.moveDown(6);
    
    if (address) {
      const addressLines = address.split('\n');
      addressLines.forEach((line) => {
        this.layout.addText(line, 20, 10, 'normal');
        this.layout.moveDown(6);
      });
    }
    
    this.layout.moveDown(5);
    this.layout.addLine();
    this.layout.moveDown(10);
  }
  
  private addCoverageTable(coverageDetails: COIPDFData['coverage_details'], policyNumber?: string): void {
    this.layout.addText('COVERAGES', 20, 10, 'bold');
    this.layout.moveDown(8);
    
    // Table header
    this.layout.addText('TYPE OF INSURANCE', 20, 10, 'bold');
    this.layout.addText('POLICY NUMBER', 90, 10, 'bold');
    this.layout.addText('LIMITS', 140, 10, 'bold');
    this.layout.moveDown(6);
    this.layout.addLine();
    this.layout.moveDown(6);
    
    // Coverage rows
    const coverageTypes = [
      { key: 'general_liability' as const, label: 'GENERAL LIABILITY' },
      { key: 'auto_liability' as const, label: 'AUTOMOBILE LIABILITY' },
      { key: 'workers_comp' as const, label: 'WORKERS COMPENSATION' },
      { key: 'umbrella' as const, label: 'UMBRELLA LIABILITY' },
    ];
    
    coverageTypes.forEach(({ key, label }) => {
      const value = coverageDetails[key];
      if (value) {
        this.layout.addText(label, 20, 10, 'normal');
        this.layout.addText(policyNumber || 'N/A', 90, 10, 'normal');
        this.layout.addText(value, 140, 10, 'normal');
        this.layout.moveDown(8);
      }
    });
    
    this.layout.moveDown(5);
    this.layout.addLine();
    this.layout.moveDown(10);
  }
  
  private addPolicyPeriod(effectiveDate: string, expirationDate: string): void {
    this.layout.addText('POLICY PERIOD', 20, 10, 'bold');
    this.layout.moveDown(8);
    
    this.layout.addText(`Effective: ${new Date(effectiveDate).toLocaleDateString()}`, 20, 10, 'normal');
    this.layout.addText(`Expiration: ${new Date(expirationDate).toLocaleDateString()}`, 90, 10, 'normal');
    this.layout.moveDown(10);
  }
  
  private addAdditionalInsureds(additionalInsureds?: string[]): void {
    if (!additionalInsureds || additionalInsureds.length === 0) return;
    
    this.layout.addText('ADDITIONAL INSUREDS', 20, 10, 'bold');
    this.layout.moveDown(8);
    
    additionalInsureds.forEach((insured) => {
      this.layout.addText(insured, 20, 10, 'normal');
      this.layout.moveDown(6);
    });
    
    this.layout.moveDown(4);
  }
  
  private addSpecialProvisions(provisions?: string): void {
    if (!provisions) return;
    
    this.layout.addText('DESCRIPTION OF OPERATIONS / SPECIAL PROVISIONS', 20, 10, 'bold');
    this.layout.moveDown(8);
    
    this.layout.addMultilineText(provisions, 20, 170, 10, 'normal');
  }
  
  private addFooter(): void {
    const pageCount = this.doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      this.doc.setPage(i);
      this.doc.setFontSize(8);
      this.doc.text(
        'This certificate is issued as a matter of information only and confers no rights upon the certificate holder.',
        105,
        285,
        { align: 'center' }
      );
    }
  }
  
  generate(data: COIPDFData): Blob {
    // Header
    this.addHeader(data.certificate_number);
    
    // Producer and Insured
    this.addProducerAndInsured(data.account);
    
    // Certificate Holder
    this.addCertificateHolder(data.certificate_holder_name, data.certificate_holder_address);
    
    // Coverage Table
    this.addCoverageTable(data.coverage_details, data.policy?.policy_number);
    
    // Policy Period
    this.addPolicyPeriod(data.effective_date, data.expiration_date);
    
    // Additional Insureds
    this.addAdditionalInsureds(data.additional_insureds);
    
    // Special Provisions
    this.addSpecialProvisions(data.special_provisions);
    
    // Footer
    this.addFooter();
    
    return this.doc.output('blob');
  }
}

export function generateCOIPDF(rawData: unknown): Blob {
  // Validate and parse data
  const data = COIPDFDataSchema.parse(rawData);
  
  // Generate PDF using the class
  const generator = new COIPDFGenerator();
  return generator.generate(data);
}
  
