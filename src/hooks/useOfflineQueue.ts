/**
 * Offline Queue Hook
 *
 * Manages a queue of documents for offline processing:
 * - Stores documents in IndexedDB when offline
 * - Syncs automatically when back online
 * - Shows queue status and progress
 * - Handles retries for failed uploads
 */

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getSignedStorageUrl } from '@/lib/storageUrl';
import { logger } from '@/lib/logger';

interface QueuedDocument {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  accountId?: string;
  acordFormId?: string;
  documentType: string;
  queuedAt: Date;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  error?: string;
  retryCount: number;
  extractionId?: string;
}

interface OfflineQueueState {
  isOnline: boolean;
  queue: QueuedDocument[];
  isSyncing: boolean;
  pendingCount: number;
  processingCount: number;
  failedCount: number;
}

const DB_NAME = 'insureflow_offline_queue';
const STORE_NAME = 'documents';
const MAX_RETRIES = 3;

// IndexedDB helpers
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('queuedAt', 'queuedAt', { unique: false });
      }
    };
  });
}

async function saveToQueue(doc: Omit<QueuedDocument, 'id' | 'queuedAt' | 'status' | 'retryCount'>): Promise<string> {
  const db = await openDatabase();
  const id = crypto.randomUUID();

  const queuedDoc: QueuedDocument = {
    ...doc,
    id,
    queuedAt: new Date(),
    status: 'pending',
    retryCount: 0,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Convert File to ArrayBuffer for storage
    const reader = new FileReader();
    reader.onload = () => {
      const storable = {
        ...queuedDoc,
        fileData: reader.result,
        file: undefined, // Don't store the File object directly
      };
      const request = store.add(storable);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(id);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(doc.file);
  });
}

async function getQueuedDocuments(): Promise<QueuedDocument[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const docs = request.result.map((doc: any) => ({
        ...doc,
        file: doc.fileData ? new File([doc.fileData], doc.fileName, { type: 'application/pdf' }) : null,
        queuedAt: new Date(doc.queuedAt),
      }));
      resolve(docs);
    };
  });
}

async function updateQueuedDocument(id: string, updates: Partial<QueuedDocument>): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const doc = getRequest.result;
      if (!doc) {
        resolve();
        return;
      }

      const updated = { ...doc, ...updates };
      const putRequest = store.put(updated);
      putRequest.onerror = () => reject(putRequest.error);
      putRequest.onsuccess = () => resolve();
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

