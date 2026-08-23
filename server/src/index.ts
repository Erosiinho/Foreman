import 'dotenv/config';
import { createApp } from './server';
import { OctokitGitHub } from './github/client';
import BullTaskQueue from './queue/task.queue';

async function main(): Promise<void> {
    const githubToken = process.env.GITHUB_TOKEN;
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    if (!githubToken) throw new Error('GITHUB_TOKEN is required');
    if (!webhookSecret) throw new Error('GITHUB_WEBHOOK_SECRET is required');

    const github = new OctokitGitHub(githubToken);
    const taskQueue = new BullTaskQueue(redisUrl);

    const { server } = createApp(github, taskQueue, webhookSecret);
    const port = Number(process.env.PORT) || 3000;
    server.listen(port, () => {
        console.log(`[server]: listening on port ${port}`);
    });
}

main().catch((err) => {
    console.error('[server]: fatal error', err);
    process.exit(1);
});
