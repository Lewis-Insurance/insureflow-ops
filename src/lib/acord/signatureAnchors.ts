// ============================================
// ACORD Form Signature Anchors
// Defines signature placement locations for each form type
// ============================================

// ============================================
// TYPES
// ============================================

export interface SignatureAnchor {
  fieldName: string;
  type: 'signature' | 'initial' | 'date';
  label: string;
  role: SignerRole;
  page: number;
  position?: {
    x: number; // percentage from left
    y: number; // percentage from top
    width: number;
    height: number;
  };
  required: boolean;
  order: number;
}

export interface SignatureConfig {
  formNumber: string;
  formName: string;
  anchors: SignatureAnchor[];
  requiresAgentSignature: boolean;
  requiresApplicantSignature: boolean;
  multipleApplicants?: number;
}

export type SignerRole =
  | 'applicant'
  | 'co_applicant'
  | 'agent'
  | 'producer'
  | 'authorized_representative'
  | 'witness';

// ============================================
// ACORD 125 SIGNATURE CONFIGURATION
// Commercial Insurance Application
// ============================================

const ACORD_125_SIGNATURES: SignatureConfig = {
  formNumber: '125',
  formName: 'Commercial Insurance Application',
  requiresAgentSignature: true,
  requiresApplicantSignature: true,
  anchors: [
    {
      fieldName: 'ApplicantSignature',
      type: 'signature',
      label: 'Applicant Signature',
      role: 'applicant',
      page: 4, // Typically on last page
      position: { x: 15, y: 85, width: 30, height: 4 },
      required: true,
      order: 1,
    },
    {
      fieldName: 'ApplicantSignatureDate',
      type: 'date',
      label: 'Date',
      role: 'applicant',
      page: 4,
      position: { x: 50, y: 85, width: 15, height: 4 },
      required: true,
      order: 2,
    },
    {
      fieldName: 'AgentSignature',
      type: 'signature',
      label: 'Agent/Broker Signature',
      role: 'agent',
      page: 4,
      position: { x: 15, y: 92, width: 30, height: 4 },
      required: true,
      order: 3,
    },
    {
      fieldName: 'AgentSignatureDate',
      type: 'date',
      label: 'Date',
      role: 'agent',
      page: 4,
      position: { x: 50, y: 92, width: 15, height: 4 },
      required: true,
      order: 4,
    },
  ],
};

// ============================================
// ACORD 126 SIGNATURE CONFIGURATION
// Commercial General Liability
// ============================================

const ACORD_126_SIGNATURES: SignatureConfig = {
  formNumber: '126',
  formName: 'Commercial General Liability Section',
  requiresAgentSignature: false,
  requiresApplicantSignature: true,
  anchors: [
    {
      fieldName: 'ApplicantSignature',
      type: 'signature',
      label: 'Applicant Signature',
      role: 'applicant',
      page: 2,
      position: { x: 15, y: 90, width: 30, height: 4 },
      required: true,
      order: 1,
    },
    {
      fieldName: 'ApplicantSignatureDate',
      type: 'date',
      label: 'Date',
      role: 'applicant',
      page: 2,
      position: { x: 50, y: 90, width: 15, height: 4 },
      required: true,
      order: 2,
    },
  ],
};

// ============================================
// ACORD 127 SIGNATURE CONFIGURATION
// Commercial Auto Section
// ============================================

const ACORD_127_SIGNATURES: SignatureConfig = {
  formNumber: '127',
  formName: 'Commercial Auto Section',
  requiresAgentSignature: false,
  requiresApplicantSignature: true,
  anchors: [
    {
      fieldName: 'ApplicantSignature',
      type: 'signature',
      label: 'Applicant Signature',
      role: 'applicant',
      page: 3,
      position: { x: 15, y: 88, width: 30, height: 4 },
      required: true,
      order: 1,
    },
    {
      fieldName: 'ApplicantSignatureDate',
      type: 'date',
      label: 'Date',
      role: 'applicant',
      page: 3,
      position: { x: 50, y: 88, width: 15, height: 4 },
      required: true,
      order: 2,
    },
  ],
};

// ============================================
// ACORD 130 SIGNATURE CONFIGURATION
// Workers Compensation
// ============================================

