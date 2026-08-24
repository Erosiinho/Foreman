/**
 * Per-key TTL cache that also dedupes concurrent fetches for the same key (stores the in-flight
 * promise, not just the resolved value). Meant to be shared across all callers of a repository —
 * the HTTP routes and the background poller alike — so whichever fetches first pays the GitHub
 * API call and the other reuses the result instead of firing its own.
 */
export default class TtlCache<T> {
    private entries = new Map<string, { value: Promise<T>; expiresAt: number }>();

    constructor(private ttlMs: number) {}

    async get(key: string, fetch: () => Promise<T>): Promise<T> {
        const entry = this.entries.get(key);
        if (entry && entry.expiresAt > Date.now()) return entry.value;

        const value = fetch();
        this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        value.catch(() => this.entries.delete(key)); // don't let a failed fetch poison the cache
        return value;
    }

    invalidate(key: string): void {
        this.entries.delete(key);
    }
}
