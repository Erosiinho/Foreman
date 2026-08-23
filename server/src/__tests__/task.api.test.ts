import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, TEST_WEBHOOK_SECRET } from './fixtures';

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

    describe('GitHub webhook', () => {
        it('rejects a delivery with a missing signature', async () => {
            const { app } = buildApp();

            const res = await request(app)
                .post('/webhooks/github')
                .set('Content-Type', 'application/json')
                .send(JSON.stringify({ action: 'opened' }));

            expect(res.status).toBe(401);
        });

        it('rejects a delivery with an invalid signature', async () => {
            const { app } = buildApp();

            const res = await request(app)
                .post('/webhooks/github')
                .set('Content-Type', 'application/json')
                .set('x-hub-signature-256', 'sha256=deadbeef')
                .send(JSON.stringify({ action: 'opened' }));

            expect(res.status).toBe(401);
        });

        it('accepts a valid delivery and enqueues a run job for an issue labeled todo', async () => {
            const { app, runJobs } = buildApp();
            const payload = JSON.stringify({
                action: 'opened',
                issue: { number: 42, title: 'Fix bug', body: 'Do the thing', labels: [{ name: 'todo' }] },
                repository: { name: 'demo', owner: { login: 'erosinho' } },
            });
            const signature = 'sha256=' + createHmac('sha256', TEST_WEBHOOK_SECRET).update(payload).digest('hex');

            const res = await request(app)
                .post('/webhooks/github')
                .set('Content-Type', 'application/json')
                .set('x-hub-signature-256', signature)
                .set('x-github-event', 'issues')
                .send(payload);

            expect(res.status).toBe(204);
            expect(runJobs).toEqual([
                { owner: 'erosinho', repo: 'demo', issueNumber: 42, title: 'Fix bug', description: 'Do the thing' },
            ]);
        });

        it('ignores a valid delivery for an issue without the todo label', async () => {
            const { app, runJobs } = buildApp();
            const payload = JSON.stringify({
                action: 'opened',
                issue: { number: 42, title: 'Fix bug', body: 'Do the thing', labels: [{ name: 'done' }] },
                repository: { name: 'demo', owner: { login: 'erosinho' } },
            });
            const signature = 'sha256=' + createHmac('sha256', TEST_WEBHOOK_SECRET).update(payload).digest('hex');

            const res = await request(app)
                .post('/webhooks/github')
                .set('Content-Type', 'application/json')
                .set('x-hub-signature-256', signature)
                .set('x-github-event', 'issues')
                .send(payload);

            expect(res.status).toBe(204);
            expect(runJobs).toHaveLength(0);
        });
    });
});
