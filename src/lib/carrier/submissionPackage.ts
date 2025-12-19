// ============================================
// Submission Package Generator
// Bundles ACORD forms and documents for carrier submission
// ============================================

import { supabase } from '@/integrations/supabase/client';
import { generateSubmissionChecklist, getCarrierPortal, type CarrierPortal, type SubmissionChecklist } from './carrierRegistry';
import type { AcordForm } from '@/types/acord';

// ============================================
// TYPES
// ============================================

export interface SubmissionPackage {
  id: string;
  accountId: string;
  carrierId: string;
  carrier: CarrierPortal;
  status: PackageStatus;
  forms: PackageForm[];
  documents: PackageDocument[];
  checklist: SubmissionChecklist;
  coverLetter?: string;
  notes?: string;
  createdAt: string;
  submittedAt?: string;
  createdBy: string;
}

export interface PackageForm {
  acordFormId: string;
  formNumber: string;
  formName: string;
  pdfUrl?: string;
  signed: boolean;
  validated: boolean;
  signatureStatus: 'unsigned' | 'pending' | 'signed';
}

export interface PackageDocument {
  id: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
}

export type PackageStatus =
  | 'draft'
  | 'in_progress'
  | 'ready'
  | 'submitted'
  | 'acknowledged'
  | 'quoted'
  | 'bound'
  | 'declined';

export interface CreatePackageInput {
  accountId: string;
  carrierId: string;
  acordFormIds: string[];
  documentIds?: string[];
  notes?: string;
}

export interface PackageResult {
  success: boolean;
  package?: SubmissionPackage;
  error?: string;
}

// ============================================
// PACKAGE MANAGEMENT
// ============================================

/**
 * Create a new submission package
 */
export async function createSubmissionPackage(
  input: CreatePackageInput
): Promise<PackageResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get carrier information
    const carrier = await getCarrierPortal(input.carrierId);
    if (!carrier) {
      return { success: false, error: 'Carrier not found' };
    }

    // Get ACORD forms
    const { data: acordForms, error: formsError } = await supabase
      .from('acord_forms')
      .select('*')
      .in('id', input.acordFormIds);

    if (formsError) throw formsError;

    // Get documents if provided
    let documents: PackageDocument[] = [];
    if (input.documentIds && input.documentIds.length > 0) {
      const { data: docs } = await supabase
        .from('documents')
        .select('*')
        .in('id', input.documentIds);

      if (docs) {
        documents = docs.map(d => ({
          id: d.id,
          documentType: d.document_type,
          fileName: d.file_name,
          fileUrl: d.file_url,
          uploadedAt: d.created_at,
        }));
      }
    }

    // Transform forms
    const forms: PackageForm[] = acordForms?.map(f => ({
      acordFormId: f.id,
      formNumber: f.form_number || '',
      formName: f.form_name || '',
      pdfUrl: f.pdf_url,
      signed: f.signature_status === 'signed',
      validated: f.validation_status === 'valid',
      signatureStatus: f.signature_status as any,
    })) || [];

    // Generate checklist
    const checklist = generateSubmissionChecklist(
      carrier,
      forms.map(f => ({
        formNumber: f.formNumber,
        signed: f.signed,
        validated: f.validated,
      })),
      documents.map(d => d.documentType)
    );

    // Create package record
    const { data: pkg, error: pkgError } = await supabase
      .from('submission_packages')
      .insert({
        account_id: input.accountId,
        carrier_id: input.carrierId,
        carrier_name: carrier.carrierName,
        status: checklist.isComplete ? 'ready' : 'in_progress',
        forms: forms,
        documents: documents,
        checklist: checklist,
        notes: input.notes,
        created_by: user.id,
      })
      .select()
      .single();

    if (pkgError) throw pkgError;

    return {
      success: true,
      package: {
        id: pkg.id,
        accountId: pkg.account_id,
        carrierId: pkg.carrier_id,
        carrier,
        status: pkg.status,
        forms,
        documents,
        checklist,
        notes: pkg.notes,
        createdAt: pkg.created_at,
        createdBy: pkg.created_by,
      },
    };
  } catch (error) {
    console.error('Failed to create submission package:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create package',
    };
  }
}

/**
 * Update package status
 */