const ACORD_130_SIGNATURES: SignatureConfig = {
  formNumber: '130',
  formName: 'Workers Compensation Application',
  requiresAgentSignature: true,
  requiresApplicantSignature: true,
  anchors: [
    {
      fieldName: 'ApplicantSignature',
      type: 'signature',
      label: 'Applicant Signature',
      role: 'applicant',
      page: 4,
      position: { x: 15, y: 82, width: 30, height: 4 },
      required: true,
      order: 1,
    },
    {
      fieldName: 'ApplicantPrintedName',
      type: 'signature', // Text field but treated as part of signature block
      label: 'Printed Name',
      role: 'applicant',
      page: 4,
      position: { x: 50, y: 82, width: 25, height: 4 },
      required: true,
      order: 2,
    },
    {
      fieldName: 'ApplicantSignatureDate',
      type: 'date',
      label: 'Date',
      role: 'applicant',
      page: 4,
      position: { x: 78, y: 82, width: 15, height: 4 },
      required: true,
      order: 3,
    },
    {
      fieldName: 'AgentSignature',
      type: 'signature',
      label: 'Agent/Broker Signature',
      role: 'agent',
      page: 4,
      position: { x: 15, y: 90, width: 30, height: 4 },
      required: true,
      order: 4,
    },
    {
      fieldName: 'AgentSignatureDate',
      type: 'date',
      label: 'Date',
      role: 'agent',
      page: 4,
      position: { x: 50, y: 90, width: 15, height: 4 },
      required: true,
      order: 5,
    },
  ],
};

// ============================================
// ACORD 140 SIGNATURE CONFIGURATION
// Property Section
// ============================================

const ACORD_140_SIGNATURES: SignatureConfig = {
  formNumber: '140',
  formName: 'Property Section',
  requiresAgentSignature: false,
  requiresApplicantSignature: true,
  anchors: [
    {
      fieldName: 'ApplicantSignature',
      type: 'signature',
      label: 'Applicant Signature',
      role: 'applicant',
      page: 2,
      position: { x: 15, y: 90, width: 30, height: 4 },
      required: true,
      order: 1,
    },
    {
      fieldName: 'ApplicantSignatureDate',
      type: 'date',
      label: 'Date',
      role: 'applicant',
      page: 2,
      position: { x: 50, y: 90, width: 15, height: 4 },
      required: true,
      order: 2,
    },
  ],
};

// ============================================
// SIGNATURE CONFIG REGISTRY
// ============================================

const SIGNATURE_CONFIGS: Record<string, SignatureConfig> = {
  '125': ACORD_125_SIGNATURES,
  '126': ACORD_126_SIGNATURES,
  '127': ACORD_127_SIGNATURES,
  '130': ACORD_130_SIGNATURES,
  '140': ACORD_140_SIGNATURES,
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get signature configuration for a form
 */
export function getSignatureConfig(formNumber: string): SignatureConfig | null {
  return SIGNATURE_CONFIGS[formNumber] || null;
}

/**
 * Get all signature anchors for a form
 */
export function getSignatureAnchors(formNumber: string): SignatureAnchor[] {
  const config = SIGNATURE_CONFIGS[formNumber];
  return config?.anchors || [];
}

/**
 * Get anchors by role
 */
export function getAnchorsByRole(formNumber: string, role: SignerRole): SignatureAnchor[] {
  const anchors = getSignatureAnchors(formNumber);
  return anchors.filter(a => a.role === role);
}

/**
 * Get required signers for a form
 */
export function getRequiredSigners(formNumber: string): SignerRole[] {
  const config = SIGNATURE_CONFIGS[formNumber];
  if (!config) return [];

  const roles = new Set<SignerRole>();
  config.anchors.filter(a => a.required).forEach(a => roles.add(a.role));
  return Array.from(roles);
}

/**
 * Check if form requires specific role to sign
 */
export function requiresRole(formNumber: string, role: SignerRole): boolean {
  const config = SIGNATURE_CONFIGS[formNumber];
  if (!config) return false;

  if (role === 'agent' || role === 'producer') {
    return config.requiresAgentSignature;
  }
  if (role === 'applicant' || role === 'co_applicant') {
    return config.requiresApplicantSignature;
  }

  return config.anchors.some(a => a.role === role && a.required);
}

/**
 * Get all supported form numbers
 */
export function getSupportedFormNumbers(): string[] {
  return Object.keys(SIGNATURE_CONFIGS);
}

/**
 * Generate signature request structure for eSignature API
 */
export function generateSignatureRequest(
  formNumber: string,
  signers: { role: SignerRole; email: string; name: string }[]
): {
  anchors: SignatureAnchor[];
  signerAssignments: { anchor: SignatureAnchor; signer: typeof signers[0] }[];
} {
  const anchors = getSignatureAnchors(formNumber);
  const signerAssignments: { anchor: SignatureAnchor; signer: typeof signers[0] }[] = [];

  anchors.forEach(anchor => {
    const signer = signers.find(s => s.role === anchor.role);
    if (signer) {
      signerAssignments.push({ anchor, signer });
    }
  });

  return { anchors, signerAssignments };
}

// ============================================
// EXPORTS
// ============================================

export {
  SIGNATURE_CONFIGS,
  ACORD_125_SIGNATURES,
  ACORD_126_SIGNATURES,
  ACORD_127_SIGNATURES,
  ACORD_130_SIGNATURES,
  ACORD_140_SIGNATURES,
};
