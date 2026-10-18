import { beforeEach, describe, expect, it, vi } from 'vitest';
import ControlBus, { ControlMessage } from '../queue/control-bus';
import GithubClient from '../github/client';
import { createRunTaskProcessor } from '../jobs/run-task.processor';
import { runClaude, ClaudeRunResult, RunClaudeOptions } from '../lib/claude';
import * as git from '../lib/git';
import { createPullRequest } from '../lib/gh';
import { readProjectConfig } from '../lib/project-config';
import { runSetupCommand } from '../lib/setup';
import IRunTaskJob from '../types/IRunTaskJob';

vi.mock('../lib/claude', () => ({ runClaude: vi.fn() }));
vi.mock('../lib/gh', () => ({ createPullRequest: vi.fn() }));
vi.mock('../lib/project-config', () => ({ readProjectConfig: vi.fn() }));
vi.mock('../lib/setup', () => ({ runSetupCommand: vi.fn() }));
vi.mock('../lib/git', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/git')>();
    return {
        ...actual,
        checkoutBranch: vi.fn(),
        checkoutExisting: vi.fn(),
        commitAll: vi.fn(),
        push: vi.fn(),
        discardAndDeleteBranch: vi.fn(),
    };
});

/** Mimics runClaude's real contract: session_id known up front, rejects with an AbortError once the signal fires. */
function abortableRunClaude(sessionId: string) {
    return vi.fn(
        (_cwd: string, _prompt: string, options: RunClaudeOptions = {}) =>
            new Promise<ClaudeRunResult>((_resolve, reject) => {
                options.onSessionId?.(sessionId);
                options.signal?.addEventListener(
                    'abort',
                    () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
                    { once: true },
                );
            }),
    );
}

function fakeControlBus() {
    let handler: ((message: ControlMessage) => void) | undefined;
    return {
        bus: {
            subscribe: vi.fn((_owner: string, _repo: string, h: (message: ControlMessage) => void) => {
                handler = h;
                return () => {
                    handler = undefined;
                };
            }),
        } as unknown as ControlBus,
        trigger: (message: ControlMessage) => handler?.(message),
    };
}

function fakeGithub() {
    return {
        setStatus: vi.fn(async () => undefined),
        addComment: vi.fn(async () => undefined),
    } as unknown as GithubClient;
}

const job: IRunTaskJob = {
    owner: 'erosinho',
    repo: 'demo',
    issueNumber: 42,
    title: 'Fix bug',
    description: 'Do the thing',
};

