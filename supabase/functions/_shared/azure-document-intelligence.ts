/**
 * Shared Azure Document Intelligence Utilities
 * 
 * Centralized functions for OCR and evidence catalog building
 * used across all extraction pipelines.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface EvidenceEntry {
  evidenceId: string;
  sourceType: 'key_value' | 'table_cell' | 'text_span' | 'layout_element';
  label: string | null;
  value: string;
  normalizedValue: string;
  confidence: number;
  pageNumber: number;
  boundingBox: BoundingBox | null;
  tableContext?: TableContext;
  tags: string[];
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

export interface EvidenceCatalog {
  entries: Record<string, EvidenceEntry>;
  byField: Record<string, string[]>;
  stats: {
    totalEntries: number;
    avgConfidence: number;
    pageCount: number;
    kvPairCount: number;
    tableCount: number;
  };
  rawText?: string;
}

export interface AzureAnalyzeResult {
  pages?: Array<{
    pageNumber: number;
    width: number;
    height: number;
    words?: Array<{
      content: string;
      polygon?: number[];
      confidence?: number;
    }>;
  }>;
  keyValuePairs?: Array<{
    key?: { content?: string; boundingRegions?: Array<{ pageNumber: number; polygon?: number[] }> };
    value?: { content?: string; boundingRegions?: Array<{ pageNumber: number; polygon?: number[] }> };
    confidence?: number;
  }>;
  tables?: Array<{
    rowCount: number;
    columnCount: number;
    cells: Array<{
      kind: string;
      rowIndex: number;
      columnIndex: number;
      content: string;
      boundingRegions?: Array<{ pageNumber: number; polygon?: number[] }>;
      confidence?: number;
    }>;
  }>;
  content?: string;
}

// =============================================================================
// AZURE DOCUMENT INTELLIGENCE API
// =============================================================================

export async function callAzureDocumentIntelligence(
  documentSource: string | ArrayBuffer,
  azureEndpoint: string,
  azureKey: string,
  modelId: string = 'prebuilt-document',
  options?: {
    pages?: string; // e.g., "1-" for all pages
    locale?: string;
    timeoutMs?: number;
  }
): Promise<AzureAnalyzeResult> {
  const { pages = '1-', timeoutMs = 120000 } = options || {};
  
  // Clean endpoint
  const cleanEndpoint = azureEndpoint.replace(/\/$/, '');
  const analyzeUrl = `${cleanEndpoint}/documentintelligence/documentModels/${modelId}:analyze?api-version=2024-02-29-preview&pages=${pages}`;

  let requestBody: any;
  let contentType: string;

  if (typeof documentSource === 'string') {
    // URL-based analysis
    requestBody = JSON.stringify({ urlSource: documentSource });
    contentType = 'application/json';
  } else {
    // Base64-based analysis
    const base64 = btoa(String.fromCharCode(...new Uint8Array(documentSource)));
    requestBody = JSON.stringify({ base64Source: base64 });
    contentType = 'application/json';
  }

  // Start analysis
  const analyzeResponse = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'Ocp-Apim-Subscription-Key': azureKey,
    },
    body: requestBody,
  });

  if (!analyzeResponse.ok) {
    const error = await analyzeResponse.text();
    throw new Error(`Azure DI analyze failed (${analyzeResponse.status}): ${error}`);
  }

  // Get operation location for polling
  const operationLocation = analyzeResponse.headers.get('Operation-Location');
  if (!operationLocation) {
    throw new Error('No operation location returned from Azure DI');
  }

  // Poll for results with timeout
  const startTime = Date.now();
  const pollInterval = 2000;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const statusResponse = await fetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': azureKey },
    });

    const statusData = await statusResponse.json();

    if (statusData.status === 'succeeded') {
      console.log(`[Azure DI] Analysis completed in ${Date.now() - startTime}ms`);
      return statusData.analyzeResult;
    } else if (statusData.status === 'failed') {
      throw new Error(`Azure DI analysis failed: ${statusData.error?.message || 'Unknown error'}`);
    }

    console.log(`[Azure DI] Status: ${statusData.status}, elapsed: ${Date.now() - startTime}ms`);
  }

  throw new Error(`Azure DI analysis timed out after ${timeoutMs}ms`);
}

// =============================================================================
// EVIDENCE CATALOG BUILDER
// =============================================================================

export function buildEvidenceCatalog(
  azureResult: AzureAnalyzeResult,
  fieldPatterns?: Record<string, RegExp[]>
): EvidenceCatalog {
  const entries: Record<string, EvidenceEntry> = {};
  let evidenceCounter = 0;
  const pageInfo: Map<number, { width: number; height: number }> = new Map();
  const byField: Record<string, string[]> = {};

  // Extract page dimensions
  for (const page of azureResult.pages || []) {
    pageInfo.set(page.pageNumber, { width: page.width, height: page.height });
  }

  const generateId = () => {
    evidenceCounter++;
    return `ev_${String(evidenceCounter).padStart(4, '0')}`;
  };

  const polygonToBbox = (polygon: number[] | undefined, pageNum: number): BoundingBox | null => {
    if (!polygon || polygon.length < 8) return null;
    const info = pageInfo.get(pageNum);
    if (!info) return null;

    const xs = [polygon[0], polygon[2], polygon[4], polygon[6]];
    const ys = [polygon[1], polygon[3], polygon[5], polygon[7]];
    
    return {
      x: Math.min(...xs) / info.width,
      y: Math.min(...ys) / info.height,
      width: (Math.max(...xs) - Math.min(...xs)) / info.width,
      height: (Math.max(...ys) - Math.min(...ys)) / info.height,
      pageWidth: info.width,
      pageHeight: info.height,
    };
  };

  const inferTags = (label: string, value: string): string[] => {
    if (!fieldPatterns) return [];
    
    const tags: string[] = [];
    for (const [fieldName, patterns] of Object.entries(fieldPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(label) || pattern.test(value)) {
          tags.push(fieldName);
          break;
        }
      }
    }
    return tags;
  };

  const addToByField = (tags: string[], evidenceId: string) => {
    for (const tag of tags) {
      if (!byField[tag]) byField[tag] = [];
      byField[tag].push(evidenceId);
    }
  };

  // Process key-value pairs
  let kvCount = 0;
  for (const kv of azureResult.keyValuePairs || []) {
    const key = kv.key?.content?.trim();
    const value = kv.value?.content?.trim();
    if (!value) continue;

    const pageNum = kv.value?.boundingRegions?.[0]?.pageNumber || 1;
    const id = generateId();
    const tags = inferTags(key || '', value);

    entries[id] = {
      evidenceId: id,
      sourceType: 'key_value',
      label: key || null,
      value,
      normalizedValue: value,
      confidence: kv.confidence || 0.8,
      pageNumber: pageNum,
      boundingBox: polygonToBbox(kv.value?.boundingRegions?.[0]?.polygon, pageNum),
      tags,
    };

    addToByField(tags, id);
    kvCount++;
  }

  // Process tables
  let tableCount = 0;
  for (const [tableIdx, table] of (azureResult.tables || []).entries()) {
    const headerRow: Record<number, string> = {};
    const headerCol: Record<number, string> = {};

    // Find headers
    for (const cell of table.cells) {
      if (cell.kind === 'columnHeader') {
        headerRow[cell.columnIndex] = cell.content;
      } else if (cell.kind === 'rowHeader') {
        headerCol[cell.rowIndex] = cell.content;
      }
    }

    // Process content cells
    for (const cell of table.cells) {
      if (cell.kind === 'columnHeader' || cell.kind === 'rowHeader') continue;
      if (!cell.content?.trim()) continue;

      const pageNum = cell.boundingRegions?.[0]?.pageNumber || 1;
      const id = generateId();
      
      const contextLabel = [
        headerRow[cell.columnIndex],
        headerCol[cell.rowIndex],
      ].filter(Boolean).join(' | ');

      const tags = inferTags(contextLabel, cell.content);

      entries[id] = {
        evidenceId: id,
        sourceType: 'table_cell',
        label: contextLabel || null,
        value: cell.content,
        normalizedValue: cell.content,
        confidence: cell.confidence || 0.85,
        pageNumber: pageNum,
        boundingBox: polygonToBbox(cell.boundingRegions?.[0]?.polygon, pageNum),
        tableContext: {
          tableIndex: tableIdx,
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex,
          columnHeader: headerRow[cell.columnIndex],
          rowHeader: headerCol[cell.rowIndex],
        },
        tags,
      };

      addToByField(tags, id);
    }

    tableCount++;
  }

  // Calculate stats
  const allConfidences = Object.values(entries).map((e) => e.confidence);
  const avgConfidence = allConfidences.length > 0
    ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
    : 0;

  return {
    entries,
    byField,
    stats: {
      totalEntries: Object.keys(entries).length,
      avgConfidence,
      pageCount: pageInfo.size,
      kvPairCount: kvCount,
      tableCount,
    },
    rawText: azureResult.content,
  };
}

// =============================================================================
// CHUNKING FOR VECTOR SEARCH
// =============================================================================

export interface DocumentChunk {
  content: string;
  pageIndex: number;
  chunkIndex: number;
  evidenceIds: string[];
  metadata?: Record<string, any>;
}

export function chunkDocument(
  catalog: EvidenceCatalog,
  options?: {
    maxChunkSize?: number;
    overlapSize?: number;
  }
): DocumentChunk[] {
  const { maxChunkSize = 1000, overlapSize = 100 } = options || {};
  const chunks: DocumentChunk[] = [];

  // Group entries by page
  const entriesByPage: Map<number, EvidenceEntry[]> = new Map();
  for (const entry of Object.values(catalog.entries)) {
    const pageEntries = entriesByPage.get(entry.pageNumber) || [];
    pageEntries.push(entry);
    entriesByPage.set(entry.pageNumber, pageEntries);
  }

  let chunkIndex = 0;

  for (const [pageNum, entries] of entriesByPage) {
    // Sort by y position for reading order
    entries.sort((a, b) => {
      const aY = a.boundingBox?.y || 0;
      const bY = b.boundingBox?.y || 0;
      return aY - bY;
    });

    let currentChunk = '';
    let currentEvidenceIds: string[] = [];

    for (const entry of entries) {
      const text = entry.label
        ? `${entry.label}: ${entry.value}`
        : entry.value;

      if (currentChunk.length + text.length > maxChunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          content: currentChunk.trim(),
          pageIndex: pageNum - 1, // 0-indexed
          chunkIndex,
          evidenceIds: currentEvidenceIds,
        });
        chunkIndex++;

        // Start new chunk with overlap
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(overlapSize / 5));
        currentChunk = overlapWords.join(' ') + '\n';
        currentEvidenceIds = [];
      }

      currentChunk += text + '\n';
      currentEvidenceIds.push(entry.evidenceId);
    }

    // Save remaining chunk
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        pageIndex: pageNum - 1,
        chunkIndex,
        evidenceIds: currentEvidenceIds,
      });
      chunkIndex++;
    }
  }

  return chunks;
}

// =============================================================================
// FIELD PATTERNS (Common Insurance)
// =============================================================================

export const COMMON_INSURANCE_PATTERNS: Record<string, RegExp[]> = {
  PolicyNumber: [/policy.*number/i, /policy.*no/i, /pol.*#/i],
  EffectiveDate: [/effective.*date/i, /eff.*date/i, /inception/i],
  ExpirationDate: [/expiration.*date/i, /exp.*date/i, /expiry/i],
  NamedInsured: [/named.*insured/i, /insured.*name/i, /policyholder/i],
  Carrier: [/carrier/i, /company.*name/i, /insurer/i],
  Premium: [/premium/i, /total.*amount/i, /amount.*due/i],
  Agent: [/agent/i, /producer/i, /broker/i],
  Limit: [/limit/i, /coverage.*amount/i],
  Deductible: [/deductible/i, /ded\.?/i],
  BILimit: [/bodily.*injury/i, /bi.*limit/i],
  PDLimit: [/property.*damage/i, /pd.*limit/i],
  Comprehensive: [/comprehensive/i, /comp/i],
  Collision: [/collision/i, /coll/i],
  UMLimit: [/uninsured.*motorist/i, /um.*limit/i],
  VIN: [/vin/i, /vehicle.*identification/i],
  LicenseNumber: [/license/i, /tag/i, /plate/i],
};

