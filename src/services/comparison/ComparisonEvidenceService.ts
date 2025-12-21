/**
 * Comparison Evidence Service
 *
 * Manages evidence catalogs for coverage comparison with:
 * - Stable hash-based evidence IDs for deduplication
 * - Integration with Azure Document Intelligence
 * - Database persistence in comparison_evidence_catalog table
 *
 * Reuses EvidenceCatalogBuilder from ACORD extraction system
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  EvidenceCatalogBuilder,
  EvidenceCatalog,
  EvidenceEntry,
  AzureDIResponse,
  BoundingBox,
} from '@/services/extraction/EvidenceCatalogBuilder';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Stable evidence ID format: hash of (doc_id + page + bbox + snippet)
 */
export interface StableEvidenceId {
  id: string; // SHA-256 hash truncated to 16 chars
  documentId: string;
  pageNumber: number;
  bboxSignature: string; // x,y,w,h rounded
  snippetHash: string; // First 8 chars of snippet hash
}

/**
 * Extended evidence entry with stable ID
 */
export interface ComparisonEvidenceEntry extends Omit<EvidenceEntry, 'evidenceId'> {
  evidenceId: string; // Stable hash-based ID
  stableIdComponents: StableEvidenceId;
  documentId: string;
  docRole: 'A' | 'B';
  isDuplicate: boolean;
  duplicateOf?: string; // Original evidence ID if this is a duplicate
}

/**
 * Comparison evidence catalog with deduplication
 */
export interface ComparisonEvidenceCatalog {
  workspaceId: string;
  documentId: string;
  docRole: 'A' | 'B';

  // All evidence entries indexed by stable ID
  entries: Record<string, ComparisonEvidenceEntry>;

  // Deduplication info
  originalCount: number;
  deduplicatedCount: number;
  duplicatesRemoved: number;

  // Index by potential field (for LLM prompt building)
  byPotentialField: Record<string, string[]>;

  // Azure raw response for debugging
  azureRawResponse?: AzureDIResponse;

  // Overall confidence
  azureConfidenceScore: number;

  // Metadata
  createdAt: string;
  processingTimeMs: number;
}

/**
 * Database row for comparison_evidence_catalog
 */