/** Flushes the microtask queue — enough for runClaude's mock to have synchronously wired its abort listener. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(git.checkoutBranch).mockResolvedValue(undefined);
    vi.mocked(git.checkoutExisting).mockResolvedValue(undefined);
    vi.mocked(git.commitAll).mockResolvedValue(undefined);
    vi.mocked(git.push).mockResolvedValue(undefined);
    vi.mocked(git.discardAndDeleteBranch).mockResolvedValue(undefined);
    vi.mocked(createPullRequest).mockResolvedValue('https://github.com/erosinho/demo/pull/7');
    vi.mocked(readProjectConfig).mockResolvedValue({});
    vi.mocked(runSetupCommand).mockResolvedValue(undefined);
});

describe('createRunTaskProcessor', () => {
    it('runs the task to completion and reports done', async () => {
        vi.mocked(runClaude).mockResolvedValue({ sessionId: 'sess-1', summary: 'Fixed it' });
        const github = fakeGithub();
        const notify = vi.fn(async () => undefined);
        const { bus } = fakeControlBus();
        const processor = createRunTaskProcessor({
            github,
            projectsRoot: '/projects',
            controlBus: bus,
            notify,
            runTimeoutMs: 60_000,
        });

        const outcome = await processor(job);

        expect(outcome).toBe('done');
        expect(git.checkoutBranch).toHaveBeenCalledWith('/projects/demo', 'task/42-fix-bug');
        expect(git.commitAll).toHaveBeenCalledWith('/projects/demo', 'task-42: Fix bug');
        expect(git.push).toHaveBeenCalled();
        expect(github.setStatus).toHaveBeenNthCalledWith(1, 'erosinho', 'demo', 42, 'in-progress');
        expect(github.setStatus).toHaveBeenNthCalledWith(2, 'erosinho', 'demo', 42, 'done');
        expect(github.addComment).toHaveBeenCalledWith(
            'erosinho',
            'demo',
            42,
            expect.stringContaining('https://github.com/erosinho/demo/pull/7'),
        );
        expect(notify).toHaveBeenCalledWith(expect.stringContaining('done'));
    });

    it('resumes the existing branch instead of creating one when a session is being resumed', async () => {
        vi.mocked(runClaude).mockResolvedValue({ sessionId: 'sess-1', summary: 'Finished' });
        const github = fakeGithub();
        const { bus } = fakeControlBus();
        const processor = createRunTaskProcessor({
            github,
            projectsRoot: '/projects',
            controlBus: bus,
            notify: vi.fn(),
            runTimeoutMs: 60_000,
        });

        await processor({ ...job, resumeSessionId: 'sess-1' });

        expect(git.checkoutExisting).toHaveBeenCalledWith('/projects/demo', 'task/42-fix-bug');
        expect(git.checkoutBranch).not.toHaveBeenCalled();
        expect(runClaude).toHaveBeenCalledWith(
            '/projects/demo',
            'Do the thing',
            expect.objectContaining({ resumeSessionId: 'sess-1' }),
        );
    });

    it('runs the .foreman.json setup command before Claude Code on a fresh run', async () => {
        vi.mocked(runClaude).mockResolvedValue({ sessionId: 'sess-1', summary: 'Finished' });
        vi.mocked(readProjectConfig).mockResolvedValue({ setup: 'npm install' });
        const github = fakeGithub();
        const { bus } = fakeControlBus();
        const processor = createRunTaskProcessor({
            github,
            projectsRoot: '/projects',
            controlBus: bus,
            notify: vi.fn(),
            runTimeoutMs: 60_000,
        });

        await processor(job);

        expect(runSetupCommand).toHaveBeenCalledWith('/projects/demo', 'npm install', expect.anything());
    });

    it('skips the setup command on resume', async () => {
        vi.mocked(runClaude).mockResolvedValue({ sessionId: 'sess-1', summary: 'Finished' });
        vi.mocked(readProjectConfig).mockResolvedValue({ setup: 'npm install' });
        const github = fakeGithub();
        const { bus } = fakeControlBus();
        const processor = createRunTaskProcessor({
            github,
            projectsRoot: '/projects',
            controlBus: bus,
            notify: vi.fn(),
            runTimeoutMs: 60_000,
        });

        await processor({ ...job, resumeSessionId: 'sess-1' });

        expect(runSetupCommand).not.toHaveBeenCalled();
    });

    it('passes .foreman.json env vars through to runClaude', async () => {
        vi.mocked(runClaude).mockResolvedValue({ sessionId: 'sess-1', summary: 'Finished' });
        vi.mocked(readProjectConfig).mockResolvedValue({ env: { NODE_ENV: 'test' } });
        const github = fakeGithub();
        const { bus } = fakeControlBus();
        const processor = createRunTaskProcessor({
            github,
            projectsRoot: '/projects',
            controlBus: bus,
            notify: vi.fn(),
            runTimeoutMs: 60_000,
        });

        await processor(job);

        expect(runClaude).toHaveBeenCalledWith(
            '/projects/demo',
            'Do the thing',
            expect.objectContaining({ env: { NODE_ENV: 'test' } }),
        );
    });

    it('uses .foreman.json timeoutMinutes instead of the global default when it times out', async () => {
        vi.mocked(runClaude).mockImplementation(abortableRunClaude('sess-1'));
        vi.mocked(readProjectConfig).mockResolvedValue({ timeoutMinutes: 1 / 3000 }); // 20ms
        const github = fakeGithub();
        const { bus } = fakeControlBus();
        const processor = createRunTaskProcessor({
            github,
            projectsRoot: '/projects',
            controlBus: bus,
            notify: vi.fn(),
            runTimeoutMs: 60_000, // would never fire within the test if this were the timeout actually used
        });

        await expect(processor(job)).rejects.toThrow();
        expect(github.setStatus).toHaveBeenLastCalledWith('erosinho', 'demo', 42, 'failed');
    });

    it('fails the run with a clear message when .foreman.json is invalid', async () => {
        vi.mocked(readProjectConfig).mockRejectedValue(new Error('.foreman.json is not valid JSON'));
        const github = fakeGithub();
        const { bus } = fakeControlBus();
        const processor = createRunTaskProcessor({
            github,
            projectsRoot: '/projects',
            controlBus: bus,
            notify: vi.fn(),
            runTimeoutMs: 60_000,
        });

        await expect(processor(job)).rejects.toThrow('.foreman.json is not valid JSON');
        expect(github.addComment).toHaveBeenCalledWith(
            'erosinho',
            'demo',
            42,
            expect.stringContaining('.foreman.json is not valid JSON'),
        );
        expect(runClaude).not.toHaveBeenCalled();
    });

    it('saves the session id and marks paused when a pause signal arrives mid-run', async () => {
        vi.mocked(runClaude).mockImplementation(abortableRunClaude('sess-99'));
        const github = fakeGithub();
        const notify = vi.fn(async () => undefined);
        const { bus, trigger } = fakeControlBus();
        const processor = createRunTaskProcessor({
            github,
            projectsRoot: '/projects',
            controlBus: bus,
            notify,
            runTimeoutMs: 60_000,
        });

        const promise = processor(job);
        await flush();
        trigger({ action: 'pause', issueNumber: 42 });
        const outcome = await promise;

        expect(outcome).toBe('paused');
        expect(github.setStatus).toHaveBeenLastCalledWith('erosinho', 'demo', 42, 'paused');
        expect(github.addComment).toHaveBeenCalledWith('erosinho', 'demo', 42, expect.stringContaining('sess-99'));
        expect(git.commitAll).not.toHaveBeenCalled();
        expect(git.discardAndDeleteBranch).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
    });

    it('discards the branch and marks cancelled when a cancel signal arrives mid-run', async () => {
        vi.mocked(runClaude).mockImplementation(abortableRunClaude('sess-99'));
        const github = fakeGithub();
        const { bus, trigger } = fakeControlBus();
        const processor = createRunTaskProcessor({
            github,
            projectsRoot: '/projects',
            controlBus: bus,
            notify: vi.fn(),
            runTimeoutMs: 60_000,
        });

        const promise = processor(job);
        await flush();
        trigger({ action: 'cancel', issueNumber: 42 });
        const outcome = await promise;

        expect(outcome).toBe('cancelled');
        expect(git.discardAndDeleteBranch).toHaveBeenCalledWith('/projects/demo', 'task/42-fix-bug');
        expect(github.setStatus).toHaveBeenLastCalledWith('erosinho', 'demo', 42, 'cancelled');
    });

    it('ignores a control message meant for a different issue on the same repo', async () => {
        vi.mocked(runClaude).mockImplementation(abortableRunClaude('sess-1'));
        const github = fakeGithub();
        const { bus, trigger } = fakeControlBus();
        const processor = createRunTaskProcessor({
            github,
            projectsRoot: '/projects',
            controlBus: bus,
            notify: vi.fn(),
            runTimeoutMs: 15,
        });

        const promise = processor(job);
        await flush();
        trigger({ action: 'pause', issueNumber: 999 });

        // The real timeout still fires and the run is classified as failed, not paused — proving the
        // mismatched-issue message never set the interruption flag.
        await expect(promise).rejects.toThrow();
        expect(github.setStatus).toHaveBeenLastCalledWith('erosinho', 'demo', 42, 'failed');
    });

    it('kills the run and marks failed after the timeout elapses', async () => {
        vi.mocked(runClaude).mockImplementation(abortableRunClaude('sess-1'));
        const github = fakeGithub();
        const notify = vi.fn(async () => undefined);
        const { bus } = fakeControlBus();
        const processor = createRunTaskProcessor({
            github,
            projectsRoot: '/projects',
            controlBus: bus,
            notify,
            runTimeoutMs: 10,
        });

        const outcome = processor(job);

        await expect(outcome).rejects.toThrow();
        expect(github.setStatus).toHaveBeenLastCalledWith('erosinho', 'demo', 42, 'failed');
        expect(github.addComment).toHaveBeenCalledWith('erosinho', 'demo', 42, expect.stringContaining('timed out'));
        expect(notify).toHaveBeenCalledWith(expect.stringContaining('failed'));
    });

    it('marks failed and rethrows on a genuine error', async () => {
        vi.mocked(runClaude).mockRejectedValue(new Error('claude exited with code 1'));
        const github = fakeGithub();
        const { bus } = fakeControlBus();
        const processor = createRunTaskProcessor({
            github,
            projectsRoot: '/projects',
            controlBus: bus,
            notify: vi.fn(),
            runTimeoutMs: 60_000,
        });

        await expect(processor(job)).rejects.toThrow('claude exited with code 1');
        expect(github.setStatus).toHaveBeenLastCalledWith('erosinho', 'demo', 42, 'failed');
    });
});
