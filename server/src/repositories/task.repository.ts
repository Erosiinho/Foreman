import { Octokit } from '@octokit/rest';
import IGitHub from '../github/client';
import ITask, { STATUS_LABELS, TaskStatus } from '../types/ITask';
import ITaskDiff from '../types/ITaskDiff';
import TtlCache from '../lib/ttl-cache';

const SESSION_ID_COMMENT_RE = /<!-- foreman:session_id=(\S+) -->/;
// Matches the "PR: <url>" line run-task.processor.ts posts on completion (worker/src/jobs/run-task.processor.ts).
const PR_COMMENT_RE = /PR:\s*(https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+))/;

function extractStatus(labels: { name?: string }[]): TaskStatus | undefined {
    return STATUS_LABELS.find((status) => labels.some((label) => label.name === status));
}

function repoKey(owner: string, repo: string): string {
    return `${owner}/${repo}`;
}

export default class TaskRepository {
    private listCache: TtlCache<ITask[]>;

    /** cacheTtlMs: see ProjectRepository — same reasoning, kept in sync with the poller interval.
     *  Note this only smooths out re-reads within this server process: a status change made by the
     *  worker (a separate process, driven by GithubClient, not this repository) isn't reflected
     *  here until the cache entry expires — worst case one poll interval, same as today's poller lag. */
    constructor(
        private github: IGitHub,
        cacheTtlMs: number,
    ) {
        this.listCache = new TtlCache(cacheTtlMs);
    }

    private get client(): Octokit {
        return this.github.getClient<Octokit>();
    }

    async create(owner: string, repo: string, title: string, description: string): Promise<ITask> {
        const { data } = await this.client.rest.issues.create({
            owner,
            repo,
            title,
            body: description,
            labels: ['todo'],
        });
        // A freshly created issue must show up immediately, not after the cache expires.
        this.listCache.invalidate(repoKey(owner, repo));
        return {
            owner,
            repo,
            number: data.number,
            title: data.title,
            description: data.body ?? '',
            status: extractStatus(data.labels as { name?: string }[]) ?? 'todo',
            updatedAt: data.updated_at,
        };
    }

    async get(owner: string, repo: string, number: number): Promise<ITask | null> {
        try {
            const { data } = await this.client.rest.issues.get({ owner, repo, issue_number: number });
            const status = extractStatus(data.labels as { name?: string }[]);
            if (!status) return null;
            return {
                owner,
                repo,
                number: data.number,
                title: data.title,
                description: data.body ?? '',
                status,
                updatedAt: data.updated_at,
            };
        } catch (err) {
            if ((err as { status?: number }).status === 404) return null;
            throw err;
        }
    }

    /**
     * GitHub's `labels` filter on listForRepo is an AND match, not OR — it can't express "any
     * Foreman status label" in one call. Fetch all issues instead and filter client-side; fine at
     * personal-project issue volumes. Paginated (not a single capped call) so task history beyond
     * the first 30 issues doesn't silently disappear.
     */
    /** Shared cache: the HTTP endpoint and the background poller both call this and reuse
     *  whichever fetched first (see TtlCache). */
    async list(owner: string, repo: string): Promise<ITask[]> {
        return this.listCache.get(repoKey(owner, repo), () => this.fetchList(owner, repo));
    }

    private async fetchList(owner: string, repo: string): Promise<ITask[]> {
        const data = await this.client.paginate(this.client.rest.issues.listForRepo, {
            owner,
            repo,
            state: 'all',
            per_page: 100,
        });
        const tasks: ITask[] = [];
        for (const issue of data) {
            const status = extractStatus(issue.labels as { name?: string }[]);
            if (!status) continue;
            tasks.push({
                owner,
                repo,
                number: issue.number,
                title: issue.title,
                description: issue.body ?? '',
                status,
                updatedAt: issue.updated_at,
            });
        }
        return tasks;
    }

    async setStatus(owner: string, repo: string, number: number, status: TaskStatus): Promise<void> {
        await Promise.all(
            STATUS_LABELS.filter((label) => label !== status).map((label) =>
                this.client.rest.issues
                    .removeLabel({ owner, repo, issue_number: number, name: label })
                    .catch(() => undefined),
            ),
        );
        await this.client.rest.issues.addLabels({ owner, repo, issue_number: number, labels: [status] });
    }

    async addComment(owner: string, repo: string, number: number, body: string): Promise<void> {
        await this.client.rest.issues.createComment({ owner, repo, issue_number: number, body });
    }

    async getSessionId(owner: string, repo: string, number: number): Promise<string | undefined> {
        const { data } = await this.client.rest.issues.listComments({ owner, repo, issue_number: number });
        for (const comment of data) {
            const match = comment.body?.match(SESSION_ID_COMMENT_RE);
            if (match) return match[1];
        }
        return undefined;
    }

    private async getPrNumber(owner: string, repo: string, number: number): Promise<number | undefined> {
        const { data } = await this.client.rest.issues.listComments({ owner, repo, issue_number: number });
        for (const comment of data) {
            const match = comment.body?.match(PR_COMMENT_RE);
            if (match) return Number(match[2]);
        }
        return undefined;
    }

    /** Merges the task's PR; returns false if the task hasn't opened one yet. */
    async mergePullRequest(owner: string, repo: string, number: number): Promise<boolean> {
        const prNumber = await this.getPrNumber(owner, repo, number);
        if (!prNumber) return false;
        await this.client.rest.pulls.merge({ owner, repo, pull_number: prNumber });
        return true;
    }

    /** The changed-files summary for a task's PR — undefined if the run hasn't opened one yet. */
    async getDiff(owner: string, repo: string, number: number): Promise<ITaskDiff | undefined> {
        const prNumber = await this.getPrNumber(owner, repo, number);
        if (!prNumber) return undefined;

        const files = await this.client.paginate(this.client.rest.pulls.listFiles, {
            owner,
            repo,
            pull_number: prNumber,
            per_page: 100,
        });

        return {
            prNumber,
            prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
            additions: files.reduce((sum, file) => sum + file.additions, 0),
            deletions: files.reduce((sum, file) => sum + file.deletions, 0),
            files: files.map((file) => ({
                filename: file.filename,
                status: file.status,
                additions: file.additions,
                deletions: file.deletions,
                changes: file.changes,
                patch: file.patch,
            })),
        };
    }
}