async function removeFromQueue(id: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function clearQueue(): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export function useOfflineQueue() {
  const { toast } = useToast();

  const [state, setState] = useState<OfflineQueueState>({
    isOnline: navigator.onLine,
    queue: [],
    isSyncing: false,
    pendingCount: 0,
    processingCount: 0,
    failedCount: 0,
  });

  // Load queue from IndexedDB
  const loadQueue = useCallback(async () => {
    try {
      const docs = await getQueuedDocuments();
      setState(prev => ({
        ...prev,
        queue: docs,
        pendingCount: docs.filter(d => d.status === 'pending').length,
        processingCount: docs.filter(d => d.status === 'uploading' || d.status === 'processing').length,
        failedCount: docs.filter(d => d.status === 'failed').length,
      }));
    } catch (error) {
      logger.error('Failed to load queue:', error);
    }
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }));
      toast({
        title: 'Back online',
        description: 'Syncing queued documents...',
      });
    };

    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }));
      toast({
        title: 'Offline',
        description: 'Documents will be queued for later processing.',
        variant: 'destructive',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  // Load queue on mount
  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Process a single document
  const processDocument = useCallback(async (doc: QueuedDocument): Promise<boolean> => {
    if (!doc.file) return false;

    try {
      // Update status to uploading
      await updateQueuedDocument(doc.id, { status: 'uploading' });
      await loadQueue();

      // Upload file to Supabase Storage
      const fileName = `extractions/${doc.accountId || 'unknown'}/${Date.now()}_${doc.fileName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, doc.file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Update status to processing
      await updateQueuedDocument(doc.id, { status: 'processing' });
      await loadQueue();

      // Get signed URL
      const signedUrl = await getSignedStorageUrl('documents', fileName);

      // Call extraction edge function
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acord-extraction-pipeline`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            document_url: signedUrl,
            document_name: doc.fileName,
            account_id: doc.accountId,
            acord_form_id: doc.acordFormId,
            user_hints: {
              doc_type: doc.documentType,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Extraction failed');
      }

      const result = await response.json();

      // Update as completed
      await updateQueuedDocument(doc.id, {
        status: 'completed',
        extractionId: result.extraction_id,
      });

      // Remove from queue after success
      await removeFromQueue(doc.id);
      await loadQueue();

      return true;
    } catch (error: any) {
      logger.error('Document processing failed:', error);

      const newRetryCount = doc.retryCount + 1;
      if (newRetryCount >= MAX_RETRIES) {
        await updateQueuedDocument(doc.id, {
          status: 'failed',
          error: error.message,
          retryCount: newRetryCount,
        });
      } else {
        await updateQueuedDocument(doc.id, {
          status: 'pending',
          error: error.message,
          retryCount: newRetryCount,
        });
      }

      await loadQueue();
      return false;
    }
  }, [loadQueue]);

  // Sync all pending documents
  const syncQueue = useCallback(async () => {
    if (!state.isOnline || state.isSyncing) return;

    setState(prev => ({ ...prev, isSyncing: true }));

    try {
      const pendingDocs = state.queue.filter(d => d.status === 'pending');
      let successCount = 0;
      let failCount = 0;

      for (const doc of pendingDocs) {
        const success = await processDocument(doc);
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: 'Sync complete',
          description: `${successCount} document(s) processed successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
        });
      }
    } catch (error) {
      logger.error('Sync failed:', error);
      toast({
        title: 'Sync failed',
        description: 'Some documents could not be processed',
        variant: 'destructive',
      });
    } finally {
      setState(prev => ({ ...prev, isSyncing: false }));
    }
  }, [state.isOnline, state.isSyncing, state.queue, processDocument, toast]);

  // Auto-sync when coming online
  useEffect(() => {
    if (state.isOnline && state.pendingCount > 0 && !state.isSyncing) {
      syncQueue();
    }
  }, [state.isOnline, state.pendingCount, state.isSyncing, syncQueue]);

  // Add document to queue
  const queueDocument = useCallback(async (
    file: File,
    options: {
      accountId?: string;
      acordFormId?: string;
      documentType: string;
    }
  ): Promise<string> => {
    const id = await saveToQueue({
      file,
      fileName: file.name,
      fileSize: file.size,
      ...options,
    });

    await loadQueue();

    if (state.isOnline) {
      // Process immediately if online
      const docs = await getQueuedDocuments();
      const doc = docs.find(d => d.id === id);
      if (doc) {
        processDocument(doc);
      }
    } else {
      toast({
        title: 'Document queued',
        description: 'Will be processed when back online',
      });
    }

    return id;
  }, [state.isOnline, loadQueue, processDocument, toast]);

  // Retry failed document
  const retryDocument = useCallback(async (id: string) => {
    await updateQueuedDocument(id, { status: 'pending', error: undefined });
    await loadQueue();

    if (state.isOnline) {
      const docs = await getQueuedDocuments();
      const doc = docs.find(d => d.id === id);
      if (doc) {
        processDocument(doc);
      }
    }
  }, [state.isOnline, loadQueue, processDocument]);

  // Remove document from queue
  const removeDocument = useCallback(async (id: string) => {
    await removeFromQueue(id);
    await loadQueue();
  }, [loadQueue]);

  // Clear all documents
  const clearAll = useCallback(async () => {
    await clearQueue();
    await loadQueue();
  }, [loadQueue]);

  return {
    ...state,
    queueDocument,
    syncQueue,
    retryDocument,
    removeDocument,
    clearAll,
    refreshQueue: loadQueue,
  };
}