export interface ComparisonEvidenceCatalogRow {
  id: string;
  workspace_id: string;
  workspace_document_id: string;
  doc_role: 'A' | 'B';
  evidence_entries: Record<string, ComparisonEvidenceEntry>;
  evidence_by_potential_field: Record<string, string[]>;
  azure_raw_response: AzureDIResponse | null;
  azure_confidence_score: number;
  original_count: number;
  deduplicated_count: number;
  processing_time_ms: number;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class ComparisonEvidenceService {
  private supabase: SupabaseClient;
  private catalogBuilder: EvidenceCatalogBuilder;

  constructor(supabaseClient?: SupabaseClient) {
    this.supabase = supabaseClient || createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
    this.catalogBuilder = new EvidenceCatalogBuilder();
  }

  // ===========================================================================
  // EVIDENCE CATALOG BUILDING
  // ===========================================================================

  /**
   * Build evidence catalog from Azure DI response with stable IDs
   */
  async buildCatalog(
    workspaceId: string,
    documentId: string,
    docRole: 'A' | 'B',
    azureResponse: AzureDIResponse,
    options?: {
      storeRawResponse?: boolean;
      deduplicateAcrossPages?: boolean;
    }
  ): Promise<ComparisonEvidenceCatalog> {
    const startTime = Date.now();

    // Use existing builder to parse Azure response
    const baseCatalog = this.catalogBuilder.build(azureResponse);

    // Convert to comparison entries with stable IDs
    const entries: Record<string, ComparisonEvidenceEntry> = {};
    const seenHashes = new Map<string, string>(); // hash -> original ID

    for (const [_originalId, entry] of Object.entries(baseCatalog.entries)) {
      // Generate stable ID
      const stableIdComponents = this.generateStableId(documentId, entry);
      const stableId = stableIdComponents.id;

      // Check for duplicates
      const contentHash = this.hashContent(entry.value, entry.pageNumber);
      const isDuplicate = seenHashes.has(contentHash);
      const duplicateOf = isDuplicate ? seenHashes.get(contentHash) : undefined;

      if (!isDuplicate) {
        seenHashes.set(contentHash, stableId);
      }

      const comparisonEntry: ComparisonEvidenceEntry = {
        ...entry,
        evidenceId: stableId,
        stableIdComponents,
        documentId,
        docRole,
        isDuplicate,
        duplicateOf,
      };

      entries[stableId] = comparisonEntry;
    }

    // Filter out duplicates if requested
    const deduplicatedEntries = options?.deduplicateAcrossPages !== false
      ? Object.fromEntries(
          Object.entries(entries).filter(([_, e]) => !e.isDuplicate)
        )
      : entries;

    // Rebuild index for deduplicated entries
    const byPotentialField: Record<string, string[]> = {};
    for (const [id, entry] of Object.entries(deduplicatedEntries)) {
      for (const tag of entry.tags) {
        if (!byPotentialField[tag]) {
          byPotentialField[tag] = [];
        }
        byPotentialField[tag].push(id);
      }
    }

    const processingTimeMs = Date.now() - startTime;

    return {
      workspaceId,
      documentId,
      docRole,
      entries: deduplicatedEntries,
      originalCount: Object.keys(entries).length,
      deduplicatedCount: Object.keys(deduplicatedEntries).length,
      duplicatesRemoved: Object.keys(entries).length - Object.keys(deduplicatedEntries).length,
      byPotentialField,
      azureRawResponse: options?.storeRawResponse ? azureResponse : undefined,
      azureConfidenceScore: baseCatalog.stats.avgConfidence,
      createdAt: new Date().toISOString(),
      processingTimeMs,
    };
  }

  // ===========================================================================
  // STABLE ID GENERATION
  // ===========================================================================

  /**
   * Generate stable hash-based evidence ID
   * Format: DOCID_PAGE_BBOX_HASH (16 chars total)
   */
  private generateStableId(documentId: string, entry: EvidenceEntry): StableEvidenceId {
    // Build bbox signature (rounded to nearest 10 for stability)
    const bboxSignature = entry.boundingBox
      ? `${Math.round(entry.boundingBox.x / 10) * 10},${Math.round(entry.boundingBox.y / 10) * 10},${Math.round(entry.boundingBox.width / 10) * 10},${Math.round(entry.boundingBox.height / 10) * 10}`
      : 'nobbox';

    // Hash the snippet (first 100 chars)
    const snippetHash = this.hashString(entry.value.substring(0, 100)).substring(0, 8);

    // Build the composite string to hash
    const composite = `${documentId}|${entry.pageNumber}|${bboxSignature}|${snippetHash}`;

    // Generate final ID (16 chars)
    const id = `E${this.hashString(composite).substring(0, 15).toUpperCase()}`;

    return {
      id,
      documentId,
      pageNumber: entry.pageNumber,
      bboxSignature,
      snippetHash,
    };
  }

  /**
   * Hash content for deduplication
   */
  private hashContent(value: string, pageNumber: number): string {
    const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
    return this.hashString(`${normalized}|${pageNumber}`);
  }

  /**
   * Simple string hash (djb2 algorithm)
   */
  private hashString(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  // ===========================================================================
  // DATABASE OPERATIONS
  // ===========================================================================

  /**
   * Save evidence catalog to database
   */
  async saveCatalog(catalog: ComparisonEvidenceCatalog): Promise<string> {
    const row: Omit<ComparisonEvidenceCatalogRow, 'id' | 'created_at' | 'updated_at'> = {
      workspace_id: catalog.workspaceId,
      workspace_document_id: catalog.documentId,
      doc_role: catalog.docRole,
      evidence_entries: catalog.entries,
      evidence_by_potential_field: catalog.byPotentialField,
      azure_raw_response: catalog.azureRawResponse || null,
      azure_confidence_score: catalog.azureConfidenceScore,
      original_count: catalog.originalCount,
      deduplicated_count: catalog.deduplicatedCount,
      processing_time_ms: catalog.processingTimeMs,
    };

    const { data, error } = await this.supabase
      .from('comparison_evidence_catalog')
      .upsert(row, {
        onConflict: 'workspace_document_id',
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to save evidence catalog: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Load evidence catalog from database
   */
  async loadCatalog(documentId: string): Promise<ComparisonEvidenceCatalog | null> {
    const { data, error } = await this.supabase
      .from('comparison_evidence_catalog')
      .select('*')
      .eq('workspace_document_id', documentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to load evidence catalog: ${error.message}`);
    }

    const row = data as ComparisonEvidenceCatalogRow;

    return {
      workspaceId: row.workspace_id,
      documentId: row.workspace_document_id,
      docRole: row.doc_role,
      entries: row.evidence_entries,
      originalCount: row.original_count,
      deduplicatedCount: row.deduplicated_count,
      duplicatesRemoved: row.original_count - row.deduplicated_count,
      byPotentialField: row.evidence_by_potential_field,
      azureRawResponse: row.azure_raw_response || undefined,
      azureConfidenceScore: row.azure_confidence_score,
      createdAt: row.created_at,
      processingTimeMs: row.processing_time_ms,
    };
  }

  /**
   * Load both catalogs for a workspace comparison
   */
  async loadCatalogsForWorkspace(workspaceId: string): Promise<{
    catalogA: ComparisonEvidenceCatalog | null;
    catalogB: ComparisonEvidenceCatalog | null;
  }> {
    const { data, error } = await this.supabase
      .from('comparison_evidence_catalog')
      .select('*')
      .eq('workspace_id', workspaceId);

    if (error) {
      throw new Error(`Failed to load catalogs for workspace: ${error.message}`);
    }

    const rows = (data || []) as ComparisonEvidenceCatalogRow[];

    let catalogA: ComparisonEvidenceCatalog | null = null;
    let catalogB: ComparisonEvidenceCatalog | null = null;

    for (const row of rows) {
      const catalog: ComparisonEvidenceCatalog = {
        workspaceId: row.workspace_id,
        documentId: row.workspace_document_id,
        docRole: row.doc_role,
        entries: row.evidence_entries,
        originalCount: row.original_count,
        deduplicatedCount: row.deduplicated_count,
        duplicatesRemoved: row.original_count - row.deduplicated_count,
        byPotentialField: row.evidence_by_potential_field,
        azureRawResponse: row.azure_raw_response || undefined,
        azureConfidenceScore: row.azure_confidence_score,
        createdAt: row.created_at,
        processingTimeMs: row.processing_time_ms,
      };

      if (row.doc_role === 'A') {
        catalogA = catalog;
      } else if (row.doc_role === 'B') {
        catalogB = catalog;
      }
    }

    return { catalogA, catalogB };
  }

  // ===========================================================================
  // EVIDENCE RETRIEVAL
  // ===========================================================================

  /**
   * Get evidence by ID
   */
  getEvidence(
    catalog: ComparisonEvidenceCatalog,
    evidenceId: string
  ): ComparisonEvidenceEntry | null {
    return catalog.entries[evidenceId] || null;
  }

  /**
   * Get multiple evidence entries by IDs
   */
  getEvidenceMultiple(
    catalog: ComparisonEvidenceCatalog,
    evidenceIds: string[]
  ): ComparisonEvidenceEntry[] {
    return evidenceIds
      .map(id => catalog.entries[id])
      .filter(Boolean);
  }

  /**
   * Get evidence for a specific field
   */
  getEvidenceForField(
    catalog: ComparisonEvidenceCatalog,
    fieldName: string
  ): ComparisonEvidenceEntry[] {
    const ids = catalog.byPotentialField[fieldName] || [];
    return this.getEvidenceMultiple(catalog, ids);
  }

  /**
   * Get all evidence for a page
   */
  getEvidenceForPage(
    catalog: ComparisonEvidenceCatalog,
    pageNumber: number
  ): ComparisonEvidenceEntry[] {
    return Object.values(catalog.entries)
      .filter(e => e.pageNumber === pageNumber);
  }

  // ===========================================================================
  // PROMPT BUILDING HELPERS
  // ===========================================================================

  /**
   * Format evidence catalog for LLM prompt
   * Returns a structured string with evidence IDs, values, and confidence
   */
  formatForPrompt(
    catalog: ComparisonEvidenceCatalog,
    options?: {
      maxEntries?: number;
      targetFields?: string[];
      minConfidence?: number;
    }
  ): string {
    const maxEntries = options?.maxEntries || 150;
    const targetFields = options?.targetFields;
    const minConfidence = options?.minConfidence || 0;

    let entries = Object.values(catalog.entries);

    // Filter by target fields if specified
    if (targetFields && targetFields.length > 0) {
      entries = entries.filter(e =>
        e.tags.some(tag => targetFields.includes(tag))
      );
    }

    // Filter by confidence
    if (minConfidence > 0) {
      entries = entries.filter(e => e.confidence >= minConfidence);
    }

    // Sort by confidence (highest first)
    entries.sort((a, b) => b.confidence - a.confidence);

    // Limit entries
    entries = entries.slice(0, maxEntries);

    // Group by page
    const byPage: Record<number, ComparisonEvidenceEntry[]> = {};
    for (const entry of entries) {
      if (!byPage[entry.pageNumber]) {
        byPage[entry.pageNumber] = [];
      }
      byPage[entry.pageNumber].push(entry);
    }

    // Build prompt text
    const lines: string[] = [];
    lines.push(`## Evidence Catalog (Document ${catalog.docRole})`);
    lines.push('');
    lines.push(`Total entries: ${entries.length} (of ${catalog.deduplicatedCount} deduplicated)`);
    lines.push(`Average confidence: ${(catalog.azureConfidenceScore * 100).toFixed(1)}%`);
    lines.push('');

    for (const pageNum of Object.keys(byPage).map(Number).sort((a, b) => a - b)) {
      const pageEntries = byPage[pageNum];
      lines.push(`### Page ${pageNum}`);
      lines.push('');

      for (const entry of pageEntries) {
        const labelPart = entry.label ? `[${entry.label}]` : '';
        const confPart = `(${(entry.confidence * 100).toFixed(0)}%)`;
        const tagsPart = entry.tags.length > 0 ? ` {${entry.tags.join(', ')}}` : '';
        const valueTrunc = entry.value.length > 80
          ? entry.value.substring(0, 80) + '...'
          : entry.value;

        lines.push(`- **${entry.evidenceId}** ${labelPart}: "${valueTrunc}" ${confPart}${tagsPart}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Build evidence index for Q&A retrieval
   * Returns a map of keywords -> evidence IDs
   */
  buildKeywordIndex(
    catalog: ComparisonEvidenceCatalog
  ): Map<string, Set<string>> {
    const index = new Map<string, Set<string>>();

    for (const entry of Object.values(catalog.entries)) {
      // Extract keywords from value
      const words = entry.value
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2);

      for (const word of words) {
        if (!index.has(word)) {
          index.set(word, new Set());
        }
        index.get(word)!.add(entry.evidenceId);
      }

      // Add label keywords
      if (entry.label) {
        const labelWords = entry.label
          .toLowerCase()
          .split(/\s+/)
          .filter(w => w.length > 2);

        for (const word of labelWords) {
          if (!index.has(word)) {
            index.set(word, new Set());
          }
          index.get(word)!.add(entry.evidenceId);
        }
      }

      // Add tags as keywords
      for (const tag of entry.tags) {
        const tagLower = tag.toLowerCase();
        if (!index.has(tagLower)) {
          index.set(tagLower, new Set());
        }
        index.get(tagLower)!.add(entry.evidenceId);
      }
    }

    return index;
  }

  /**
   * Search evidence by keywords (for Q&A)
   */
  searchEvidence(
    catalog: ComparisonEvidenceCatalog,
    query: string,
    limit: number = 10
  ): ComparisonEvidenceEntry[] {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2);

    if (keywords.length === 0) {
      return [];
    }

    // Build keyword index
    const index = this.buildKeywordIndex(catalog);

    // Score each evidence entry by keyword matches
    const scores = new Map<string, number>();

    for (const keyword of keywords) {
      const matches = index.get(keyword);
      if (matches) {
        for (const evidenceId of matches) {
          scores.set(evidenceId, (scores.get(evidenceId) || 0) + 1);
        }
      }
    }

    // Sort by score and return top results
    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => catalog.entries[id])
      .filter(Boolean);

    return sorted;
  }

  // ===========================================================================
  // CROSS-DOCUMENT OPERATIONS
  // ===========================================================================

  /**
   * Find matching evidence between two catalogs
   * Useful for linking differences to both documents
   */
  findMatchingEvidence(
    catalogA: ComparisonEvidenceCatalog,
    catalogB: ComparisonEvidenceCatalog,
    fieldName: string
  ): {
    evidenceA: ComparisonEvidenceEntry[];
    evidenceB: ComparisonEvidenceEntry[];
  } {
    return {
      evidenceA: this.getEvidenceForField(catalogA, fieldName),
      evidenceB: this.getEvidenceForField(catalogB, fieldName),
    };
  }

  /**
   * Build combined evidence context for comparison summary
   */
  buildComparisonContext(
    catalogA: ComparisonEvidenceCatalog,
    catalogB: ComparisonEvidenceCatalog,
    fieldNames: string[]
  ): {
    docAEvidence: Record<string, ComparisonEvidenceEntry[]>;
    docBEvidence: Record<string, ComparisonEvidenceEntry[]>;
    totalEvidenceCount: number;
  } {
    const docAEvidence: Record<string, ComparisonEvidenceEntry[]> = {};
    const docBEvidence: Record<string, ComparisonEvidenceEntry[]> = {};
    let totalEvidenceCount = 0;

    for (const fieldName of fieldNames) {
      const { evidenceA, evidenceB } = this.findMatchingEvidence(
        catalogA,
        catalogB,
        fieldName
      );

      if (evidenceA.length > 0) {
        docAEvidence[fieldName] = evidenceA;
        totalEvidenceCount += evidenceA.length;
      }

      if (evidenceB.length > 0) {
        docBEvidence[fieldName] = evidenceB;
        totalEvidenceCount += evidenceB.length;
      }
    }

    return {
      docAEvidence,
      docBEvidence,
      totalEvidenceCount,
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const comparisonEvidenceService = new ComparisonEvidenceService();
