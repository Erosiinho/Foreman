import { Express } from 'express';
import IGitHub from '../github/client';
import { ControlMessage, ITaskQueue } from '../queue/task.queue';
import IRunTaskJob from '../types/IRunTaskJob';
import { createApp } from '../server';

interface FakeIssue {
    number: number;
    title: string;
    body: string;
    labels: { name: string }[];
    comments: string[];
    updated_at: string;
}

interface FakeRepo {
    owner: { login: string };
    name: string;
    full_name: string;
    private: boolean;
    html_url: string;
}

export interface FakePrFile {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
}

/** In-memory stand-in for Octokit's `.rest.issues.*` / `.rest.repos.*` / `.rest.pulls.*` surface — only what the repositories call. */
function fakeGitHub(repos: FakeRepo[] = []): {
    github: IGitHub;
    addComment: (owner: string, repo: string, number: number, body: string) => void;
    setPrFiles: (owner: string, repo: string, prNumber: number, files: FakePrFile[]) => void;
} {
    const issuesByRepo = new Map<string, FakeIssue[]>();
    const prFiles = new Map<string, FakePrFile[]>();
    let nextNumber = 1;

    const key = (owner: string, repo: string) => `${owner}/${repo}`;
    const findIssue = (owner: string, repo: string, number: number) =>
        (issuesByRepo.get(key(owner, repo)) ?? []).find((issue) => issue.number === number);

    const listForAuthenticatedUser = async () => ({ data: repos });
    const listForRepo = async ({ owner, repo }: any) => ({ data: issuesByRepo.get(key(owner, repo)) ?? [] });
    const listFiles = async ({ owner, repo, pull_number }: any) => ({
        data: prFiles.get(`${key(owner, repo)}#${pull_number}`) ?? [],
    });

    const client = {
        paginate: async (fn: (params: unknown) => Promise<{ data: unknown }>, params: unknown) => (await fn(params)).data,
        rest: {
            repos: {
                listForAuthenticatedUser,
            },
            pulls: {
                listFiles,
            },
            issues: {
                async create({ owner, repo, title, body, labels }: any) {
                    const issue: FakeIssue = {
                        number: nextNumber++,
                        title,
                        body: body ?? '',
                        labels: (labels ?? []).map((name: string) => ({ name })),
                        comments: [],
                        updated_at: new Date().toISOString(),
                    };
                    const list = issuesByRepo.get(key(owner, repo)) ?? [];
                    list.push(issue);
                    issuesByRepo.set(key(owner, repo), list);
                    return { data: issue };
                },
                async get({ owner, repo, issue_number }: any) {
                    const issue = findIssue(owner, repo, issue_number);
                    if (!issue) {
                        const notFound = Object.assign(new Error('Not Found'), { status: 404 });
                        throw notFound;
                    }
                    return { data: issue };
                },
                listForRepo,
                async removeLabel({ owner, repo, issue_number, name }: any) {
                    const issue = findIssue(owner, repo, issue_number);
                    if (issue) issue.labels = issue.labels.filter((label) => label.name !== name);
                },
                async addLabels({ owner, repo, issue_number, labels }: any) {
                    const issue = findIssue(owner, repo, issue_number);
                    if (issue) issue.labels.push(...labels.map((name: string) => ({ name })));
                },
                async createComment({ owner, repo, issue_number, body }: any) {
                    findIssue(owner, repo, issue_number)?.comments.push(body);
                },
                async listComments({ owner, repo, issue_number }: any) {
                    const issue = findIssue(owner, repo, issue_number);
                    return { data: (issue?.comments ?? []).map((body) => ({ body })) };
                },
            },
        },
    };

    return {
        github: { getClient: <T>() => client as unknown as T },
        addComment: (owner, repo, number, body) => findIssue(owner, repo, number)?.comments.push(body),
        setPrFiles: (owner, repo, prNumber, files) => prFiles.set(`${key(owner, repo)}#${prNumber}`, files),
    };
}

function fakeQueue(): { queue: ITaskQueue; runJobs: IRunTaskJob[]; controlMessages: { owner: string; repo: string; message: ControlMessage }[] } {
    const runJobs: IRunTaskJob[] = [];
    const controlMessages: { owner: string; repo: string; message: ControlMessage }[] = [];

    const queue: ITaskQueue = {
        async enqueueRun(job) {
            runJobs.push(job);
        },
        async publishControl(owner, repo, message) {
            controlMessages.push({ owner, repo, message });
        },
    };

    return { queue, runJobs, controlMessages };
}

export const TEST_WEBHOOK_SECRET = 'test-secret';

export function fakeRepo(owner: string, repo: string, overrides: Partial<FakeRepo> = {}): FakeRepo {
    return {
        owner: { login: owner },
        name: repo,
        full_name: `${owner}/${repo}`,
        private: false,
        html_url: `https://github.com/${owner}/${repo}`,
        ...overrides,
    };
}

export function buildApp(repos: FakeRepo[] = []): {
    app: Express;
    runJobs: IRunTaskJob[];
    controlMessages: { owner: string; repo: string; message: ControlMessage }[];
    addComment: (owner: string, repo: string, number: number, body: string) => void;
    setPrFiles: (owner: string, repo: string, prNumber: number, files: FakePrFile[]) => void;
} {
    const { github, addComment, setPrFiles } = fakeGitHub(repos);
    const { queue, runJobs, controlMessages } = fakeQueue();
    const { app } = createApp(github, queue, TEST_WEBHOOK_SECRET);
    return { app, runJobs, controlMessages, addComment, setPrFiles };
}
