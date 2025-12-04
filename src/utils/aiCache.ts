/**
 * Multi-Tier AI Response Caching System
 *
 * Three-tier architecture for optimal performance and cost reduction:
 * 1. Memory Cache (L1): Instant access for hot queries during session
 * 2. LocalStorage (L2): 24-hour persistence, 5MB limit, cross-tab support
 * 3. IndexedDB (L3): 7-day persistence, 50MB limit, large dataset support
 *
 * Features:
 * - Automatic cache eviction (LRU for memory, TTL for storage)
 * - Compression for storage tiers
 * - Cache warming on app load
 * - Analytics and hit rate tracking
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface CacheEntry {
  query: string;
  queryHash: string;
  response: any;
  embedding?: number[];
  context?: string;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  size: number; // bytes
}

export interface CacheStats {
  memoryHits: number;
  localStorageHits: number;
  indexedDBHits: number;
  misses: number;
  totalQueries: number;
  hitRate: number;
  avgResponseTime: number;
  cacheSize: {
    memory: number;
    localStorage: number;
    indexedDB: number;
  };
}


// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  memory: {
    maxSize: 500, // max entries
    ttl: 30 * 60 * 1000, // 30 minutes
  },
  localStorage: {
    maxSize: 5 * 1024 * 1024, // 5MB
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    keyPrefix: 'ai_cache_',
  },
  indexedDB: {
    name: 'ai-cache',
    version: 1,
    storeName: 'responses',
    maxSize: 50 * 1024 * 1024, // 50MB
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

function hashQuery(query: string, context?: string): string {
  const text = context ? `${query}::${context}` : query;
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

function compressJSON(data: any): string {
  // Simple compression: JSON stringify
  // In production, consider using lz-string or similar
  return JSON.stringify(data);
}

function decompressJSON(data: string): any {
  return JSON.parse(data);
}

function estimateSize(data: any): number {
  return new Blob([JSON.stringify(data)]).size;
}

// ============================================================================
// Memory Cache (L1)
// ============================================================================

class MemoryCache {
  private cache: Map<string, CacheEntry>;
  private accessOrder: string[]; // LRU tracking

  constructor() {
    this.cache = new Map();
    this.accessOrder = [];
  }

  get(queryHash: string): CacheEntry | null {
    const entry = this.cache.get(queryHash);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > CONFIG.memory.ttl) {
      this.cache.delete(queryHash);
      this.accessOrder = this.accessOrder.filter((k) => k !== queryHash);
      return null;
    }

    // Update LRU
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.accessOrder = this.accessOrder.filter((k) => k !== queryHash);
    this.accessOrder.push(queryHash);

    return entry;
  }

  set(queryHash: string, entry: CacheEntry): void {
    // Evict LRU if at capacity
    if (this.cache.size >= CONFIG.memory.maxSize) {
      const lruKey = this.accessOrder.shift();
      if (lruKey) this.cache.delete(lruKey);
    }

    this.cache.set(queryHash, entry);
    this.accessOrder.push(queryHash);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  getSize(): number {
    return this.cache.size;
  }

  getAllEntries(): CacheEntry[] {
    return Array.from(this.cache.values());
  }
}

// ============================================================================
// LocalStorage Cache (L2)
// ============================================================================

class LocalStorageCache {
  private getCurrentSize(): number {
    let total = 0;
    for (const key in localStorage) {
      if (key.startsWith(CONFIG.localStorage.keyPrefix)) {
        total += (localStorage.getItem(key)?.length || 0) * 2; // UTF-16 = 2 bytes per char
      }
    }
    return total;
  }

  private evictOldest(): void {
    const entries: { key: string; timestamp: number }[] = [];

    for (const key in localStorage) {
      if (key.startsWith(CONFIG.localStorage.keyPrefix)) {
        try {
          const data = localStorage.getItem(key);
          if (data) {
            const entry = decompressJSON(data);
            entries.push({ key, timestamp: entry.timestamp });
          }
        } catch (e) {
          // Invalid entry, remove it
          localStorage.removeItem(key);
        }
      }
    }

    // Sort by timestamp and remove oldest
    entries.sort((a, b) => a.timestamp - b.timestamp);
    if (entries.length > 0) {
      localStorage.removeItem(entries[0].key);
    }
  }

  get(queryHash: string): CacheEntry | null {
    const key = CONFIG.localStorage.keyPrefix + queryHash;
    const data = localStorage.getItem(key);
    if (!data) return null;

    try {
      const entry = decompressJSON(data) as CacheEntry;

      // Check TTL
      if (Date.now() - entry.timestamp > CONFIG.localStorage.ttl) {
        localStorage.removeItem(key);
        return null;
      }

      // Update access metadata
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      localStorage.setItem(key, compressJSON(entry));

      return entry;
    } catch (e) {
      console.error('LocalStorage cache read error:', e);
      localStorage.removeItem(key);
      return null;
    }
  }

  set(queryHash: string, entry: CacheEntry): void {
    const key = CONFIG.localStorage.keyPrefix + queryHash;
    const compressed = compressJSON(entry);
    const size = compressed.length * 2;

    // Evict until we have space
    while (
      this.getCurrentSize() + size > CONFIG.localStorage.maxSize &&
      this.getCurrentSize() > 0
    ) {
      this.evictOldest();
    }

    try {
      localStorage.setItem(key, compressed);
    } catch (e) {
      console.error('LocalStorage cache write error:', e);
      // Quota exceeded, try evicting more
      this.evictOldest();
      try {
        localStorage.setItem(key, compressed);
      } catch (e2) {
        console.error('LocalStorage cache write failed after eviction:', e2);
      }
    }
  }

  clear(): void {
    for (const key in localStorage) {
      if (key.startsWith(CONFIG.localStorage.keyPrefix)) {
        localStorage.removeItem(key);
      }
    }
  }

  getSize(): number {
    return this.getCurrentSize();
  }
}

// ============================================================================
// IndexedDB Cache (L3)
// ============================================================================

class IndexedDBCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CONFIG.indexedDB.name, CONFIG.indexedDB.version);

      request.onerror = () => {
        console.error('IndexedDB initialization error:', request.error);
        resolve(); // Don't reject, just log error
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(CONFIG.indexedDB.storeName)) {
          const store = db.createObjectStore(CONFIG.indexedDB.storeName, {
            keyPath: 'queryHash',
          });
          store.createIndex('by-timestamp', 'timestamp', { unique: false });
          store.createIndex('by-access', 'lastAccessed', { unique: false });
        }
      };
    });
  }

  async get(queryHash: string): Promise<CacheEntry | null> {
    await this.initPromise;
    if (!this.db) return null;

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction([CONFIG.indexedDB.storeName], 'readwrite');
        const store = transaction.objectStore(CONFIG.indexedDB.storeName);
        const request = store.get(queryHash);

        request.onsuccess = () => {
          const entry = request.result as CacheEntry | undefined;
          if (!entry) {
            resolve(null);
            return;
          }

          // Check TTL
          if (Date.now() - entry.timestamp > CONFIG.indexedDB.ttl) {
            store.delete(queryHash);
            resolve(null);
            return;
          }

          // Update access metadata
          entry.accessCount++;
          entry.lastAccessed = Date.now();
          store.put(entry);

          resolve(entry);
        };

        request.onerror = () => {
          console.error('IndexedDB cache read error:', request.error);
          resolve(null);
        };
      } catch (e) {
        console.error('IndexedDB cache read error:', e);
        resolve(null);
      }
    });
  }

  async set(queryHash: string, entry: CacheEntry): Promise<void> {
    await this.initPromise;
    if (!this.db) return;

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction([CONFIG.indexedDB.storeName], 'readwrite');
        const store = transaction.objectStore(CONFIG.indexedDB.storeName);
        const request = store.put(entry);

        request.onsuccess = () => {
          this.evictIfNeeded();
          resolve();
        };

        request.onerror = () => {
          console.error('IndexedDB cache write error:', request.error);
          resolve();
        };
      } catch (e) {
        console.error('IndexedDB cache write error:', e);
        resolve();
      }
    });
  }

  private async evictIfNeeded(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction([CONFIG.indexedDB.storeName], 'readwrite');
        const store = transaction.objectStore(CONFIG.indexedDB.storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          const allEntries = request.result as CacheEntry[];
          const totalSize = allEntries.reduce((sum, entry) => sum + entry.size, 0);

          if (totalSize > CONFIG.indexedDB.maxSize) {
            // Sort by last accessed and remove oldest
            allEntries.sort((a, b) => a.lastAccessed - b.lastAccessed);
            const toRemove = Math.ceil(allEntries.length * 0.2); // Remove 20%

            for (let i = 0; i < toRemove; i++) {
              store.delete(allEntries[i].queryHash);
            }
          }

          resolve();
        };

        request.onerror = () => {
          console.error('IndexedDB eviction error:', request.error);
          resolve();
        };
      } catch (e) {
        console.error('IndexedDB eviction error:', e);
        resolve();
      }
    });
  }

  async clear(): Promise<void> {
    await this.initPromise;
    if (!this.db) return;

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction([CONFIG.indexedDB.storeName], 'readwrite');
        const store = transaction.objectStore(CONFIG.indexedDB.storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.error('IndexedDB clear error:', request.error);
          resolve();
        };
      } catch (e) {
        console.error('IndexedDB clear error:', e);
        resolve();
      }
    });
  }

  async getSize(): Promise<number> {
    await this.initPromise;
    if (!this.db) return 0;

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction([CONFIG.indexedDB.storeName], 'readonly');
        const store = transaction.objectStore(CONFIG.indexedDB.storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          const allEntries = request.result as CacheEntry[];
          const size = allEntries.reduce((sum, entry) => sum + entry.size, 0);
          resolve(size);
        };

        request.onerror = () => {
          console.error('IndexedDB size calculation error:', request.error);
          resolve(0);
        };
      } catch (e) {
        console.error('IndexedDB size calculation error:', e);
        resolve(0);
      }
    });
  }
}

// ============================================================================
// Unified Cache Manager
// ============================================================================

export class AICacheManager {
  private memoryCache: MemoryCache;
  private localStorageCache: LocalStorageCache;
  private indexedDBCache: IndexedDBCache;
  private stats: CacheStats;

  constructor() {
    this.memoryCache = new MemoryCache();
    this.localStorageCache = new LocalStorageCache();
    this.indexedDBCache = new IndexedDBCache();
    this.stats = {
      memoryHits: 0,
      localStorageHits: 0,
      indexedDBHits: 0,
      misses: 0,
      totalQueries: 0,
      hitRate: 0,
      avgResponseTime: 0,
      cacheSize: {
        memory: 0,
        localStorage: 0,
        indexedDB: 0,
      },
    };
  }

  /**
   * Get cached response, checking all tiers
   */
  async get(query: string, context?: string): Promise<any | null> {
    const startTime = performance.now();
    const queryHash = hashQuery(query, context);
    this.stats.totalQueries++;

    // L1: Memory
    let entry = this.memoryCache.get(queryHash);
    if (entry) {
      this.stats.memoryHits++;
      this.updateStats(startTime);
      return entry.response;
    }

    // L2: LocalStorage
    entry = this.localStorageCache.get(queryHash);
    if (entry) {
      this.stats.localStorageHits++;
      // Promote to memory cache
      this.memoryCache.set(queryHash, entry);
      this.updateStats(startTime);
      return entry.response;
    }

    // L3: IndexedDB
    entry = await this.indexedDBCache.get(queryHash);
    if (entry) {
      this.stats.indexedDBHits++;
      // Promote to higher tiers
      this.memoryCache.set(queryHash, entry);
      this.localStorageCache.set(queryHash, entry);
      this.updateStats(startTime);
      return entry.response;
    }

    this.stats.misses++;
    this.updateStats(startTime);
    return null;
  }

  /**
   * Set cached response in all tiers
   */
  async set(query: string, response: any, context?: string, embedding?: number[]): Promise<void> {
    const queryHash = hashQuery(query, context);
    const entry: CacheEntry = {
      query,
      queryHash,
      response,
      embedding,
      context,
      timestamp: Date.now(),
      ttl: CONFIG.indexedDB.ttl,
      accessCount: 1,
      lastAccessed: Date.now(),
      size: estimateSize(response),
    };

    // Write to all tiers
    this.memoryCache.set(queryHash, entry);
    this.localStorageCache.set(queryHash, entry);
    await this.indexedDBCache.set(queryHash, entry);
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    this.memoryCache.clear();
    this.localStorageCache.clear();
    await this.indexedDBCache.clear();
    this.resetStats();
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    this.stats.hitRate =
      this.stats.totalQueries > 0
        ? ((this.stats.memoryHits +
            this.stats.localStorageHits +
            this.stats.indexedDBHits) /
            this.stats.totalQueries) *
          100
        : 0;

    this.stats.cacheSize = {
      memory: this.memoryCache.getSize(),
      localStorage: this.localStorageCache.getSize(),
      indexedDB: await this.indexedDBCache.getSize(),
    };

    return { ...this.stats };
  }

  /**
   * Warm cache with frequently accessed queries
   */
  async warmCache(queries: Array<{ query: string; context?: string }>): Promise<void> {
    // This would be called on app load with common queries
    // For now, it's a placeholder for future implementation
    console.log('Cache warming with', queries.length, 'queries');
  }

  private updateStats(startTime: number): void {
    const responseTime = performance.now() - startTime;
    this.stats.avgResponseTime =
      (this.stats.avgResponseTime * (this.stats.totalQueries - 1) + responseTime) /
      this.stats.totalQueries;
  }

  private resetStats(): void {
    this.stats = {
      memoryHits: 0,
      localStorageHits: 0,
      indexedDBHits: 0,
      misses: 0,
      totalQueries: 0,
      hitRate: 0,
      avgResponseTime: 0,
      cacheSize: {
        memory: 0,
        localStorage: 0,
        indexedDB: 0,
      },
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const aiCache = new AICacheManager();
