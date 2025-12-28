/**
 * Draft Manager Service
 *
 * Auto-save/draft functionality for ACORD forms:
 * - Debounced autosave on change
 * - Local persistence (IndexedDB) for offline
 * - Server sync when online
 * - Conflict resolution
 * - Draft restoration
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export type FieldStatus = 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'NEEDS_VERIFICATION' | 'NOT_FOUND' | 'CONFLICT' | 'CRM_PREFILL' | 'USER_ENTERED';

export interface DraftField {
  value: string | null;
  status: FieldStatus;
  evidenceIds?: string[];
  confidence?: number;
  source?: 'extraction' | 'crm' | 'user' | 'prefill';
  lastModified?: string;
  modifiedBy?: string;
}

export interface Draft {
  id: string;
  acordFormId: string;
  schemaHash: string;
  importJobId?: string;
  extractionId?: string;
  fields: Record<string, DraftField>;
  lastSavedAt: string;
  lastSavedBy: string;
  deviceId: string;
  syncState: 'LOCAL_ONLY' | 'SYNCED' | 'CONFLICT' | 'SYNCING';
  version: number;
  serverVersion?: number;
}

export interface DraftConflict {
  field: string;
  localValue: string | null;
  serverValue: string | null;
  localModified: string;
  serverModified: string;
}

const DB_NAME = 'insureflow_drafts';
const STORE_NAME = 'drafts';
const DEBOUNCE_MS = 750;

class DraftManagerService {
  private deviceId: string;
  private saveTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private onChangeCallbacks: Map<string, Set<(draft: Draft) => void>> = new Map();

  constructor() {
    this.deviceId = this.getOrCreateDeviceId();
    this.initDatabase();
  }

  private getOrCreateDeviceId(): string {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('device_id', deviceId);
    }
    return deviceId;
  }

  private async initDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('acordFormId', 'acordFormId', { unique: false });
          store.createIndex('syncState', 'syncState', { unique: false });
          store.createIndex('lastSavedAt', 'lastSavedAt', { unique: false });
        }
      };
    });
  }

  /**
   * Create or get existing draft for an ACORD form
   */
  async getOrCreateDraft(
    acordFormId: string,
    schemaHash: string,
    options?: {
      importJobId?: string;
      extractionId?: string;
      initialFields?: Record<string, DraftField>;
    }
  ): Promise<Draft> {
    // Check local first
    let draft = await this.getLocalDraft(acordFormId);

    // Check server for newer version
    if (navigator.onLine) {
      const serverDraft = await this.getServerDraft(acordFormId);

      if (draft && serverDraft) {
        // Conflict resolution
        if (serverDraft.version > (draft.serverVersion || 0)) {
          if (draft.syncState === 'LOCAL_ONLY') {
            // Local changes exist, mark conflict
            draft.syncState = 'CONFLICT';
            draft.serverVersion = serverDraft.version;
          } else {
            // No local changes, use server version
            draft = this.mergeServerDraft(draft, serverDraft);
          }
        }
      } else if (serverDraft && !draft) {
        draft = serverDraft;
        draft.syncState = 'SYNCED';
      }
    }

    if (!draft) {
      // Create new draft
      draft = {
        id: crypto.randomUUID(),
        acordFormId,
        schemaHash,
        importJobId: options?.importJobId,
        extractionId: options?.extractionId,
        fields: options?.initialFields || {},
        lastSavedAt: new Date().toISOString(),
        lastSavedBy: await this.getCurrentUserId(),
        deviceId: this.deviceId,
        syncState: 'LOCAL_ONLY',
        version: 1,
      };
    }

    await this.saveLocalDraft(draft);
    return draft;
  }

  /**
   * Update a field in the draft with debounced autosave
   */
  updateField(
    draftId: string,
    fieldName: string,
    value: string | null,
    options?: {
      status?: FieldStatus;
      source?: DraftField['source'];
    }
  ): void {
    // Clear existing timeout
    const existingTimeout = this.saveTimeouts.get(draftId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout for debounced save
    const timeout = setTimeout(async () => {
      await this.applyFieldUpdate(draftId, fieldName, value, options);
    }, DEBOUNCE_MS);

    this.saveTimeouts.set(draftId, timeout);
  }

  /**
   * Force immediate save (bypass debounce)
   */
  async saveNow(draftId: string): Promise<void> {
    const timeout = this.saveTimeouts.get(draftId);
    if (timeout) {
      clearTimeout(timeout);
      this.saveTimeouts.delete(draftId);
    }

    const draft = await this.getLocalDraftById(draftId);
    if (draft) {
      await this.syncToServer(draft);
    }
  }

  /**
   * Get draft by ID
   */
  async getDraft(draftId: string): Promise<Draft | null> {
    return this.getLocalDraftById(draftId);
  }

  /**
   * Check for existing draft and prompt for restoration
   */
  async checkForRestorable(acordFormId: string): Promise<{
    hasLocal: boolean;
    hasServer: boolean;
    localDraft?: Draft;
    serverDraft?: Draft;
    conflict: boolean;
  }> {
    const localDraft = await this.getLocalDraft(acordFormId);
    let serverDraft: Draft | null = null;

    if (navigator.onLine) {
      serverDraft = await this.getServerDraft(acordFormId);
    }

    const conflict = !!(
      localDraft &&
      serverDraft &&
      localDraft.syncState === 'LOCAL_ONLY' &&
      serverDraft.version > (localDraft.serverVersion || 0)
    );

    return {
      hasLocal: !!localDraft,
      hasServer: !!serverDraft,
      localDraft: localDraft || undefined,
      serverDraft: serverDraft || undefined,
      conflict,
    };
  }

  /**
   * Resolve conflict by choosing local or server version
   */
  async resolveConflict(
    draftId: string,
    resolution: 'keep_local' | 'keep_server' | 'merge'
  ): Promise<Draft> {
    const localDraft = await this.getLocalDraftById(draftId);
    if (!localDraft) throw new Error('Draft not found');

    const serverDraft = await this.getServerDraft(localDraft.acordFormId);

    let resolvedDraft: Draft;

    switch (resolution) {
      case 'keep_local':
        resolvedDraft = {
          ...localDraft,
          syncState: 'LOCAL_ONLY',
          version: (localDraft.serverVersion || 0) + 1,
        };
        break;

      case 'keep_server':
        if (!serverDraft) throw new Error('Server draft not found');
        resolvedDraft = serverDraft;
        resolvedDraft.syncState = 'SYNCED';
        break;

      case 'merge':
        if (!serverDraft) throw new Error('Server draft not found');
        // Merge: prefer local changes for modified fields, server for others
        resolvedDraft = {
          ...serverDraft,
          fields: { ...serverDraft.fields },
          syncState: 'LOCAL_ONLY',
          version: serverDraft.version + 1,
        };

        for (const [field, localField] of Object.entries(localDraft.fields)) {
          if (localField.source === 'user') {
            // User-entered data takes precedence
            resolvedDraft.fields[field] = localField;
          }
        }
        break;
    }

    await this.saveLocalDraft(resolvedDraft);

    if (navigator.onLine) {
      await this.syncToServer(resolvedDraft);
    }

    return resolvedDraft;
  }

  /**
   * Get conflicts for a draft
   */
  async getConflicts(draftId: string): Promise<DraftConflict[]> {
    const localDraft = await this.getLocalDraftById(draftId);
    if (!localDraft) return [];

    const serverDraft = await this.getServerDraft(localDraft.acordFormId);
    if (!serverDraft) return [];

    const conflicts: DraftConflict[] = [];

    const allFields = new Set([
      ...Object.keys(localDraft.fields),
      ...Object.keys(serverDraft.fields),
    ]);

    for (const field of allFields) {
      const localField = localDraft.fields[field];
      const serverField = serverDraft.fields[field];

      if (
        localField?.value !== serverField?.value &&
        localField?.source === 'user'
      ) {
        conflicts.push({
          field,
          localValue: localField?.value || null,
          serverValue: serverField?.value || null,
          localModified: localField?.lastModified || localDraft.lastSavedAt,
          serverModified: serverField?.lastModified || serverDraft.lastSavedAt,
        });
      }
    }

    return conflicts;
  }

  /**
   * Subscribe to draft changes
   */
  onDraftChange(draftId: string, callback: (draft: Draft) => void): () => void {
    if (!this.onChangeCallbacks.has(draftId)) {
      this.onChangeCallbacks.set(draftId, new Set());
    }
    this.onChangeCallbacks.get(draftId)!.add(callback);

    return () => {
      this.onChangeCallbacks.get(draftId)?.delete(callback);
    };
  }

  /**
   * Delete a draft
   */
  async deleteDraft(draftId: string): Promise<void> {
    const db = await this.initDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(draftId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    // Also delete from server
    if (navigator.onLine) {
      try {
        await supabase
          .from('acord_form_drafts')
          .delete()
          .eq('id', draftId);
      } catch (error) {
        logger.error('Failed to delete server draft:', error);
      }
    }
  }

  // Private methods

  private async applyFieldUpdate(
    draftId: string,
    fieldName: string,
    value: string | null,
    options?: {
      status?: FieldStatus;
      source?: DraftField['source'];
    }
  ): Promise<void> {
    const draft = await this.getLocalDraftById(draftId);
    if (!draft) return;

    const userId = await this.getCurrentUserId();

    draft.fields[fieldName] = {
      ...draft.fields[fieldName],
      value,
      status: options?.status || draft.fields[fieldName]?.status || 'USER_ENTERED',
      source: options?.source || 'user',
      lastModified: new Date().toISOString(),
      modifiedBy: userId,
    };

    draft.lastSavedAt = new Date().toISOString();
    draft.lastSavedBy = userId;
    draft.syncState = 'LOCAL_ONLY';
    draft.version += 1;

    await this.saveLocalDraft(draft);

    // Notify subscribers
    this.notifyChange(draft);

    // Sync to server if online
    if (navigator.onLine) {
      await this.syncToServer(draft);
    }
  }

  private async getLocalDraft(acordFormId: string): Promise<Draft | null> {
    const db = await this.initDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('acordFormId');
      const request = index.get(acordFormId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  private async getLocalDraftById(draftId: string): Promise<Draft | null> {
    const db = await this.initDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(draftId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  private async saveLocalDraft(draft: Draft): Promise<void> {
    const db = await this.initDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(draft);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private async getServerDraft(acordFormId: string): Promise<Draft | null> {
    try {
      const { data, error } = await supabase
        .from('acord_form_drafts')
        .select('*')
        .eq('acord_form_id', acordFormId)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) return null;

      return {
        id: data.id,
        acordFormId: data.acord_form_id,
        schemaHash: data.schema_hash,
        importJobId: data.import_job_id,
        extractionId: data.extraction_id,
        fields: data.fields,
        lastSavedAt: data.last_saved_at,
        lastSavedBy: data.last_saved_by,
        deviceId: data.device_id,
        syncState: 'SYNCED',
        version: data.version,
        serverVersion: data.version,
      };
    } catch (error) {
      logger.error('Failed to get server draft:', error);
      return null;
    }
  }

  private async syncToServer(draft: Draft): Promise<void> {
    if (draft.syncState === 'SYNCING') return;

    draft.syncState = 'SYNCING';
    await this.saveLocalDraft(draft);

    try {
      const { error } = await supabase
        .from('acord_form_drafts')
        .upsert({
          id: draft.id,
          acord_form_id: draft.acordFormId,
          schema_hash: draft.schemaHash,
          import_job_id: draft.importJobId,
          extraction_id: draft.extractionId,
          fields: draft.fields,
          last_saved_at: draft.lastSavedAt,
          last_saved_by: draft.lastSavedBy,
          device_id: draft.deviceId,
          version: draft.version,
        });

      if (error) throw error;

      draft.syncState = 'SYNCED';
      draft.serverVersion = draft.version;
    } catch (error) {
      logger.error('Failed to sync draft:', error);
      draft.syncState = 'LOCAL_ONLY';
    }

    await this.saveLocalDraft(draft);
    this.notifyChange(draft);
  }

  private mergeServerDraft(local: Draft, server: Draft): Draft {
    return {
      ...server,
      syncState: 'SYNCED',
      serverVersion: server.version,
    };
  }

  private notifyChange(draft: Draft): void {
    const callbacks = this.onChangeCallbacks.get(draft.id);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(draft);
      }
    }
  }

  private async getCurrentUserId(): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || 'anonymous';
  }
}

// Export singleton
export const draftManager = new DraftManagerService();
