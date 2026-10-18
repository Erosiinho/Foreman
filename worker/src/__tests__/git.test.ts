import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { branchName, checkoutBranch, commitAll, slugify } from '../lib/git';

describe('slugify', () => {
    it('lowercases and hyphenates', () => {
        expect(slugify('Fix the Login Bug!')).toBe('fix-the-login-bug');
    });

    it('falls back to "task" for a title with no alphanumerics', () => {
        expect(slugify('!!!')).toBe('task');
    });
});

describe('branchName', () => {
    it('prefixes with task/<issueNumber>-<slug>', () => {
        expect(branchName(42, 'Fix the Login Bug')).toBe('task/42-fix-the-login-bug');
    });
});

describe('commitAll', () => {
    let root: string;
    let cwd: string;
    const run = (args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    const commitCount = () => Number(run(['rev-list', '--count', 'HEAD']));

    beforeEach(() => {
        root = mkdtempSync(path.join(tmpdir(), 'foreman-git-'));
        const remote = path.join(root, 'remote.git');
        cwd = path.join(root, 'work');
        execFileSync('git', ['init', '--bare', '-b', 'main', remote]);
        execFileSync('git', ['clone', remote, cwd], { stdio: 'ignore' });
        run(['config', 'user.name', 'Test']);
        run(['config', 'user.email', 'test@example.com']);
        writeFileSync(path.join(cwd, 'README.md'), 'hello\n');
        run(['add', '-A']);
        run(['commit', '-m', 'init']);
        run(['push', 'origin', 'main']);
        run(['checkout', '-b', 'task/1-demo']);
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('commits uncommitted changes', async () => {
        writeFileSync(path.join(cwd, 'feature.txt'), 'new\n');
        await commitAll(cwd, 'task-1: Demo');
        expect(run(['log', '-1', '--format=%s'])).toBe('task-1: Demo');
    });

    it('succeeds without a new commit when Claude already committed its work', async () => {
        writeFileSync(path.join(cwd, 'feature.txt'), 'new\n');
        run(['add', '-A']);
        run(['commit', '-m', 'Claude did it']);
        await commitAll(cwd, 'task-1: Demo');
        expect(commitCount()).toBe(2);
    });

    it('throws when there are neither changes nor commits ahead of the default branch', async () => {
        await expect(commitAll(cwd, 'task-1: Demo')).rejects.toThrow('no changes to commit');
    });
});

describe('checkoutBranch', () => {
    let root: string;
    let remote: string;
    let cwd: string;
    const run = (args: string[], dir = cwd) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();

    beforeEach(() => {
        root = mkdtempSync(path.join(tmpdir(), 'foreman-git-'));
        remote = path.join(root, 'remote.git');
        cwd = path.join(root, 'work');
        execFileSync('git', ['init', '--bare', '-b', 'main', remote]);
        // `git init` + `remote add` (not a clone), so origin/HEAD is unset — like most real working copies.
        execFileSync('git', ['init', '-b', 'main', cwd]);
        run(['remote', 'add', 'origin', remote]);
        run(['config', 'user.name', 'Test']);
        run(['config', 'user.email', 'test@example.com']);
        writeFileSync(path.join(cwd, 'README.md'), 'hello\n');
        run(['add', '-A']);
        run(['commit', '-m', 'init']);
        run(['push', 'origin', 'main']);
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it("branches off the up-to-date remote default branch, not the previous task's branch", async () => {
        run(['checkout', '-b', 'task/1-previous']);
        writeFileSync(path.join(cwd, 'previous.txt'), 'old task\n');
        run(['add', '-A']);
        run(['commit', '-m', 'task-1: Previous']);

        // main moves forward on the remote (e.g. a PR got merged) without the working copy knowing.
        const other = path.join(root, 'other');
        execFileSync('git', ['clone', remote, other], { stdio: 'ignore' });
        run(['config', 'user.name', 'Test'], other);
        run(['config', 'user.email', 'test@example.com'], other);
        writeFileSync(path.join(other, 'merged.txt'), 'merged\n');
        run(['add', '-A'], other);
        run(['commit', '-m', 'Merged PR'], other);
        run(['push', 'origin', 'main'], other);

        await checkoutBranch(cwd, 'task/2-next');

        expect(run(['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('task/2-next');
        expect(run(['rev-parse', 'HEAD'])).toBe(run(['rev-parse', 'origin/main']));
        expect(run(['log', '--format=%s'])).not.toContain('task-1: Previous');
    });

    it('stashes leftover uncommitted changes instead of carrying them into the new branch', async () => {
        writeFileSync(path.join(cwd, 'leftover.txt'), 'from a failed run\n');

        await checkoutBranch(cwd, 'task/2-next');

        expect(run(['status', '--porcelain'])).toBe('');
        expect(run(['stash', 'list'])).toContain('foreman: leftovers before task/2-next');
    });
});
