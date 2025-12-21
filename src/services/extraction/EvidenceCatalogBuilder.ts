/**
 * Evidence Catalog Builder
 *
 * Transforms Azure Document Intelligence output into structured evidence entries.
 * Evidence is the foundation for LLM extraction - no guessing allowed.
 *
 * Features:
 * - Parses Azure DI key-value pairs, tables, and text
 * - Assigns unique evidence IDs for traceability
 * - Calculates confidence scores per evidence
 * - Preserves bounding box info for UI highlighting
 * - Groups related evidence (e.g., address components)
 */

// =============================================================================
// TYPES
// =============================================================================

export interface EvidenceEntry {
  /** Unique identifier for this evidence */
  evidenceId: string;

  /** Source type: where this evidence came from */
  sourceType: 'key_value' | 'table_cell' | 'text_span' | 'layout_element';

  /** The label/key if from key-value pair */
  label: string | null;

  /** The extracted value */
  value: string;

  /** Normalized value after cleanup */
  normalizedValue: string;

  /** Azure confidence score (0-1) */
  confidence: number;

  /** Page number (1-indexed) */
  pageNumber: number;

  /** Bounding box for UI highlighting */
  boundingBox: BoundingBox | null;

  /** Table context if from a table */
  tableContext?: TableContext;

  /** Related evidence IDs (e.g., parts of an address) */
  relatedEvidenceIds: string[];

  /** Semantic tags for grouping */
  tags: string[];

