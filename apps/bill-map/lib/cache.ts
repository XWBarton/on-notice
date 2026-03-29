// Simple in-memory TTL cache for API route responses.
// Module-level singleton persists across invocations within the same Node process.

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class TTLCache {
  private store = new Map<string, CacheEntry<unknown>>();

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }
}

export const cache = new TTLCache();

export const TTL = {
  POLICIES: 24 * 60 * 60 * 1000, // 24h — policies rarely change
  DIVISIONS: 60 * 60 * 1000,      // 1h
  BILLS: 6 * 60 * 60 * 1000,      // 6h
} as const;
