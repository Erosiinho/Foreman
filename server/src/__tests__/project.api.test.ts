import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, fakeRepo } from './fixtures';

describe('Project REST API', () => {
    it('lists repos visible to the token with zeroed task counts', async () => {
        const { app } = buildApp([fakeRepo('erosinho', 'demo')]);

        const res = await request(app).get('/projects');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([
            {
                owner: 'erosinho',
                repo: 'demo',
                fullName: 'erosinho/demo',
                private: false,
                url: 'https://github.com/erosinho/demo',
                taskCounts: { todo: 0, 'in-progress': 0, paused: 0, done: 0, failed: 0, cancelled: 0 },
            },
        ]);
    });

    it('counts tasks by status per project', async () => {
        const { app } = buildApp([fakeRepo('erosinho', 'demo')]);
        await request(app).post('/tasks').send({ owner: 'erosinho', repo: 'demo', title: 'A', description: 'a' });
        await request(app).post('/tasks').send({ owner: 'erosinho', repo: 'demo', title: 'B', description: 'b' });

        const res = await request(app).get('/projects');

        expect(res.body[0].taskCounts.todo).toBe(2);
    });

    it('returns an empty list when the token has no repos', async () => {
        const { app } = buildApp();

        const res = await request(app).get('/projects');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});
