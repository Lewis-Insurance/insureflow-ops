/**
 * Offline Sync Service
 *
 * Handles:
 * - Queuing operations made while offline
 * - Syncing when connectivity is restored
 * - Conflict resolution
 * - Local cache management
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase, getSession } from './supabase';

// Storage keys
const OFFLINE_QUEUE_KEY = '@insureflow/offline_queue';
const CACHE_PREFIX = '@insureflow/cache/';
const SYNC_VERSION_KEY = '@insureflow/sync_version';

export interface OfflineOperation {
  id: string;
  operation: 'create' | 'update' | 'delete';
  tableName: string;
  recordId?: string;
  payload: Record<string, unknown>;
  clientTimestamp: string;
  attempts: number;
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  error: string | null;
}

let syncStatus: SyncStatus = {
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  lastSyncAt: null,
  error: null,
};

let statusListeners: ((status: SyncStatus) => void)[] = [];

// ============================================================================
// Status Management
// ============================================================================

export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

export function onSyncStatusChange(listener: (status: SyncStatus) => void) {
  statusListeners.push(listener);
  return () => {
    statusListeners = statusListeners.filter((l) => l !== listener);
  };
}

function updateStatus(updates: Partial<SyncStatus>) {
  syncStatus = { ...syncStatus, ...updates };
  statusListeners.forEach((l) => l(syncStatus));
}

// ============================================================================
// Network Monitoring
// ============================================================================

export function initNetworkListener() {
  return NetInfo.addEventListener((state) => {
    const wasOffline = !syncStatus.isOnline;
    const isNowOnline = state.isConnected ?? false;

    updateStatus({ isOnline: isNowOnline });

    // If we just came back online, trigger sync
    if (wasOffline && isNowOnline) {
      console.log('Network restored, triggering sync...');
      processOfflineQueue().catch(console.error);
    }
  });
}

// ============================================================================
// Offline Queue Operations
// ============================================================================

/**
 * Queue an operation to be synced when online
 */
export async function queueOfflineOperation(
  operation: 'create' | 'update' | 'delete',
  tableName: string,
  payload: Record<string, unknown>,
  recordId?: string
): Promise<string> {
  const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const queueItem: OfflineOperation = {
    id,
    operation,
    tableName,
    recordId,
    payload,
    clientTimestamp: new Date().toISOString(),
    attempts: 0,
  };

  // Get existing queue
  const queue = await getOfflineQueue();
  queue.push(queueItem);

  // Save updated queue
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  updateStatus({ pendingCount: queue.length });

  console.log(`Queued offline operation: ${operation} on ${tableName}`);

  return id;
}

/**
 * Get all pending offline operations
 */
export async function getOfflineQueue(): Promise<OfflineOperation[]> {
  try {
    const data = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error reading offline queue:', error);
    return [];
  }
}

/**
 * Remove an operation from the queue
 */
export async function removeFromQueue(operationId: string): Promise<void> {
  const queue = await getOfflineQueue();
  const filtered = queue.filter((op) => op.id !== operationId);
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
  updateStatus({ pendingCount: filtered.length });
}

/**
 * Clear the entire offline queue
 */
export async function clearOfflineQueue(): Promise<void> {
  await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
  updateStatus({ pendingCount: 0 });
}

// ============================================================================
// Sync Processing
// ============================================================================

/**
 * Process all pending offline operations
 */
