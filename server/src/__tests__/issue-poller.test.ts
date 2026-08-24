import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, fakeRepo } from './fixtures';

describe('IssuePoller', () => {
    it('enqueues a run job for every todo-labeled issue found across repos', async () => {
        const { app, runJobs, poller } = buildApp([fakeRepo('erosinho', 'demo')]);
        const createRes = await request(app)
            .post('/tasks')
            .send({ owner: 'erosinho', repo: 'demo', title: 'Fix bug', description: 'Do the thing' });
        runJobs.length = 0; // createTask itself doesn't enqueue — clear just in case

        await poller.pollOnce();

        expect(runJobs).toEqual([
            { owner: 'erosinho', repo: 'demo', issueNumber: createRes.body.number, title: 'Fix bug', description: 'Do the thing' },
        ]);
    });

    it('does not enqueue issues that are not in the todo state', async () => {
        const { app, runJobs, poller, setLabels } = buildApp([fakeRepo('erosinho', 'demo')]);
        const createRes = await request(app)
            .post('/tasks')
            .send({ owner: 'erosinho', repo: 'demo', title: 'Fix bug', description: 'Do the thing' });
        setLabels('erosinho', 'demo', createRes.body.number, ['in-progress']);
        runJobs.length = 0;

        await poller.pollOnce();

        expect(runJobs).toHaveLength(0);
    });
});
