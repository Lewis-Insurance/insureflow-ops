// ============================================
// Carrier Portal Registry
// Defines carrier submission requirements and portal links
// ============================================

import { supabase } from '@/integrations/supabase/client';

// ============================================
// TYPES
// ============================================

export interface CarrierPortal {
  id: string;
  carrierId: string;
  carrierName: string;
  portalUrl: string;
  loginUrl?: string;
  appetiteGuideUrl?: string;
  supportEmail?: string;
  supportPhone?: string;
  submissionEmail?: string;
  submissionMethods: SubmissionMethod[];
  requiredForms: RequiredForm[];
  preferredFormats: FileFormat[];
  notes?: string;
  isActive: boolean;
}

export interface RequiredForm {
  formNumber: string;
  formName: string;
  required: boolean;
  notes?: string;
}

export interface SubmissionChecklist {
  carrier: CarrierPortal;
  forms: SubmissionForm[];
  additionalDocuments: RequiredDocument[];
  totalRequired: number;
  totalComplete: number;
  missingItems: string[];
  isComplete: boolean;
}

export interface SubmissionForm {
  formNumber: string;
  formName: string;
  required: boolean;
  present: boolean;
  signed: boolean;
  validated: boolean;
}

export interface RequiredDocument {
  documentType: string;
  description: string;
  required: boolean;
  present: boolean;
}

export type SubmissionMethod = 'portal' | 'email' | 'api' | 'ivans' | 'fax';
export type FileFormat = 'pdf' | 'acord_xml' | 'csv' | 'excel';

// ============================================
// COMMON CARRIERS
// ============================================

const CARRIER_REGISTRY: Record<string, Partial<CarrierPortal>> = {
  progressive: {
    carrierName: 'Progressive',
    portalUrl: 'https://www.progressivecommercial.com',
    loginUrl: 'https://www.progressiveagent.com',
    appetiteGuideUrl: 'https://www.progressivecommercial.com/appetite-guide',
    submissionMethods: ['portal', 'api'],
    requiredForms: [
      { formNumber: '125', formName: 'Commercial Insurance Application', required: true },
      { formNumber: '127', formName: 'Commercial Auto', required: true },
    ],
    preferredFormats: ['pdf'],
  },
  hartford: {
    carrierName: 'The Hartford',
    portalUrl: 'https://www.thehartford.com',
    loginUrl: 'https://agentconnect.thehartford.com',
    submissionMethods: ['portal', 'email'],
    requiredForms: [
      { formNumber: '125', formName: 'Commercial Insurance Application', required: true },
      { formNumber: '126', formName: 'General Liability', required: true },
      { formNumber: '140', formName: 'Property', required: false },
    ],
    preferredFormats: ['pdf'],
  },
  travelers: {
    carrierName: 'Travelers',
    portalUrl: 'https://www.travelers.com',
    loginUrl: 'https://agents.travelers.com',
    submissionMethods: ['portal', 'api', 'ivans'],
    requiredForms: [
      { formNumber: '125', formName: 'Commercial Insurance Application', required: true },
      { formNumber: '126', formName: 'General Liability', required: true },
      { formNumber: '127', formName: 'Commercial Auto', required: false },
      { formNumber: '130', formName: 'Workers Compensation', required: false },
    ],
    preferredFormats: ['pdf', 'acord_xml'],
  },
  chubb: {
    carrierName: 'Chubb',
    portalUrl: 'https://www.chubb.com',
    loginUrl: 'https://my.chubb.com',
    submissionMethods: ['portal', 'email'],
    requiredForms: [
      { formNumber: '125', formName: 'Commercial Insurance Application', required: true },
    ],
    preferredFormats: ['pdf'],
    notes: 'Chubb typically requires supplemental applications for specialized coverage',
  },
  nationwide: {
    carrierName: 'Nationwide',
    portalUrl: 'https://www.nationwide.com/business',
    loginUrl: 'https://agentauthority.nationwide.com',
    submissionMethods: ['portal', 'email'],
    requiredForms: [
      { formNumber: '125', formName: 'Commercial Insurance Application', required: true },
      { formNumber: '126', formName: 'General Liability', required: true },
    ],
    preferredFormats: ['pdf'],
  },
  liberty_mutual: {
    carrierName: 'Liberty Mutual',
    portalUrl: 'https://www.libertymutual.com/business',
    loginUrl: 'https://agent.libertymutual.com',
    submissionMethods: ['portal', 'api'],
    requiredForms: [
      { formNumber: '125', formName: 'Commercial Insurance Application', required: true },
      { formNumber: '130', formName: 'Workers Compensation', required: false },
    ],
    preferredFormats: ['pdf'],
  },
  amtrust: {
    carrierName: 'AmTrust',
    portalUrl: 'https://amtrustgroup.com',
    loginUrl: 'https://agents.amtrustgroup.com',
    submissionMethods: ['portal', 'email'],
    requiredForms: [
      { formNumber: '125', formName: 'Commercial Insurance Application', required: true },
      { formNumber: '130', formName: 'Workers Compensation', required: true },
    ],
    preferredFormats: ['pdf'],
    notes: 'AmTrust specializes in workers compensation and small business',
  },
  berkshire: {
    carrierName: 'Berkshire Hathaway',
    portalUrl: 'https://www.bhhc.com',
    submissionMethods: ['email'],
    requiredForms: [
      { formNumber: '125', formName: 'Commercial Insurance Application', required: true },
    ],
    preferredFormats: ['pdf'],
  },
};

