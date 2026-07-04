// ============================================
// ACORD Template Ingestion
// Handles PDF upload, validation, and field extraction
// ============================================

import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFButton, PDFName, PDFDict } from 'pdf-lib';
import type { AcordTemplate, FieldInventoryItem, FieldSchemaItem, SectionDefinition } from '@/types/acord';
import { ACORD25_EXPECTED_FIELD_NAMES } from './acord25/fieldMap';

// ============================================
// TYPES
// ============================================

export interface TemplateIngestionResult {
  success: boolean;
  template?: Partial<AcordTemplate>;
  fieldInventory: FieldInventoryItem[];
  fieldSchema: FieldSchemaItem[];
  sections: SectionDefinition[];
  sanitizedBytes?: Uint8Array;
  errors: string[];
  warnings: string[];
}

export interface IngestionOptions {
  formNumber: string;
  formName: string;
  version: string;
  templateSource?: 'acord_portal' | 'carrier' | 'custom';
  licenseNotes?: string;
}

// ============================================
// ACORD SECTION PATTERNS
// Field names in ACORD forms follow patterns like:
// - "ApplicantName" (Section 1)
// - "GL_ClassCode_1" (Section 2 - GL)
// - "Veh_Year_1" (Section 3 - Auto)
// ============================================

const SECTION_PATTERNS: Record<number, { name: string; patterns: RegExp[] }> = {
  1: {
    name: 'Applicant Information',
    patterns: [/^Applicant/i, /^MailAddr/i, /^Phone/i, /^Email/i, /^Website/i, /^FEIN/i, /^Entity/i],
  },
  2: {
    name: 'General Liability',
    patterns: [/^GL_/i, /^CGL/i, /^GenLiab/i, /^PremOps/i, /^ProdComp/i],
  },
  3: {
    name: 'Commercial Auto',
    patterns: [/^Veh_/i, /^Driver_/i, /^Auto_/i, /^CA_/i, /^Garage/i],
  },
  4: {
    name: 'Workers Compensation',
    patterns: [/^WC_/i, /^WorkComp/i, /^Class_/i, /^Payroll/i, /^Employee/i],
  },
  5: {
    name: 'Property',
    patterns: [/^Prop_/i, /^Bldg_/i, /^Location_/i, /^BPP_/i, /^Inventory/i],
  },
  6: {
    name: 'Producer Information',
    patterns: [/^Producer/i, /^Agency/i, /^AgentName/i, /^License/i],
  },
  7: {
    name: 'Signature & Remarks',
    patterns: [/^Signature/i, /^Date$/i, /^Remarks/i, /^SignDate/i],
  },
};

// ============================================
// XFA DETECTION
// ============================================

/**
 * Detects whether a PDF carries an XFA packet in its AcroForm dictionary.
 * Must be called BEFORE getForm(), because getForm() auto-strips the XFA entry
 * (pdf-lib preserves the underlying AcroForm fields but removes the XFA layer).
 */
export function hasXfaPacket(pdfDoc: PDFDocument): boolean {
  const acroForm = pdfDoc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  return !!acroForm?.has(PDFName.of('XFA'));
}

// ============================================
// MAIN INGESTION FUNCTION
// ============================================

