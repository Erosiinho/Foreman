import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
    await execFileAsync('git', args, { cwd });
}

export async function checkoutBranch(cwd: string, branch: string): Promise<void> {
    await git(cwd, ['checkout', '-b', branch]);
}

/** Resuming a paused task: the branch already exists in this persistent working copy (no worktree), just switch to it. */
export async function checkoutExisting(cwd: string, branch: string): Promise<void> {
    await git(cwd, ['checkout', branch]);
}

async function defaultBranch(cwd: string): Promise<string> {
    try {
        const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd });
        return stdout.trim().replace('refs/remotes/origin/', '');
    } catch {
        return 'main';
    }
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

export async function commitAll(cwd: string, message: string): Promise<void> {
    await git(cwd, ['add', '-A']);

    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd });
    if (!stdout.trim()) {
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
