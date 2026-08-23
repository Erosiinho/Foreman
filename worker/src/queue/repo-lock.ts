import Redis from 'ioredis';

const RUNNING_LOCK_BUFFER_MS = 10 * 60 * 1000; // crash safety net beyond the enforced run timeout
const PAUSED_LOCK_TTL_SECONDS = 30 * 24 * 60 * 60; // ~indefinite: a human decides when to resume, not a timer
export const RELOCK_DELAY_MS = 15_000;

function lockKey(owner: string, repo: string): string {
    return `lock:${owner}/${repo}`;
}

/**
 * Only one task may be active-or-paused per repo at a time: the working copy is shared (no
 * worktree), so a second task checking out its own branch would collide with whatever the first
 * left on disk — including a paused one's uncommitted changes. This is a per-repo Redis lock keyed
 * by whichever issue currently owns it, checked/held/released around each job run.
 */
export default class RepoLock {
    constructor(private redis: Redis) {}

    async tryAcquire(owner: string, repo: string, issueNumber: number, runTimeoutMs: number): Promise<boolean> {
        const key = lockKey(owner, repo);
        const holder = await this.redis.get(key);
        if (holder && holder !== String(issueNumber)) return false;
        await this.redis.set(key, String(issueNumber), 'PX', runTimeoutMs + RUNNING_LOCK_BUFFER_MS);
        return true;
    }

    /** A run pausing extends the lock far out — resume happens on the human's schedule, not a timer. */
    async hold(owner: string, repo: string, issueNumber: number): Promise<void> {
        await this.redis.set(lockKey(owner, repo), String(issueNumber), 'EX', PAUSED_LOCK_TTL_SECONDS);
    }

    /** Only releases if this issue still owns the lock — avoids clobbering a lock a newer run already took. */
    async release(owner: string, repo: string, issueNumber: number): Promise<void> {
        const key = lockKey(owner, repo);
        const holder = await this.redis.get(key);
        if (holder === String(issueNumber)) await this.redis.del(key);
    }
}