export async function updatePackageStatus(
  packageId: string,
  status: PackageStatus,
  notes?: string
): Promise<boolean> {
  try {
    const updates: any = { status };

    if (status === 'submitted') {
      updates.submitted_at = new Date().toISOString();
    }

    if (notes) {
      updates.notes = notes;
    }

    const { error } = await supabase
      .from('submission_packages')
      .update(updates)
      .eq('id', packageId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Failed to update package status:', error);
    return false;
  }
}

/**
 * Get packages for an account
 */
export async function getAccountPackages(accountId: string): Promise<SubmissionPackage[]> {
  try {
    const { data, error } = await supabase
      .from('submission_packages')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const packages: SubmissionPackage[] = [];

    for (const pkg of data || []) {
      const carrier = await getCarrierPortal(pkg.carrier_id);
      if (!carrier) continue;

      packages.push({
        id: pkg.id,
        accountId: pkg.account_id,
        carrierId: pkg.carrier_id,
        carrier,
        status: pkg.status,
        forms: pkg.forms || [],
        documents: pkg.documents || [],
        checklist: pkg.checklist,
        coverLetter: pkg.cover_letter,
        notes: pkg.notes,
        createdAt: pkg.created_at,
        submittedAt: pkg.submitted_at,
        createdBy: pkg.created_by,
      });
    }

    return packages;
  } catch (error) {
    console.error('Failed to get account packages:', error);
    return [];
  }
}

// ============================================
// COVER LETTER GENERATION
// ============================================

export interface CoverLetterData {
  accountName: string;
  agentName: string;
  agencyName: string;
  agencyAddress: string;
  agencyPhone: string;
  agencyEmail: string;
  carrierName: string;
  effectiveDate: string;
  coverageTypes: string[];
  premium?: string;
  specialInstructions?: string;
}

/**
 * Generate a cover letter for the submission
 */
export function generateCoverLetter(data: CoverLetterData): string {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const coverageList = data.coverageTypes.map(c => `  • ${c}`).join('\n');

  return `
${data.agencyName}
${data.agencyAddress}
Phone: ${data.agencyPhone}
Email: ${data.agencyEmail}

${today}

${data.carrierName}
Underwriting Department

RE: New Business Submission
    Insured: ${data.accountName}
    Effective Date: ${data.effectiveDate}

Dear Underwriter,

Please find enclosed our submission for the above-referenced account. We are submitting the following coverages for your review and quotation:

${coverageList}

${data.premium ? `Target Premium: ${data.premium}\n` : ''}
The enclosed ACORD applications and supporting documents provide complete details regarding the insured's operations, loss history, and coverage requirements.

${data.specialInstructions ? `Special Instructions:\n${data.specialInstructions}\n` : ''}
Please contact me if you require any additional information or have questions regarding this submission.

Thank you for your consideration.

Sincerely,

${data.agentName}
${data.agencyName}
${data.agencyPhone}
${data.agencyEmail}
`.trim();
}

// ============================================
// BUNDLE GENERATION
// ============================================

/**
 * Generate a downloadable bundle (ZIP) of all submission documents
 * Note: This is a placeholder - actual implementation would use JSZip or similar
 */
export async function generateSubmissionBundle(
  packageId: string
): Promise<{ success: boolean; downloadUrl?: string; error?: string }> {
  try {
    // Get package data
    const { data: pkg, error } = await supabase
      .from('submission_packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (error) throw error;

    // In production, this would:
    // 1. Download all PDFs and documents
    // 2. Generate cover letter PDF
    // 3. Generate submission checklist PDF
    // 4. Bundle into a ZIP file
    // 5. Upload to storage and return URL

    // Placeholder implementation
    return {
      success: true,
      downloadUrl: undefined, // Would be storage URL
    };
  } catch (error) {
    console.error('Failed to generate bundle:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate bundle',
    };
  }
}

// ============================================
// SUBMISSION TRACKING
// ============================================

export interface SubmissionTrackingEntry {
  id: string;
  packageId: string;
  status: PackageStatus;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

/**
 * Add tracking entry to package
 */
export async function addTrackingEntry(
  packageId: string,
  status: PackageStatus,
  notes?: string
): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.from('submission_tracking').insert({
      package_id: packageId,
      status,
      notes,
      created_by: user.id,
    });

    if (error) throw error;

    // Also update package status
    await updatePackageStatus(packageId, status, notes);

    return true;
  } catch (error) {
    console.error('Failed to add tracking entry:', error);
    return false;
  }
}

/**
 * Get tracking history for a package
 */
export async function getTrackingHistory(
  packageId: string
): Promise<SubmissionTrackingEntry[]> {
  try {
    const { data, error } = await supabase
      .from('submission_tracking')
      .select('*')
      .eq('package_id', packageId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data?.map(t => ({
      id: t.id,
      packageId: t.package_id,
      status: t.status,
      notes: t.notes,
      createdAt: t.created_at,
      createdBy: t.created_by,
    })) || [];
  } catch (error) {
    console.error('Failed to get tracking history:', error);
    return [];
  }
}

// ============================================
// EXPORTS
// ============================================

export {
  createSubmissionPackage,
  updatePackageStatus,
  getAccountPackages,
  generateCoverLetter,
  generateSubmissionBundle,
  addTrackingEntry,
  getTrackingHistory,
};