  /** Raw Azure DI span info */
  spans?: AzureSpan[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

export interface TableContext {
  tableIndex: number;
  rowIndex: number;
  columnIndex: number;
  columnHeader?: string;
  rowHeader?: string;
}

export interface AzureSpan {
  offset: number;
  length: number;
}

export interface EvidenceCatalog {
  /** All evidence entries indexed by ID */
  entries: Record<string, EvidenceEntry>;

  /** Evidence grouped by potential ACORD field */
  byPotentialField: Record<string, string[]>;

  /** Evidence grouped by page */
  byPage: Record<number, string[]>;

  /** Evidence grouped by source type */
  bySourceType: Record<string, string[]>;

  /** Summary statistics */
  stats: CatalogStats;
}

export interface CatalogStats {
  totalEntries: number;
  bySourceType: Record<string, number>;
  avgConfidence: number;
  pageCount: number;
}

// =============================================================================
// AZURE DI RESPONSE TYPES
// =============================================================================

export interface AzureDIResponse {
  analyzeResult?: {
    keyValuePairs?: AzureKeyValuePair[];
    tables?: AzureTable[];
    content?: string;
    pages?: AzurePage[];
    paragraphs?: AzureParagraph[];
    documents?: AzureDocument[];
  };
}

export interface AzureKeyValuePair {
  key?: {
    content?: string;
    boundingRegions?: AzureBoundingRegion[];
    confidence?: number;
    spans?: AzureSpan[];
  };
  value?: {
    content?: string;
    boundingRegions?: AzureBoundingRegion[];
    confidence?: number;
    spans?: AzureSpan[];
  };
  confidence?: number;
}

export interface AzureTable {
  rowCount: number;
  columnCount: number;
  cells: AzureTableCell[];
  boundingRegions?: AzureBoundingRegion[];
}

export interface AzureTableCell {
  rowIndex: number;
  columnIndex: number;
  content: string;
  boundingRegions?: AzureBoundingRegion[];
  confidence?: number;
  kind?: 'content' | 'columnHeader' | 'rowHeader';
  spans?: AzureSpan[];
}

export interface AzureBoundingRegion {
  pageNumber: number;
  polygon?: number[];
}

export interface AzurePage {
  pageNumber: number;
  width: number;
  height: number;
  unit: string;
  lines?: AzureLine[];
}

export interface AzureLine {
  content: string;
  boundingPolygon?: number[];
  spans?: AzureSpan[];
}

export interface AzureParagraph {
  content: string;
  boundingRegions?: AzureBoundingRegion[];
  spans?: AzureSpan[];
  role?: string;
}

export interface AzureDocument {
  docType?: string;
  fields?: Record<string, AzureDocumentField>;
}

export interface AzureDocumentField {
  type: string;
  valueString?: string;
  valueDate?: string;
  valueNumber?: number;
  valueCurrency?: { amount: number; currencySymbol: string };
  content?: string;
  boundingRegions?: AzureBoundingRegion[];
  confidence?: number;
  spans?: AzureSpan[];
}

// =============================================================================
// FIELD MAPPING PATTERNS
// =============================================================================

const FIELD_PATTERNS: Record<string, RegExp[]> = {
  NamedInsured: [
    /named\s*insured/i,
    /insured\s*name/i,
    /policy\s*holder/i,
    /applicant/i,
    /name\s*of\s*insured/i,
  ],
  PolicyNumber: [
    /policy\s*(number|no\.?|#)/i,
    /pol\s*(number|no\.?|#)/i,
  ],
  EffectiveDate: [
    /effective\s*date/i,
    /eff\s*date/i,
    /policy\s*effective/i,
    /inception\s*date/i,
  ],
  ExpirationDate: [
    /expiration\s*date/i,
    /exp\s*date/i,
    /policy\s*expiration/i,
    /end\s*date/i,
  ],
  CarrierName: [
    /carrier/i,
    /insurance\s*company/i,
    /insurer/i,
    /underwriter/i,
  ],
  TotalPremium: [
    /total\s*premium/i,
    /annual\s*premium/i,
    /policy\s*premium/i,
  ],
  GeneralAggregate: [
    /general\s*aggregate/i,
    /gen\s*agg/i,
  ],
  EachOccurrence: [
    /each\s*occurrence/i,
    /per\s*occurrence/i,
    /occurrence\s*limit/i,
  ],
  MailingAddress: [
    /mailing\s*address/i,
    /address/i,
    /street\s*address/i,
    /business\s*address/i,
  ],
  MailingCity: [
    /city/i,
  ],
  MailingState: [
    /state/i,
  ],
  MailingZip: [
    /zip/i,
    /postal\s*code/i,
  ],
  FEIN: [
    /fein/i,
    /federal\s*(id|ein)/i,
    /tax\s*id/i,
    /ein/i,
  ],
};

// =============================================================================
// BUILDER CLASS
// =============================================================================

export class EvidenceCatalogBuilder {
  private evidenceCounter = 0;
  private pageInfo: Map<number, { width: number; height: number }> = new Map();

  /**
   * Build evidence catalog from Azure DI response
   */
  build(azureResponse: AzureDIResponse): EvidenceCatalog {
    this.evidenceCounter = 0;
    this.pageInfo.clear();

    const entries: Record<string, EvidenceEntry> = {};
    const byPotentialField: Record<string, string[]> = {};
    const byPage: Record<number, string[]> = {};
    const bySourceType: Record<string, string[]> = {};

    // Extract page dimensions
    this.extractPageInfo(azureResponse);

    // Process key-value pairs (highest priority)
    const kvEntries = this.processKeyValuePairs(azureResponse);
    for (const entry of kvEntries) {
      entries[entry.evidenceId] = entry;
    }

    // Process tables
    const tableEntries = this.processTables(azureResponse);
    for (const entry of tableEntries) {
      entries[entry.evidenceId] = entry;
    }

    // Process document fields (prebuilt model output)
    const docEntries = this.processDocumentFields(azureResponse);
    for (const entry of docEntries) {
      entries[entry.evidenceId] = entry;
    }

    // Process paragraphs for additional context
    const paragraphEntries = this.processParagraphs(azureResponse);
    for (const entry of paragraphEntries) {
      entries[entry.evidenceId] = entry;
    }

    // Index entries
    for (const [id, entry] of Object.entries(entries)) {
      // By potential field
      for (const tag of entry.tags) {
        if (!byPotentialField[tag]) {
          byPotentialField[tag] = [];
        }
        byPotentialField[tag].push(id);
      }

      // By page
      if (!byPage[entry.pageNumber]) {
        byPage[entry.pageNumber] = [];
      }
      byPage[entry.pageNumber].push(id);

      // By source type
      if (!bySourceType[entry.sourceType]) {
        bySourceType[entry.sourceType] = [];
      }
      bySourceType[entry.sourceType].push(id);
    }

    // Calculate stats
    const stats = this.calculateStats(entries);

    return {
      entries,
      byPotentialField,
      byPage,
      bySourceType,
      stats,
    };
  }

  /**
   * Get evidence entries for a specific field
   */
  getEvidenceForField(catalog: EvidenceCatalog, fieldName: string): EvidenceEntry[] {
    const ids = catalog.byPotentialField[fieldName] || [];
    return ids.map(id => catalog.entries[id]).filter(Boolean);
  }

  /**
   * Get evidence by ID
   */
  getEvidence(catalog: EvidenceCatalog, evidenceId: string): EvidenceEntry | null {
    return catalog.entries[evidenceId] || null;
  }

  /**
   * Format evidence catalog for LLM prompt
   */
  formatForPrompt(catalog: EvidenceCatalog, options?: {
    maxEntries?: number;
    targetFields?: string[];
  }): string {
    const maxEntries = options?.maxEntries || 200;
    const targetFields = options?.targetFields;

    let entries = Object.values(catalog.entries);

    // Filter by target fields if specified
    if (targetFields && targetFields.length > 0) {
      entries = entries.filter(e =>
        e.tags.some(tag => targetFields.includes(tag))
      );
    }

    // Sort by confidence (highest first)
    entries.sort((a, b) => b.confidence - a.confidence);

    // Limit entries
    entries = entries.slice(0, maxEntries);

    // Group by page for readability
    const byPage: Record<number, EvidenceEntry[]> = {};
    for (const entry of entries) {
      if (!byPage[entry.pageNumber]) {
        byPage[entry.pageNumber] = [];
      }
      byPage[entry.pageNumber].push(entry);
    }

    const lines: string[] = [];
    lines.push('## Evidence Catalog');
    lines.push('');
    lines.push(`Total entries: ${entries.length}`);
    lines.push('');

    for (const [page, pageEntries] of Object.entries(byPage)) {
      lines.push(`### Page ${page}`);
      lines.push('');

      for (const entry of pageEntries) {
        const labelPart = entry.label ? `[${entry.label}]` : '';
        const confPart = `(${(entry.confidence * 100).toFixed(0)}%)`;
        const tagsPart = entry.tags.length > 0 ? ` {${entry.tags.join(', ')}}` : '';

        lines.push(`- **${entry.evidenceId}** ${labelPart}: "${entry.value}" ${confPart}${tagsPart}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  // Private methods

  private generateEvidenceId(): string {
    this.evidenceCounter++;
    return `E${String(this.evidenceCounter).padStart(4, '0')}`;
  }

  private extractPageInfo(response: AzureDIResponse): void {
    const pages = response.analyzeResult?.pages || [];
    for (const page of pages) {
      this.pageInfo.set(page.pageNumber, {
        width: page.width,
        height: page.height,
      });
    }
  }

  private processKeyValuePairs(response: AzureDIResponse): EvidenceEntry[] {
    const entries: EvidenceEntry[] = [];
    const kvPairs = response.analyzeResult?.keyValuePairs || [];

    for (const pair of kvPairs) {
      const keyContent = pair.key?.content?.trim();
      const valueContent = pair.value?.content?.trim();

      if (!valueContent) continue;

      const pageNumber = pair.value?.boundingRegions?.[0]?.pageNumber || 1;
      const boundingBox = this.polygonToBoundingBox(
        pair.value?.boundingRegions?.[0]?.polygon,
        pageNumber
      );

      const entry: EvidenceEntry = {
        evidenceId: this.generateEvidenceId(),
        sourceType: 'key_value',
        label: keyContent || null,
        value: valueContent,
        normalizedValue: this.normalizeValue(valueContent),
        confidence: pair.confidence || pair.value?.confidence || 0.8,
        pageNumber,
        boundingBox,
        relatedEvidenceIds: [],
        tags: this.inferFieldTags(keyContent || '', valueContent),
        spans: pair.value?.spans,
      };

      entries.push(entry);
    }

    return entries;
  }

  private processTables(response: AzureDIResponse): EvidenceEntry[] {
    const entries: EvidenceEntry[] = [];
    const tables = response.analyzeResult?.tables || [];

    for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
      const table = tables[tableIndex];

      // Build header map
      const columnHeaders: Record<number, string> = {};
      const rowHeaders: Record<number, string> = {};

      for (const cell of table.cells) {
        if (cell.kind === 'columnHeader') {
          columnHeaders[cell.columnIndex] = cell.content;
        }
        if (cell.kind === 'rowHeader') {
          rowHeaders[cell.rowIndex] = cell.content;
        }
      }

      // Process content cells
      for (const cell of table.cells) {
        if (cell.kind !== 'content') continue;
        if (!cell.content?.trim()) continue;

        const pageNumber = cell.boundingRegions?.[0]?.pageNumber || 1;
        const boundingBox = this.polygonToBoundingBox(
          cell.boundingRegions?.[0]?.polygon,
          pageNumber
        );

        const columnHeader = columnHeaders[cell.columnIndex];
        const rowHeader = rowHeaders[cell.rowIndex];

        const entry: EvidenceEntry = {
          evidenceId: this.generateEvidenceId(),
          sourceType: 'table_cell',
          label: columnHeader || rowHeader || null,
          value: cell.content.trim(),
          normalizedValue: this.normalizeValue(cell.content.trim()),
          confidence: cell.confidence || 0.85,
          pageNumber,
          boundingBox,
          tableContext: {
            tableIndex,
            rowIndex: cell.rowIndex,
            columnIndex: cell.columnIndex,
            columnHeader,
            rowHeader,
          },
          relatedEvidenceIds: [],
          tags: this.inferFieldTags(columnHeader || rowHeader || '', cell.content),
          spans: cell.spans,
        };

        entries.push(entry);
      }
    }

    return entries;
  }

  private processDocumentFields(response: AzureDIResponse): EvidenceEntry[] {
    const entries: EvidenceEntry[] = [];
    const documents = response.analyzeResult?.documents || [];

    for (const doc of documents) {
      if (!doc.fields) continue;

      for (const [fieldName, field] of Object.entries(doc.fields)) {
        let value = field.content ||
          field.valueString ||
          field.valueDate ||
          (field.valueNumber !== undefined ? String(field.valueNumber) : null) ||
          (field.valueCurrency ? `${field.valueCurrency.currencySymbol}${field.valueCurrency.amount}` : null);

        if (!value) continue;

        const pageNumber = field.boundingRegions?.[0]?.pageNumber || 1;
        const boundingBox = this.polygonToBoundingBox(
          field.boundingRegions?.[0]?.polygon,
          pageNumber
        );

        const entry: EvidenceEntry = {
          evidenceId: this.generateEvidenceId(),
          sourceType: 'layout_element',
          label: fieldName,
          value: String(value),
          normalizedValue: this.normalizeValue(String(value)),
          confidence: field.confidence || 0.9,
          pageNumber,
          boundingBox,
          relatedEvidenceIds: [],
          tags: this.inferFieldTags(fieldName, String(value)),
          spans: field.spans,
        };

        entries.push(entry);
      }
    }

    return entries;
  }

  private processParagraphs(response: AzureDIResponse): EvidenceEntry[] {
    const entries: EvidenceEntry[] = [];
    const paragraphs = response.analyzeResult?.paragraphs || [];

    // Only process paragraphs with special roles
    for (const para of paragraphs) {
      if (!para.role || para.role === 'content') continue;
      if (!para.content?.trim()) continue;

      const pageNumber = para.boundingRegions?.[0]?.pageNumber || 1;
      const boundingBox = this.polygonToBoundingBox(
        para.boundingRegions?.[0]?.polygon,
        pageNumber
      );

      const entry: EvidenceEntry = {
        evidenceId: this.generateEvidenceId(),
        sourceType: 'text_span',
        label: para.role,
        value: para.content.trim(),
        normalizedValue: this.normalizeValue(para.content.trim()),
        confidence: 0.75, // Paragraphs have lower confidence
        pageNumber,
        boundingBox,
        relatedEvidenceIds: [],
        tags: this.inferFieldTags(para.role, para.content),
        spans: para.spans,
      };

      entries.push(entry);
    }

    return entries;
  }

  private polygonToBoundingBox(
    polygon: number[] | undefined,
    pageNumber: number
  ): BoundingBox | null {
    if (!polygon || polygon.length < 8) return null;

    const pageInfo = this.pageInfo.get(pageNumber);
    if (!pageInfo) return null;

    // Polygon is [x1, y1, x2, y2, x3, y3, x4, y4]
    const xs = [polygon[0], polygon[2], polygon[4], polygon[6]];
    const ys = [polygon[1], polygon[3], polygon[5], polygon[7]];

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      pageWidth: pageInfo.width,
      pageHeight: pageInfo.height,
    };
  }

  private normalizeValue(value: string): string {
    let normalized = value.trim();

    // Remove excessive whitespace
    normalized = normalized.replace(/\s+/g, ' ');

    // Normalize common patterns
    // Phone numbers
    normalized = normalized.replace(/\((\d{3})\)\s*(\d{3})[-.]?(\d{4})/, '$1-$2-$3');

    // Dates - convert common formats to YYYY-MM-DD
    const dateMatch = normalized.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dateMatch) {
      const month = dateMatch[1].padStart(2, '0');
      const day = dateMatch[2].padStart(2, '0');
      let year = dateMatch[3];
      if (year.length === 2) {
        year = (parseInt(year) > 50 ? '19' : '20') + year;
      }
      normalized = `${year}-${month}-${day}`;
    }

    // Currency - normalize to number
    if (/^\$[\d,]+\.?\d*$/.test(normalized)) {
      normalized = normalized.replace(/[$,]/g, '');
    }

    return normalized;
  }

  private inferFieldTags(label: string, value: string): string[] {
    const tags: string[] = [];
    const combinedText = `${label} ${value}`.toLowerCase();

    for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(label)) {
          tags.push(fieldName);
          break;
        }
      }
    }

    // Value-based inference
    // Check for date patterns
    if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(value)) {
      if (!tags.includes('EffectiveDate') && !tags.includes('ExpirationDate')) {
        tags.push('Date');
      }
    }

    // Check for currency patterns
    if (/^\$[\d,]+\.?\d*$/.test(value)) {
      if (!tags.some(t => ['TotalPremium', 'GeneralAggregate', 'EachOccurrence'].includes(t))) {
        tags.push('Currency');
      }
    }

    // Check for policy number patterns
    if (/^[A-Z]{2,4}[\d-]+$/.test(value) && !tags.includes('PolicyNumber')) {
      tags.push('PolicyNumber');
    }

    // Check for EIN/FEIN patterns
    if (/^\d{2}-\d{7}$/.test(value)) {
      tags.push('FEIN');
    }

    return Array.from(new Set(tags));
  }

  private calculateStats(entries: Record<string, EvidenceEntry>): CatalogStats {
    const entryList = Object.values(entries);
    const bySourceType: Record<string, number> = {};
    const pages = new Set<number>();
    let totalConfidence = 0;

    for (const entry of entryList) {
      bySourceType[entry.sourceType] = (bySourceType[entry.sourceType] || 0) + 1;
      pages.add(entry.pageNumber);
      totalConfidence += entry.confidence;
    }

    return {
      totalEntries: entryList.length,
      bySourceType,
      avgConfidence: entryList.length > 0 ? totalConfidence / entryList.length : 0,
      pageCount: pages.size,
    };
  }
}

// Export singleton
export const evidenceCatalogBuilder = new EvidenceCatalogBuilder();
