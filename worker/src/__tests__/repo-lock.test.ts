import { describe, expect, it } from 'vitest';
import type Redis from 'ioredis';
import RepoLock from '../queue/repo-lock';

/** In-memory stand-in for the ioredis get/set/del subset RepoLock uses — no TTL semantics, just ownership. */
function fakeRedis() {
    const store = new Map<string, string>();
    return {
        store,
        async get(key: string) {
            return store.get(key) ?? null;
        },
        async set(key: string, value: string) {
            store.set(key, value);
            return 'OK';
        },
        async del(key: string) {
            const had = store.has(key);
            store.delete(key);
            return had ? 1 : 0;
        },
    };
}

describe('RepoLock', () => {
    it('grants the lock when the repo is free', async () => {
        const redis = fakeRedis();
        const lock = new RepoLock(redis as unknown as Redis);

        expect(await lock.tryAcquire('erosinho', 'demo', 1, 60_000)).toBe(true);
        expect(redis.store.get('lock:erosinho/demo')).toBe('1');
    });

    it('denies the lock when a different issue already holds it', async () => {
        const redis = fakeRedis();
        const lock = new RepoLock(redis as unknown as Redis);
        await lock.tryAcquire('erosinho', 'demo', 1, 60_000);

        expect(await lock.tryAcquire('erosinho', 'demo', 2, 60_000)).toBe(false);
    });

    it('re-grants the lock to the issue that already holds it', async () => {
        const redis = fakeRedis();
        const lock = new RepoLock(redis as unknown as Redis);
        await lock.tryAcquire('erosinho', 'demo', 1, 60_000);

        expect(await lock.tryAcquire('erosinho', 'demo', 1, 60_000)).toBe(true);
    });

    it('releases only when the calling issue still owns the lock', async () => {
        const redis = fakeRedis();
        const lock = new RepoLock(redis as unknown as Redis);
        await lock.tryAcquire('erosinho', 'demo', 1, 60_000);

        await lock.release('erosinho', 'demo', 2);
        expect(redis.store.has('lock:erosinho/demo')).toBe(true);

        await lock.release('erosinho', 'demo', 1);
        expect(redis.store.has('lock:erosinho/demo')).toBe(false);
    });

    it('hold keeps the lock under the same owner', async () => {
        const redis = fakeRedis();
        const lock = new RepoLock(redis as unknown as Redis);
        await lock.tryAcquire('erosinho', 'demo', 1, 60_000);

        await lock.hold('erosinho', 'demo', 1);
        expect(redis.store.get('lock:erosinho/demo')).toBe('1');
    });

    it('lets a different repo acquire independently', async () => {
        const redis = fakeRedis();
        const lock = new RepoLock(redis as unknown as Redis);
        await lock.tryAcquire('erosinho', 'demo', 1, 60_000);

        expect(await lock.tryAcquire('erosinho', 'other', 2, 60_000)).toBe(true);
    });
});