export async function processOfflineQueue(): Promise<{ success: number; failed: number }> {
  if (syncStatus.isSyncing) {
    console.log('Sync already in progress');
    return { success: 0, failed: 0 };
  }

  const session = await getSession();
  if (!session) {
    console.log('Not authenticated, skipping sync');
    return { success: 0, failed: 0 };
  }

  updateStatus({ isSyncing: true, error: null });

  const queue = await getOfflineQueue();
  if (queue.length === 0) {
    updateStatus({ isSyncing: false, lastSyncAt: new Date().toISOString() });
    return { success: 0, failed: 0 };
  }

  console.log(`Processing ${queue.length} offline operations...`);

  let success = 0;
  let failed = 0;

  for (const operation of queue) {
    try {
      const result = await processOperation(operation);

      if (result.success) {
        await removeFromQueue(operation.id);
        success++;
      } else if (result.conflict) {
        // Handle conflict - for now, we use server-wins strategy
        console.warn(`Conflict detected for ${operation.tableName}:${operation.recordId}`);
        await removeFromQueue(operation.id);
        failed++;
      } else {
        // Increment attempts
        operation.attempts++;
        if (operation.attempts >= 3) {
          console.error(`Max attempts reached for operation ${operation.id}`);
          await removeFromQueue(operation.id);
          failed++;
        }
      }
    } catch (error) {
      console.error(`Error processing operation ${operation.id}:`, error);
      operation.attempts++;
      failed++;
    }
  }

  updateStatus({
    isSyncing: false,
    lastSyncAt: new Date().toISOString(),
    pendingCount: (await getOfflineQueue()).length,
  });

  console.log(`Sync complete: ${success} success, ${failed} failed`);
  return { success, failed };
}

/**
 * Process a single offline operation
 */
async function processOperation(
  operation: OfflineOperation
): Promise<{ success: boolean; conflict?: boolean }> {
  const { operation: op, tableName, recordId, payload } = operation;

  switch (op) {
    case 'create': {
      const { data, error } = await supabase.from(tableName).insert(payload).select().single();

      if (error) {
        console.error(`Create failed for ${tableName}:`, error);
        return { success: false };
      }

      // Update local cache with server-generated ID
      if (data?.id && payload.localId) {
        await updateCacheId(tableName, payload.localId as string, data.id);
      }

      return { success: true };
    }

    case 'update': {
      if (!recordId) {
        return { success: false };
      }

      // Check for conflicts by comparing timestamps
      const { data: serverData } = await supabase
        .from(tableName)
        .select('updated_at')
        .eq('id', recordId)
        .single();

      if (serverData?.updated_at) {
        const serverTime = new Date(serverData.updated_at).getTime();
        const clientTime = new Date(operation.clientTimestamp).getTime();

        if (serverTime > clientTime) {
          // Server has newer data - conflict
          return { success: false, conflict: true };
        }
      }

      const { error } = await supabase.from(tableName).update(payload).eq('id', recordId);

      if (error) {
        console.error(`Update failed for ${tableName}:${recordId}:`, error);
        return { success: false };
      }

      return { success: true };
    }

    case 'delete': {
      if (!recordId) {
        return { success: false };
      }

      const { error } = await supabase.from(tableName).delete().eq('id', recordId);

      if (error) {
        console.error(`Delete failed for ${tableName}:${recordId}:`, error);
        return { success: false };
      }

      // Remove from local cache
      await removeFromCache(tableName, recordId);

      return { success: true };
    }

    default:
      return { success: false };
  }
}

// ============================================================================
// Local Cache Management
// ============================================================================

/**
 * Cache data locally for offline access
 */
export async function cacheData(tableName: string, data: unknown): Promise<void> {
  const key = `${CACHE_PREFIX}${tableName}`;
  await AsyncStorage.setItem(
    key,
    JSON.stringify({
      data,
      cachedAt: new Date().toISOString(),
    })
  );
}

/**
 * Get cached data
 */
export async function getCachedData<T>(tableName: string): Promise<{ data: T; cachedAt: string } | null> {
  try {
    const key = `${CACHE_PREFIX}${tableName}`;
    const cached = await AsyncStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error(`Error reading cache for ${tableName}:`, error);
    return null;
  }
}

/**
 * Update a cached ID after server sync (for optimistic creates)
 */
async function updateCacheId(tableName: string, localId: string, serverId: string): Promise<void> {
  const cached = await getCachedData<unknown[]>(tableName);
  if (cached?.data && Array.isArray(cached.data)) {
    const updated = cached.data.map((item: Record<string, unknown>) =>
      item.localId === localId ? { ...item, id: serverId, localId: undefined } : item
    );
    await cacheData(tableName, updated);
  }
}

