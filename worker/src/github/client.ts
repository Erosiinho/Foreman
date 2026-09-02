import { Octokit } from '@octokit/rest';

const STATUS_LABELS = ['todo', 'in-progress', 'paused', 'done', 'failed', 'cancelled'] as const;
export type TaskStatus = (typeof STATUS_LABELS)[number];

/**
 * Minimal GitHub wrapper for what the worker needs — label transitions + comments. Mirrors
 * server/src/github/client.ts + task.repository.ts, trimmed down (no shared package between
 * server and worker).
 */
export default class GithubClient {
    private client: Octokit;

    constructor(token: string) {
        this.client = new Octokit({ auth: token });
    }

    async setStatus(owner: string, repo: string, issueNumber: number, status: TaskStatus): Promise<void> {
        await Promise.all(
            STATUS_LABELS.filter((label) => label !== status).map((label) =>
                this.client.rest.issues
                    .removeLabel({ owner, repo, issue_number: issueNumber, name: label })
                    .catch(() => undefined),
            ),
        );
        await this.client.rest.issues.addLabels({ owner, repo, issue_number: issueNumber, labels: [status] });
    }

    async addComment(owner: string, repo: string, issueNumber: number, body: string): Promise<void> {
        await this.client.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
    }
}
