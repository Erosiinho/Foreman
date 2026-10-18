import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
    await execFileAsync('git', args, { cwd });
}

/** Resuming a paused task: the branch already exists in this persistent working copy (no worktree), just switch to it. */
export async function checkoutExisting(cwd: string, branch: string): Promise<void> {
    await git(cwd, ['checkout', branch]);
}

async function originHead(cwd: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd });
    return stdout.trim().replace('refs/remotes/origin/', '');
}

/** origin/HEAD is only set on clones — repos wired up with `git remote add` need it fetched once. */
async function defaultBranch(cwd: string): Promise<string> {
    try {
        return await originHead(cwd);
    } catch {
        try {
            await git(cwd, ['remote', 'set-head', 'origin', '--auto']);
            return await originHead(cwd);
        } catch {
            return 'main';
        }
    }
}

/**
 * Fresh run: always branches off the up-to-date remote default branch, never off whatever branch
 * the persistent working copy was left on (otherwise each task's PR drags in the previous tasks'
 * commits). Leftover uncommitted changes (e.g. from a failed run) are stashed rather than carried
 * over — stashed, not discarded, since this working copy is shared with code-server.
 */
export async function checkoutBranch(cwd: string, branch: string): Promise<void> {
    await git(cwd, ['fetch', 'origin', '--prune']);
    const base = await defaultBranch(cwd);

    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
    if (stdout.trim()) {
        await git(cwd, ['stash', 'push', '--include-untracked', '-m', `foreman: leftovers before ${branch}`]);
    }

    // Straight off origin/<base> (just fetched) rather than the local <base>, which may be stale or
    // carry unpushed commits. --no-track so the task branch doesn't take origin/<base> as upstream.
    await git(cwd, ['checkout', '--no-track', '-b', branch, `origin/${base}`]);
}

/**
 * Cancel cleanup: discards whatever Claude Code left uncommitted, switches back to the repo's
 * default branch (required before a branch can be deleted), then removes the task branch locally
 * and on the remote (best-effort — it may never have been pushed).
 */
export async function discardAndDeleteBranch(cwd: string, branch: string): Promise<void> {
    await git(cwd, ['reset', '--hard', 'HEAD']).catch(() => undefined);
    await git(cwd, ['clean', '-fd']).catch(() => undefined);
    const base = await defaultBranch(cwd);
    await git(cwd, ['checkout', base]).catch(() => undefined);
    await git(cwd, ['branch', '-D', branch]).catch(() => undefined);
    await git(cwd, ['push', 'origin', '--delete', branch]).catch(() => undefined);
}

/** Commits on HEAD that the remote default branch doesn't have — i.e. what a PR from HEAD would contain. */
async function commitsAheadOfDefault(cwd: string): Promise<number> {
    const base = await defaultBranch(cwd);
    try {
        const { stdout } = await execFileAsync('git', ['rev-list', '--count', `origin/${base}..HEAD`], { cwd });
        return Number(stdout.trim()) || 0;
    } catch {
        return 0;
    }
}

/**
 * Commits whatever Claude Code left in the working tree. Claude Code often commits its own work
 * before exiting, so a clean tree is only an error when the branch has nothing ahead of the
 * default branch either.
 */
export async function commitAll(cwd: string, message: string): Promise<void> {
    await git(cwd, ['add', '-A']);

    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
    if (!stdout.trim()) {
        if ((await commitsAheadOfDefault(cwd)) > 0) return;
        throw new Error('Claude made no changes to commit — nothing to open a PR for.');
    }

    await git(cwd, ['commit', '-m', message]);
}

export async function push(cwd: string, branch: string): Promise<void> {
    await git(cwd, ['push', 'origin', branch]);
}

export function slugify(title: string): string {
    const slug = title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50);
    return slug || 'task';
}

export function branchName(issueNumber: number, title: string): string {
    return `task/${issueNumber}-${slugify(title)}`;
}
