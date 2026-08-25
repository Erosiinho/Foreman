import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from './fixtures';

describe('Task REST API', () => {
    it('creates a task as a GitHub issue with the todo label', async () => {
        const { app } = buildApp();

        const res = await request(app)
            .post('/tasks')
            .send({ owner: 'erosinho', repo: 'demo', title: 'Fix bug', description: 'Do the thing' });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('todo');
        expect(res.body.number).toBeTypeOf('number');
    });

    it('rejects an invalid create-task body', async () => {
        const { app } = buildApp();

        const res = await request(app).post('/tasks').send({ owner: 'erosinho', repo: 'demo', title: '' });

        expect(res.status).toBe(400);
    });

    it('lists tasks for a repo', async () => {
        const { app } = buildApp();
        await request(app).post('/tasks').send({ owner: 'erosinho', repo: 'demo', title: 'A', description: 'a' });
        await request(app).post('/tasks').send({ owner: 'erosinho', repo: 'demo', title: 'B', description: 'b' });

        const res = await request(app).get('/tasks?owner=erosinho&repo=demo');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
    });

    it('requires owner and repo query params to list tasks', async () => {
        const { app } = buildApp();

        const res = await request(app).get('/tasks');

        expect(res.status).toBe(400);
    });

    it('returns 404 pausing an unknown task', async () => {
        const { app } = buildApp();

        const res = await request(app).post('/tasks/erosinho/demo/999/pause');

        expect(res.status).toBe(404);
    });

    it('publishes a control message when pausing a known task', async () => {
        const { app, controlMessages } = buildApp();
        const createRes = await request(app)
            .post('/tasks')
            .send({ owner: 'erosinho', repo: 'demo', title: 'Fix bug', description: 'Do the thing' });

        const res = await request(app).post(`/tasks/erosinho/demo/${createRes.body.number}/pause`);

        expect(res.status).toBe(202);
        expect(controlMessages).toEqual([
            { owner: 'erosinho', repo: 'demo', message: { action: 'pause', issueNumber: createRes.body.number } },
        ]);
    });

    it('enqueues a run job when resuming a known task', async () => {
        const { app, runJobs } = buildApp();
        const createRes = await request(app)
            .post('/tasks')
            .send({ owner: 'erosinho', repo: 'demo', title: 'Fix bug', description: 'Do the thing' });

        const res = await request(app).post(`/tasks/erosinho/demo/${createRes.body.number}/resume`);

        expect(res.status).toBe(202);
        expect(runJobs).toHaveLength(1);
        expect(runJobs[0]).toMatchObject({ owner: 'erosinho', repo: 'demo', issueNumber: createRes.body.number });
    });

    it('carries the stored session_id when resuming a paused task', async () => {
        const { app, runJobs, addComment } = buildApp();
        const createRes = await request(app)
            .post('/tasks')
            .send({ owner: 'erosinho', repo: 'demo', title: 'Fix bug', description: 'Do the thing' });
        addComment('erosinho', 'demo', createRes.body.number, 'PR: n/a\n\n<!-- foreman:session_id=sess-42 -->');

        const res = await request(app).post(`/tasks/erosinho/demo/${createRes.body.number}/resume`);

        expect(res.status).toBe(202);
        expect(runJobs[0]).toMatchObject({ resumeSessionId: 'sess-42' });
    });

    it('returns 404 cancelling an unknown task', async () => {
        const { app } = buildApp();

        const res = await request(app).post('/tasks/erosinho/demo/999/cancel');

        expect(res.status).toBe(404);
    });

    it('publishes a control message when cancelling a known task', async () => {
        const { app, controlMessages } = buildApp();
        const createRes = await request(app)
            .post('/tasks')
            .send({ owner: 'erosinho', repo: 'demo', title: 'Fix bug', description: 'Do the thing' });

        const res = await request(app).post(`/tasks/erosinho/demo/${createRes.body.number}/cancel`);

        expect(res.status).toBe(202);
        expect(controlMessages).toEqual([
            { owner: 'erosinho', repo: 'demo', message: { action: 'cancel', issueNumber: createRes.body.number } },
        ]);
    });

    it('returns 404 merging an unknown task', async () => {
        const { app } = buildApp();

        const res = await request(app).post('/tasks/erosinho/demo/999/merge');

        expect(res.status).toBe(404);
    });

    it("returns 404 merging a task that hasn't opened a PR yet", async () => {
        const { app } = buildApp();
        const createRes = await request(app)
            .post('/tasks')
            .send({ owner: 'erosinho', repo: 'demo', title: 'Fix bug', description: 'Do the thing' });

        const res = await request(app).post(`/tasks/erosinho/demo/${createRes.body.number}/merge`);

        expect(res.status).toBe(404);
    });

    it("merges the task's PR once a PR comment is posted", async () => {
        const { app, addComment, mergedPulls } = buildApp();
        const createRes = await request(app)
            .post('/tasks')
            .send({ owner: 'erosinho', repo: 'demo', title: 'Fix bug', description: 'Do the thing' });
        const number = createRes.body.number;
        addComment('erosinho', 'demo', number, 'PR: https://github.com/erosinho/demo/pull/7');

        const res = await request(app).post(`/tasks/erosinho/demo/${number}/merge`);

        expect(res.status).toBe(202);
        expect(mergedPulls).toEqual(['erosinho/demo#7']);
    });

    it('returns 404 for the diff of an unknown task', async () => {
        const { app } = buildApp();

        const res = await request(app).get('/tasks/erosinho/demo/999/diff');

        expect(res.status).toBe(404);
    });

    it("returns 404 for the diff of a task that hasn't opened a PR yet", async () => {
        const { app } = buildApp();
        const createRes = await request(app)
            .post('/tasks')
            .send({ owner: 'erosinho', repo: 'demo', title: 'Fix bug', description: 'Do the thing' });

        const res = await request(app).get(`/tasks/erosinho/demo/${createRes.body.number}/diff`);

        expect(res.status).toBe(404);
    });

    it('returns the changed-files summary once a PR comment is posted', async () => {
        const { app, addComment, setPrFiles } = buildApp();
        const createRes = await request(app)
            .post('/tasks')
            .send({ owner: 'erosinho', repo: 'demo', title: 'Fix bug', description: 'Do the thing' });
        const number = createRes.body.number;
        addComment('erosinho', 'demo', number, 'PR: https://github.com/erosinho/demo/pull/7');
        setPrFiles('erosinho', 'demo', 7, [
            { filename: 'src/a.ts', status: 'modified', additions: 3, deletions: 1, changes: 4, patch: '@@ -1 +1,3 @@\n+added' },
            { filename: 'src/b.ts', status: 'added', additions: 10, deletions: 0, changes: 10 },
        ]);

        const res = await request(app).get(`/tasks/erosinho/demo/${number}/diff`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            prNumber: 7,
            prUrl: 'https://github.com/erosinho/demo/pull/7',
            additions: 13,
            deletions: 1,
            files: [
                { filename: 'src/a.ts', status: 'modified', additions: 3, deletions: 1, changes: 4, patch: '@@ -1 +1,3 @@\n+added' },
                { filename: 'src/b.ts', status: 'added', additions: 10, deletions: 0, changes: 10 },
            ],
        });
    });
});