/**
 * Remove an item from cache
 */
async function removeFromCache(tableName: string, recordId: string): Promise<void> {
  const cached = await getCachedData<unknown[]>(tableName);
  if (cached?.data && Array.isArray(cached.data)) {
    const filtered = cached.data.filter((item: Record<string, unknown>) => item.id !== recordId);
    await cacheData(tableName, filtered);
  }
}

/**
 * Clear all cached data
 */
export async function clearAllCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
  await AsyncStorage.multiRemove(cacheKeys);
}

// ============================================================================
// Sync Version Tracking (for incremental sync)
// ============================================================================

/**
 * Get the last sync version for a table
 */
export async function getSyncVersion(tableName: string): Promise<number> {
  try {
    const data = await AsyncStorage.getItem(`${SYNC_VERSION_KEY}_${tableName}`);
    return data ? parseInt(data, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Update the sync version for a table
 */
export async function setSyncVersion(tableName: string, version: number): Promise<void> {
  await AsyncStorage.setItem(`${SYNC_VERSION_KEY}_${tableName}`, version.toString());
}

// ============================================================================
// Offline-aware CRUD helpers
// ============================================================================

/**
 * Create a record (works offline)
 */
export async function createRecord(
  tableName: string,
  data: Record<string, unknown>
): Promise<{ data: Record<string, unknown>; offline: boolean }> {
  // Generate a local ID for optimistic creation
  const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const recordWithLocalId = { ...data, localId };

  if (!syncStatus.isOnline) {
    // Queue for later sync
    await queueOfflineOperation('create', tableName, recordWithLocalId);

    // Add to local cache
    const cached = await getCachedData<unknown[]>(tableName);
    const currentData = cached?.data || [];
    await cacheData(tableName, [...currentData, { ...recordWithLocalId, id: localId }]);

    return { data: { ...recordWithLocalId, id: localId }, offline: true };
  }

  // Online - create directly
  const { data: serverData, error } = await supabase.from(tableName).insert(data).select().single();

  if (error) {
    // If online create fails, queue for retry
    await queueOfflineOperation('create', tableName, recordWithLocalId);
    return { data: { ...recordWithLocalId, id: localId }, offline: true };
  }

  return { data: serverData, offline: false };
}

/**
 * Update a record (works offline)
 */
export async function updateRecord(
  tableName: string,
  recordId: string,
  data: Record<string, unknown>
): Promise<{ data: Record<string, unknown>; offline: boolean }> {
  if (!syncStatus.isOnline) {
    await queueOfflineOperation('update', tableName, data, recordId);

    // Update local cache
    const cached = await getCachedData<unknown[]>(tableName);
    if (cached?.data && Array.isArray(cached.data)) {
      const updated = cached.data.map((item: Record<string, unknown>) =>
        item.id === recordId ? { ...item, ...data } : item
      );
      await cacheData(tableName, updated);
    }

    return { data: { id: recordId, ...data }, offline: true };
  }

  const { data: serverData, error } = await supabase
    .from(tableName)
    .update(data)
    .eq('id', recordId)
    .select()
    .single();

  if (error) {
    await queueOfflineOperation('update', tableName, data, recordId);
    return { data: { id: recordId, ...data }, offline: true };
  }

  return { data: serverData, offline: false };
}

/**
 * Delete a record (works offline)
 */
export async function deleteRecord(
  tableName: string,
  recordId: string
): Promise<{ success: boolean; offline: boolean }> {
  if (!syncStatus.isOnline) {
    await queueOfflineOperation('delete', tableName, {}, recordId);
    await removeFromCache(tableName, recordId);
    return { success: true, offline: true };
  }

  const { error } = await supabase.from(tableName).delete().eq('id', recordId);

  if (error) {
    await queueOfflineOperation('delete', tableName, {}, recordId);
    await removeFromCache(tableName, recordId);
    return { success: true, offline: true };
  }

  await removeFromCache(tableName, recordId);
  return { success: true, offline: false };
}
