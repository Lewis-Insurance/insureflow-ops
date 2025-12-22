/**
 * Workers' Compensation Evidence Service
 *
 * Specialized evidence service for WC policy extraction that:
 * - Uses Azure Document Intelligence for OCR
 * - Builds evidence catalogs with WC-specific field patterns
 * - Supports click-to-highlight in the WC details UI
 * - Integrates with the existing EvidenceCatalogBuilder infrastructure
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  EvidenceCatalogBuilder,
  EvidenceCatalog,
  EvidenceEntry,
  AzureDIResponse,
  BoundingBox,
} from './EvidenceCatalogBuilder';

// =============================================================================
// WC-SPECIFIC FIELD PATTERNS
// =============================================================================

/**
 * Field patterns specific to Workers' Compensation documents
 */
export const WC_FIELD_PATTERNS: Record<string, RegExp[]> = {
  // Policy Identity
  CarrierNAIC: [
    /naic\s*(number|no\.?|#|code)/i,
    /\b\d{5}\b/, // 5-digit NAIC code pattern
  ],
  FEIN: [
    /fein/i,
    /federal\s*(employer\s*)?id/i,
    /tax\s*id/i,
    /ein/i,
    /\b\d{2}-\d{7}\b/, // EIN pattern
  ],
  NamedInsured: [
    /named\s*insured/i,
    /insured\s*name/i,
    /policy\s*holder/i,
    /employer\s*name/i,
  ],
  DBA: [
    /d\.?b\.?a\.?/i,
    /doing\s*business\s*as/i,
    /trade\s*name/i,
  ],

  // Experience Rating
  ExperienceMod: [
    /experience\s*mod/i,
    /x-?mod/i,
    /mod\s*factor/i,
    /e\.?m\.?r\.?/i,
    /experience\s*modification/i,
  ],
  RatingBureau: [
    /rating\s*bureau/i,
    /ncci/i,
    /wcirb/i,
    /state\s*rating\s*bureau/i,
  ],
  ScheduleRating: [
    /schedule\s*rating/i,
    /schedule\s*credit/i,
    /schedule\s*debit/i,
  ],
  MeritRating: [
    /merit\s*rating/i,
    /merit\s*credit/i,
    /merit\s*debit/i,
  ],

  // Classification Codes
  ClassCode: [
    /class\s*code/i,
    /classification\s*code/i,
    /wc\s*class/i,
    /\b\d{4}\b/, // 4-digit class code pattern
  ],
  ClassDescription: [
    /class\s*description/i,
    /occupation/i,
    /job\s*description/i,
  ],
  GoverningClass: [
    /governing\s*class/i,
    /gov\s*class/i,
  ],
  EstimatedPayroll: [
    /estimated\s*payroll/i,
    /annual\s*payroll/i,
    /remuneration/i,
  ],
  ClassRate: [
    /rate/i,
    /rate\s*per\s*\$100/i,
    /manual\s*rate/i,
  ],

  // Covered States
  Item3AStates: [
    /item\s*3\.?a/i,
    /states\s*of\s*operation/i,
    /covered\s*states/i,
  ],
  Item3CStates: [
    /item\s*3\.?c/i,
    /other\s*states/i,
    /all\s*except/i,
  ],

  // Employers Liability
  EachAccidentLimit: [
    /each\s*accident/i,
    /bodily\s*injury.*accident/i,
  ],
  DiseaseEachEmployee: [
    /disease.*employee/i,
    /disease.*each/i,
  ],
  DiseasePolicyLimit: [
    /disease.*policy\s*limit/i,
    /disease.*aggregate/i,
  ],

  // Premium
  TotalPremium: [
    /total\s*premium/i,
    /annual\s*premium/i,
    /estimated\s*premium/i,
  ],
  ExpenseConstant: [
    /expense\s*constant/i,
  ],
  StateAssessments: [
    /state\s*assess/i,
    /surcharge/i,
  ],
  TerrorismCharge: [
    /terrorism/i,
    /tria/i,
    /tripra/i,
  ],
  DepositPremium: [
    /deposit\s*premium/i,
    /initial\s*premium/i,
  ],
  MinimumPremium: [
    /minimum\s*premium/i,
    /min\s*premium/i,
  ],

  // Officer/Owner Elections
  OfficerName: [
    /officer\s*name/i,
    /owner\s*name/i,
    /partner\s*name/i,
  ],
  OfficerTitle: [
    /title/i,
    /position/i,
  ],
  OwnershipPercent: [
    /ownership\s*%/i,
    /percent\s*owned/i,
  ],
  OfficerIncluded: [
    /included/i,
    /covered/i,
    /elected/i,
  ],
  OfficerExcluded: [
    /excluded/i,
    /not\s*covered/i,
    /waived/i,
  ],
  OfficerRemuneration: [
    /remuneration/i,
    /salary/i,
    /compensation/i,
  ],
};

// =============================================================================
// TYPES
// =============================================================================

export interface WCEvidenceEntry extends EvidenceEntry {
  /** WC-specific field tag */
  wcFieldTag?: string;

  /** Table row context for classification tables */
  classificationRow?: {
    state?: string;
    classCode?: string;
    description?: string;
    payroll?: number;
    rate?: number;
    premium?: number;
  };

  /** Officer row context for officer tables */
  officerRow?: {
    name?: string;
    title?: string;
    ownershipPercent?: number;
    included?: boolean;
    remuneration?: number;
  };
}

export interface WCEvidenceCatalog extends EvidenceCatalog {
  /** Document ID for reference */
  documentId: string;

  /** Policy ID this evidence is for */
  policyId: string;

  /** Evidence grouped by WC field */
  byWCField: Record<string, string[]>;

  /** Classification table evidence */
  classificationEvidence: WCEvidenceEntry[];

  /** Officer table evidence */
  officerEvidence: WCEvidenceEntry[];

  /** Experience mod evidence */
  experienceModEvidence: WCEvidenceEntry[];

  /** Azure processing metadata */
  azureMetadata: {
    modelId: string;
    processingTimeMs: number;
    pageCount: number;
    avgConfidence: number;
  };
}

export interface WCExtractionResult {
  /** Extracted field value */
  value: string | number | null;

  /** Confidence score (0-1) */
  confidence: number;

  /** Evidence IDs supporting this value */
  evidenceIds: string[];

  /** Primary evidence ID */
  primaryEvidenceId: string | null;

  /** Status (matches FieldStatus from FieldResult) */
  status: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'NEEDS_VERIFICATION' | 'LOW_CONFIDENCE' | 'NOT_FOUND' | 'CONFLICT';

  /** Reasoning for this extraction */
  reasoning?: string;
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class WCEvidenceService {
  private catalogBuilder: EvidenceCatalogBuilder;

  constructor() {
    this.catalogBuilder = new EvidenceCatalogBuilder();
  }

  // ===========================================================================
  // EVIDENCE CATALOG BUILDING
  // ===========================================================================

  /**
   * Build WC evidence catalog from Azure DI response
   */
  buildCatalog(
    azureResponse: AzureDIResponse,
    documentId: string,
    policyId: string
  ): WCEvidenceCatalog {
    // Use base builder
    const baseCatalog = this.catalogBuilder.build(azureResponse);

    // Enhance with WC-specific field tagging
    const byWCField: Record<string, string[]> = {};
    const classificationEvidence: WCEvidenceEntry[] = [];
    const officerEvidence: WCEvidenceEntry[] = [];
    const experienceModEvidence: WCEvidenceEntry[] = [];

    for (const [evidenceId, entry] of Object.entries(baseCatalog.entries)) {
      // Add WC field tags
      const wcTags = this.inferWCFieldTags(entry.label || '', entry.value);

      for (const tag of wcTags) {
        if (!byWCField[tag]) {
          byWCField[tag] = [];
        }
        byWCField[tag].push(evidenceId);
      }

      // Categorize evidence
      if (this.isClassificationEvidence(entry)) {
        classificationEvidence.push({
          ...entry,
          wcFieldTag: 'classification',
          classificationRow: this.extractClassificationRow(entry),
        });
      }

      if (this.isOfficerEvidence(entry)) {
        officerEvidence.push({
          ...entry,
          wcFieldTag: 'officer',
          officerRow: this.extractOfficerRow(entry),
        });
      }

      if (this.isExperienceModEvidence(entry)) {
        experienceModEvidence.push({
          ...entry,
          wcFieldTag: 'experience_mod',
        });
      }
    }

    return {
      ...baseCatalog,
      documentId,
      policyId,
      byWCField,
      classificationEvidence,
      officerEvidence,
      experienceModEvidence,
      azureMetadata: {
        modelId: 'prebuilt-document',
        processingTimeMs: 0,
        pageCount: baseCatalog.stats.pageCount,
        avgConfidence: baseCatalog.stats.avgConfidence,
      },
    };
  }

  // ===========================================================================
  // WC FIELD INFERENCE
  // ===========================================================================

  /**
   * Infer WC-specific field tags from label and value
   */
  private inferWCFieldTags(label: string, value: string): string[] {
    const tags: string[] = [];

    for (const [fieldName, patterns] of Object.entries(WC_FIELD_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(label) || pattern.test(value)) {
          tags.push(fieldName);
          break;
        }
      }
    }

    // Value-based inference
    // Experience mod (0.XXX format)
    if (/^[01]\.\d{2,3}$/.test(value)) {
      if (!tags.includes('ExperienceMod')) {
        tags.push('ExperienceMod');
      }
    }

    // NAIC code (5 digits)
    if (/^\d{5}$/.test(value)) {
      if (!tags.includes('CarrierNAIC')) {
        tags.push('CarrierNAIC');
      }
    }

    // Class code (4 digits)
    if (/^\d{4}$/.test(value) && !value.startsWith('0')) {
      if (!tags.includes('ClassCode')) {
        tags.push('ClassCode');
      }
    }

    // FEIN (XX-XXXXXXX)
    if (/^\d{2}-\d{7}$/.test(value)) {
      if (!tags.includes('FEIN')) {
        tags.push('FEIN');
      }
    }

    // State code
    if (/^[A-Z]{2}$/.test(value)) {
      tags.push('StateCode');
    }

    return Array.from(new Set(tags));
  }

  // ===========================================================================
  // EVIDENCE CATEGORIZATION
  // ===========================================================================

  /**
   * Check if evidence is from a classification table
   */
  private isClassificationEvidence(entry: EvidenceEntry): boolean {
    if (entry.tableContext) {
      // Check column headers for classification indicators
      const header = entry.tableContext.columnHeader?.toLowerCase() || '';
      return (
        header.includes('class') ||
        header.includes('code') ||
        header.includes('payroll') ||
        header.includes('rate') ||
        header.includes('premium')
      );
    }
    return false;
  }

  /**
   * Check if evidence is from an officer table
   */
  private isOfficerEvidence(entry: EvidenceEntry): boolean {
    if (entry.tableContext) {
      const header = entry.tableContext.columnHeader?.toLowerCase() || '';
      return (
        header.includes('officer') ||
        header.includes('owner') ||
        header.includes('partner') ||
        header.includes('member') ||
        header.includes('title') ||
        header.includes('included') ||
        header.includes('excluded')
      );
    }
    return false;
  }

  /**
   * Check if evidence is experience mod related
   */
  private isExperienceModEvidence(entry: EvidenceEntry): boolean {
    const label = entry.label?.toLowerCase() || '';
    const value = entry.value.toLowerCase();

    return (
      /experience\s*mod/i.test(label) ||
      /x-?mod/i.test(label) ||
      /e\.?m\.?r\.?/i.test(label) ||
      (/^[01]\.\d{2,3}$/.test(entry.value) && label.includes('mod'))
    );
  }

  // ===========================================================================
  // TABLE ROW EXTRACTION
  // ===========================================================================

  /**
   * Extract classification row data from table evidence
   */
  private extractClassificationRow(entry: EvidenceEntry): WCEvidenceEntry['classificationRow'] {
    if (!entry.tableContext) return undefined;

    const header = entry.tableContext.columnHeader?.toLowerCase() || '';
    const value = entry.normalizedValue;

    if (header.includes('state')) {
      return { state: value };
    }
    if (header.includes('class') || header.includes('code')) {
      return { classCode: value };
    }
    if (header.includes('description')) {
      return { description: value };
    }
    if (header.includes('payroll')) {
      return { payroll: parseFloat(value.replace(/[,$]/g, '')) || undefined };
    }
    if (header.includes('rate')) {
      return { rate: parseFloat(value) || undefined };
    }
    if (header.includes('premium')) {
      return { premium: parseFloat(value.replace(/[,$]/g, '')) || undefined };
    }

    return undefined;
  }

  /**
   * Extract officer row data from table evidence
   */
  private extractOfficerRow(entry: EvidenceEntry): WCEvidenceEntry['officerRow'] {
    if (!entry.tableContext) return undefined;

    const header = entry.tableContext.columnHeader?.toLowerCase() || '';
    const value = entry.normalizedValue;

    if (header.includes('name')) {
      return { name: value };
    }
    if (header.includes('title')) {
      return { title: value };
    }
    if (header.includes('ownership') || header.includes('%')) {
      return { ownershipPercent: parseFloat(value) || undefined };
    }
    if (header.includes('included') || header.includes('excluded')) {
      return { included: /yes|include|x/i.test(value) };
    }
    if (header.includes('remuneration') || header.includes('salary')) {
      return { remuneration: parseFloat(value.replace(/[,$]/g, '')) || undefined };
    }

    return undefined;
  }

  // ===========================================================================
  // PROMPT BUILDING
  // ===========================================================================

  /**
   * Format WC evidence catalog for LLM prompt
   */
  formatForPrompt(catalog: WCEvidenceCatalog): string {
    const lines: string[] = [];

    lines.push('## Workers\' Compensation Evidence Catalog');
    lines.push('');
    lines.push(`Document: ${catalog.documentId}`);
    lines.push(`Pages: ${catalog.azureMetadata.pageCount}`);
    lines.push(`Avg Confidence: ${(catalog.azureMetadata.avgConfidence * 100).toFixed(1)}%`);
    lines.push('');

    // Classification evidence
    if (catalog.classificationEvidence.length > 0) {
      lines.push('### Classification Evidence');
      for (const entry of catalog.classificationEvidence) {
        const row = entry.classificationRow;
        lines.push(`- **${entry.evidenceId}** [${entry.label || 'table'}]: "${entry.value}" (${(entry.confidence * 100).toFixed(0)}%)`);
        if (row) {
          lines.push(`  Row data: ${JSON.stringify(row)}`);
        }
      }
      lines.push('');
    }

    // Officer evidence
    if (catalog.officerEvidence.length > 0) {
      lines.push('### Officer/Owner Evidence');
      for (const entry of catalog.officerEvidence) {
        lines.push(`- **${entry.evidenceId}** [${entry.label || 'table'}]: "${entry.value}" (${(entry.confidence * 100).toFixed(0)}%)`);
      }
      lines.push('');
    }

    // Experience mod evidence
    if (catalog.experienceModEvidence.length > 0) {
      lines.push('### Experience Mod Evidence');
      for (const entry of catalog.experienceModEvidence) {
        lines.push(`- **${entry.evidenceId}** [${entry.label || 'field'}]: "${entry.value}" (${(entry.confidence * 100).toFixed(0)}%)`);
      }
      lines.push('');
    }

    // All other key-value evidence
    lines.push('### Key-Value Pairs');
    const kvEntries = Object.values(catalog.entries)
      .filter(e => e.sourceType === 'key_value')
      .slice(0, 100);

    for (const entry of kvEntries) {
      const labelPart = entry.label ? `[${entry.label}]` : '';
      const confPart = `(${(entry.confidence * 100).toFixed(0)}%)`;
      const wcTags = catalog.byWCField
        ? Object.entries(catalog.byWCField)
            .filter(([_, ids]) => ids.includes(entry.evidenceId))
            .map(([tag]) => tag)
        : [];
      const tagsPart = wcTags.length > 0 ? ` {${wcTags.join(', ')}}` : '';

      lines.push(`- **${entry.evidenceId}** ${labelPart}: "${entry.value}" ${confPart}${tagsPart}`);
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // EVIDENCE RETRIEVAL
  // ===========================================================================

  /**
   * Get evidence by ID
   */
  getEvidence(catalog: WCEvidenceCatalog, evidenceId: string): EvidenceEntry | null {
    return catalog.entries[evidenceId] || null;
  }

  /**
   * Get evidence for a WC field
   */
  getEvidenceForField(catalog: WCEvidenceCatalog, fieldName: string): EvidenceEntry[] {
    const ids = catalog.byWCField[fieldName] || [];
    return ids.map(id => catalog.entries[id]).filter(Boolean);
  }

  /**
   * Get bounding box for click-to-highlight
   */
  getBoundingBox(catalog: WCEvidenceCatalog, evidenceId: string): BoundingBox | null {
    const entry = catalog.entries[evidenceId];
    return entry?.boundingBox || null;
  }

  /**
   * Get all bounding boxes for a list of evidence IDs
   */
  getBoundingBoxes(catalog: WCEvidenceCatalog, evidenceIds: string[]): Record<string, BoundingBox> {
    const boxes: Record<string, BoundingBox> = {};
    for (const id of evidenceIds) {
      const box = this.getBoundingBox(catalog, id);
      if (box) {
        boxes[id] = box;
      }
    }
    return boxes;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const wcEvidenceService = new WCEvidenceService();