export async function ingestAcordTemplate(
  pdfBytes: Uint8Array | ArrayBuffer,
  options: IngestionOptions
): Promise<TemplateIngestionResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fieldInventory: FieldInventoryItem[] = [];
  const fieldSchema: FieldSchemaItem[] = [];
  const sectionMap = new Map<number, string[]>();

  try {
    // Load the PDF
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    // Detect XFA BEFORE getForm() (getForm auto-strips the XFA entry)
    const isXfaHybrid = hasXfaPacket(pdfDoc);

    // Get form fields
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    if (fields.length === 0) {
      errors.push(
        isXfaHybrid
          ? 'This PDF is XFA-only (no AcroForm fields). Export or re-download an AcroForm version of the form.'
          : 'No form fields found in PDF. Please upload a fillable AcroForm PDF.'
      );
      return { success: false, fieldInventory: [], fieldSchema: [], sections: [], errors, warnings };
    }

    if (isXfaHybrid) {
      warnings.push(`XFA form data detected and removed. ${fields.length} AcroForm fields were preserved and will be used for filling.`);
    }

    // Process each field
    for (const field of fields) {
      const fieldName = field.getName();
      const widgets = field.acroField.getWidgets();

      // Get field position from first widget
      let page = 0;
      let rect = { x: 0, y: 0, width: 100, height: 20 };

      if (widgets.length > 0) {
        const widget = widgets[0];
        const widgetPage = pdfDoc.getPages().findIndex(p => {
          const annots = p.node.lookup(p.node.get('Annots' as any) as any);
          if (annots && Array.isArray(annots)) {
            return annots.some((a: any) => a === widget.dict);
          }
          return false;
        });
        page = widgetPage >= 0 ? widgetPage + 1 : 1;

        const rectArray = widget.getRectangle();
        rect = {
          x: rectArray.x,
          y: rectArray.y,
          width: rectArray.width,
          height: rectArray.height,
        };
      }

      // Determine field type and create inventory item
      const inventoryItem = createFieldInventoryItem(field, fieldName, page, rect);
      fieldInventory.push(inventoryItem);

      // Create schema item
      const section = detectSection(fieldName);
      const schemaItem = createFieldSchemaItem(field, fieldName, section);
      fieldSchema.push(schemaItem);

      // Track sections
      if (!sectionMap.has(section)) {
        sectionMap.set(section, []);
      }
      sectionMap.get(section)!.push(fieldName);
    }

    // Build section definitions
    const sections = buildSectionDefinitions(sectionMap);

    // Validate required fields for common ACORD forms
    const validationWarnings = validateAcordFields(options.formNumber, fieldInventory);
    warnings.push(...validationWarnings);

    // Create template object
    const template: Partial<AcordTemplate> = {
      form_number: options.formNumber,
      form_name: options.formName,
      version: options.version,
      is_current: true,
      pdf_type: isXfaHybrid ? 'acroform_hybrid' : 'acroform',
      field_inventory: fieldInventory,
      field_schema: fieldSchema,
      section_definitions: sections,
      validation_rules: [],
      signature_anchors: extractSignatureAnchors(fieldInventory),
      repeater_configs: detectRepeaterConfigs(fieldInventory),
      template_source: options.templateSource || 'acord_portal',
      license_notes: options.licenseNotes,
    };

    // Serialize the parsed document. Accessing getForm() above strips the XFA
    // entry, so these bytes are a clean AcroForm-only copy safe to store.
    const sanitizedBytes = new Uint8Array(await pdfDoc.save());

    return {
      success: true,
      template,
      fieldInventory,
      fieldSchema,
      sections,
      sanitizedBytes,
      errors,
      warnings,
    };
  } catch (error) {
    errors.push(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { success: false, fieldInventory: [], fieldSchema: [], sections: [], errors, warnings };
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function createFieldInventoryItem(
  field: ReturnType<PDFDocument['getForm']>['getFields'][0],
  name: string,
  page: number,
  rect: { x: number; y: number; width: number; height: number }
): FieldInventoryItem {
  let type: FieldInventoryItem['type'] = 'text';
  let options: string[] | undefined;
  let maxLength: number | undefined;

  if (field instanceof PDFTextField) {
    type = 'text';
    maxLength = field.getMaxLength();
  } else if (field instanceof PDFCheckBox) {
    type = 'checkbox';
  } else if (field instanceof PDFDropdown) {
    type = 'dropdown';
    options = field.getOptions();
  } else if (field instanceof PDFRadioGroup) {
    type = 'radio';
    options = field.getOptions();
  } else if (field instanceof PDFButton) {
    type = 'button';
  }

  // Check if field name suggests signature
  if (/signature|sign/i.test(name)) {
    type = 'signature';
  }

  return {
    name,
    type,
    page,
    rect,
    maxLength,
    options,
    required: isLikelyRequired(name),
    tooltip: undefined,
  };
}

function createFieldSchemaItem(
  field: ReturnType<PDFDocument['getForm']>['getFields'][0],
  name: string,
  section: number
): FieldSchemaItem {
  let type = 'string';
  let validation: FieldSchemaItem['validation'] = undefined;

  if (field instanceof PDFTextField) {
    const maxLength = field.getMaxLength();
    if (maxLength) {
      validation = { maxLength };
    }

    // Detect type from field name
    if (/date|dob|effective|expir/i.test(name)) {
      type = 'date';
    } else if (/phone|fax/i.test(name)) {
      type = 'phone';
      validation = { ...validation, pattern: '^[0-9\\-\\(\\)\\s]+$' };
    } else if (/email/i.test(name)) {
      type = 'email';
      validation = { ...validation, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' };
    } else if (/zip|postal/i.test(name)) {
      type = 'zip';
      validation = { ...validation, pattern: '^[0-9]{5}(-[0-9]{4})?$' };
    } else if (/fein|ein|tax.*id/i.test(name)) {
      type = 'ein';
      validation = { ...validation, pattern: '^[0-9]{2}-[0-9]{7}$' };
    } else if (/ssn|social/i.test(name)) {
      type = 'ssn';
    } else if (/amount|premium|limit|deduct|payroll|revenue|value/i.test(name)) {
      type = 'currency';
    } else if (/year|count|number|age|floors|stories/i.test(name)) {
      type = 'number';
    }
  } else if (field instanceof PDFCheckBox) {
    type = 'boolean';
  } else if (field instanceof PDFDropdown || field instanceof PDFRadioGroup) {
    type = 'enum';
  }

  return {
    name,
    label: formatFieldLabel(name),
    section,
    type,
    required: isLikelyRequired(name),
    validation,
  };
}

function detectSection(fieldName: string): number {
  for (const [sectionNum, { patterns }] of Object.entries(SECTION_PATTERNS)) {
    if (patterns.some(pattern => pattern.test(fieldName))) {
      return parseInt(sectionNum);
    }
  }
  return 1; // Default to section 1
}

function buildSectionDefinitions(sectionMap: Map<number, string[]>): SectionDefinition[] {
  const sections: SectionDefinition[] = [];

  for (const [sectionNum, fields] of sectionMap) {
    const sectionInfo = SECTION_PATTERNS[sectionNum] || { name: `Section ${sectionNum}`, patterns: [] };

    sections.push({
      sectionNumber: sectionNum,
      sectionName: sectionInfo.name,
      description: `${sectionInfo.name} fields`,
      fields,
      requiredForSubmission: sectionNum <= 2, // Sections 1-2 typically required
      estimatedMinutes: Math.max(2, Math.ceil(fields.length / 5)),
    });
  }

  return sections.sort((a, b) => a.sectionNumber - b.sectionNumber);
}

function formatFieldLabel(fieldName: string): string {
  // Convert camelCase and snake_case to Title Case with spaces
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function isLikelyRequired(fieldName: string): boolean {
  const requiredPatterns = [
    /^applicant.*name/i,
    /^mail.*addr/i,
    /^city$/i,
    /^state$/i,
    /^zip/i,
    /^effective.*date/i,
    /^expir.*date/i,
    /^fein/i,
    /^producer.*name/i,
    /^agency.*name/i,
  ];
  return requiredPatterns.some(pattern => pattern.test(fieldName));
}

function extractSignatureAnchors(inventory: FieldInventoryItem[]): AcordTemplate['signature_anchors'] {
  return inventory
    .filter(field => field.type === 'signature' || /signature|sign/i.test(field.name))
    .map(field => ({
      tag: field.name,
      page: field.page,
      x: field.rect.x,
      y: field.rect.y,
      width: field.rect.width,
      height: field.rect.height,
      signerRole: detectSignerRole(field.name),
      required: true,
    }));
}

function detectSignerRole(fieldName: string): 'insured' | 'producer' | 'witness' | 'additional_insured' {
  if (/producer|agent|agency/i.test(fieldName)) return 'producer';
  if (/witness/i.test(fieldName)) return 'witness';
  if (/additional/i.test(fieldName)) return 'additional_insured';
  return 'insured';
}

function detectRepeaterConfigs(inventory: FieldInventoryItem[]): AcordTemplate['repeater_configs'] {
  const repeaters: AcordTemplate['repeater_configs'] = [];
  const patterns: Record<string, { prefix: string; indices: Set<number> }> = {};

  // Detect numbered field patterns like Veh_Year_1, Veh_Year_2
  for (const field of inventory) {
    const match = field.name.match(/^(.+?)_(\d+)$/);
    if (match) {
      const [, prefix, indexStr] = match;
      if (!patterns[prefix]) {
        patterns[prefix] = { prefix, indices: new Set() };
      }
      patterns[prefix].indices.add(parseInt(indexStr));
    }
  }

  // Create repeater configs for patterns with multiple indices
  for (const [prefix, { indices }] of Object.entries(patterns)) {
    if (indices.size >= 2) {
      const sortedIndices = Array.from(indices).sort((a, b) => a - b);
      const itemsPerPage = sortedIndices.length;

      // Detect the type of repeater
      let sourceArrayPath = 'items';
      if (/veh|vehicle|auto/i.test(prefix)) sourceArrayPath = 'vehicles';
      else if (/driver/i.test(prefix)) sourceArrayPath = 'drivers';
      else if (/location|loc/i.test(prefix)) sourceArrayPath = 'locations';
      else if (/class/i.test(prefix)) sourceArrayPath = 'classifications';

      repeaters.push({
        id: `repeater_${prefix.toLowerCase()}`,
        sourceArrayPath,
        itemsPerPage,
        overflowStrategy: 'clone_page',
        namingPattern: `${prefix}_{field}_{index}`,
        fieldMap: {},
        startIndex: sortedIndices[0],
      });
    }
  }

  return repeaters;
}

function validateAcordFields(formNumber: string, inventory: FieldInventoryItem[]): string[] {
  const warnings: string[] = [];
  const fieldNames = new Set(inventory.map(f => f.name.toLowerCase()));

  // Expected fields for common ACORD forms
  const expectedFields: Record<string, string[]> = {
    '125': ['ApplicantName', 'MailAddr', 'City', 'State', 'Zip', 'FEIN', 'EffectiveDate', 'ExpirationDate'],
    '126': ['GL_PerOccLimit', 'GL_GenAggLimit', 'GL_ProdCompOps', 'GL_ClassCode'],
    '127': ['Veh_Year', 'Veh_Make', 'Veh_VIN', 'Veh_GVW', 'CSL_Limit'],
    '130': ['WC_PerAccident', 'WC_Disease', 'Class_Code', 'Payroll'],
    '140': ['Prop_Limit', 'Bldg_Value', 'BPP_Value', 'Location_Addr'],
    // ACORD 25: sourced from the committed field map so the ingestion warning
    // list and the fill contract can never drift. Empty pre-onboarding (the loop
    // below iterates zero times); populated at onboarding with the critical names.
    '25': ACORD25_EXPECTED_FIELD_NAMES,
  };

  const expected = expectedFields[formNumber];
  if (expected) {
    for (const field of expected) {
      if (!fieldNames.has(field.toLowerCase())) {
        warnings.push(`Expected field "${field}" not found in form ${formNumber}`);
      }
    }
  }

  return warnings;
}

// ============================================
// VALIDATION UTILITIES
// ============================================

export async function validatePdfForAcord(pdfBytes: Uint8Array | ArrayBuffer): Promise<{
  valid: boolean;
  isAcroForm: boolean;
  isXfaHybrid: boolean;
  fieldCount: number;
  errors: string[];
  warnings: string[];
}> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const isXfaHybrid = hasXfaPacket(pdfDoc);   // before getForm()
    const fields = pdfDoc.getForm().getFields();
    return {
      valid: fields.length > 0,
      isAcroForm: fields.length > 0,
      isXfaHybrid,
      fieldCount: fields.length,
      errors: fields.length === 0 ? [isXfaHybrid ? 'XFA-only PDF: no AcroForm fields to fill' : 'No form fields found'] : [],
      warnings: isXfaHybrid && fields.length > 0 ? ['XFA data present; it will be removed at upload and the AcroForm fields kept'] : [],
    };
  } catch (error) {
    return { valid: false, isAcroForm: false, isXfaHybrid: false, fieldCount: 0, warnings: [], errors: [error instanceof Error ? error.message : 'Failed to parse PDF'] };
  }
}

// ============================================
// FIELD EXTRACTION UTILITIES
// ============================================

export async function extractFieldsFromPdf(pdfBytes: Uint8Array | ArrayBuffer): Promise<{
  fields: Array<{ name: string; type: string; value: string | boolean | null }>;
  pageCount: number;
}> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  const extractedFields = fields.map(field => {
    const name = field.getName();
    let type = 'text';
    let value: string | boolean | null = null;

    if (field instanceof PDFTextField) {
      type = 'text';
      value = field.getText() || null;
    } else if (field instanceof PDFCheckBox) {
      type = 'checkbox';
      value = field.isChecked();
    } else if (field instanceof PDFDropdown) {
      type = 'dropdown';
      const selected = field.getSelected();
      value = selected.length > 0 ? selected[0] : null;
    } else if (field instanceof PDFRadioGroup) {
      type = 'radio';
      value = field.getSelected() || null;
    }

    return { name, type, value };
  });

  return {
    fields: extractedFields,
    pageCount: pdfDoc.getPageCount(),
  };
}