// ============================================
// ADDITIONAL DOCUMENT TYPES
// ============================================

export const COMMON_REQUIRED_DOCUMENTS: RequiredDocument[] = [
  {
    documentType: 'loss_runs',
    description: '5-year loss run history from current carrier',
    required: true,
    present: false,
  },
  {
    documentType: 'driver_mvr',
    description: 'Motor Vehicle Records for all drivers',
    required: false,
    present: false,
  },
  {
    documentType: 'experience_mod',
    description: 'Experience Modification Worksheet',
    required: false,
    present: false,
  },
  {
    documentType: 'financial_statements',
    description: 'Recent financial statements',
    required: false,
    present: false,
  },
  {
    documentType: 'certificates_of_insurance',
    description: 'Current COIs from subcontractors',
    required: false,
    present: false,
  },
  {
    documentType: 'vehicle_schedule',
    description: 'Vehicle schedule with VINs',
    required: false,
    present: false,
  },
  {
    documentType: 'property_photos',
    description: 'Property photos (exterior and interior)',
    required: false,
    present: false,
  },
];

// ============================================
// FUNCTIONS
// ============================================

/**
 * Get carrier portal information from registry or database
 */
export async function getCarrierPortal(carrierId: string): Promise<CarrierPortal | null> {
  // First check database
  try {
    const { data } = await supabase
      .from('carrier_portals')
      .select('*')
      .eq('id', carrierId)
      .single();

    if (data) return data as CarrierPortal;
  } catch {
    // Not in database, check registry
  }

  // Check local registry
  const registryEntry = CARRIER_REGISTRY[carrierId.toLowerCase()];
  if (registryEntry) {
    return {
      id: carrierId,
      carrierId,
      isActive: true,
      ...registryEntry,
    } as CarrierPortal;
  }

  return null;
}

/**
 * Get all carriers from registry
 */
export function getAllCarriers(): Partial<CarrierPortal>[] {
  return Object.entries(CARRIER_REGISTRY).map(([id, portal]) => ({
    id,
    carrierId: id,
    isActive: true,
    ...portal,
  }));
}

/**
 * Get carriers by submission method
 */
export function getCarriersByMethod(method: SubmissionMethod): Partial<CarrierPortal>[] {
  return getAllCarriers().filter(c => c.submissionMethods?.includes(method));
}

/**
 * Generate submission checklist for a carrier
 */
export function generateSubmissionChecklist(
  carrier: CarrierPortal,
  presentForms: { formNumber: string; signed: boolean; validated: boolean }[],
  presentDocuments: string[]
): SubmissionChecklist {
  const forms: SubmissionForm[] = carrier.requiredForms.map(rf => {
    const presentForm = presentForms.find(pf => pf.formNumber === rf.formNumber);
    return {
      formNumber: rf.formNumber,
      formName: rf.formName,
      required: rf.required,
      present: !!presentForm,
      signed: presentForm?.signed || false,
      validated: presentForm?.validated || false,
    };
  });

  const additionalDocuments = COMMON_REQUIRED_DOCUMENTS.map(doc => ({
    ...doc,
    present: presentDocuments.includes(doc.documentType),
  }));

  const missingItems: string[] = [];

  // Check missing required forms
  forms.forEach(f => {
    if (f.required && !f.present) {
      missingItems.push(`ACORD ${f.formNumber} - ${f.formName}`);
    } else if (f.required && f.present && !f.signed) {
      missingItems.push(`ACORD ${f.formNumber} - Signature required`);
    }
  });

  // Check missing required documents
  additionalDocuments.forEach(d => {
    if (d.required && !d.present) {
      missingItems.push(d.description);
    }
  });

  const totalRequired = forms.filter(f => f.required).length +
    additionalDocuments.filter(d => d.required).length;
  const totalComplete = forms.filter(f => f.required && f.present && f.signed).length +
    additionalDocuments.filter(d => d.required && d.present).length;

  return {
    carrier,
    forms,
    additionalDocuments,
    totalRequired,
    totalComplete,
    missingItems,
    isComplete: missingItems.length === 0,
  };
}

/**
 * Get quick links for a carrier
 */
export function getCarrierQuickLinks(carrier: CarrierPortal): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [];

  if (carrier.portalUrl) {
    links.push({ label: 'Carrier Portal', url: carrier.portalUrl });
  }
  if (carrier.loginUrl) {
    links.push({ label: 'Agent Login', url: carrier.loginUrl });
  }
  if (carrier.appetiteGuideUrl) {
    links.push({ label: 'Appetite Guide', url: carrier.appetiteGuideUrl });
  }

  return links;
}

// ============================================
// EXPORTS
// ============================================

export { CARRIER_REGISTRY };
