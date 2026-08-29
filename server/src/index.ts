import 'dotenv/config';
import { createApp } from './server';
import { OctokitGitHub } from './github/client';
import BullTaskQueue from './queue/task.queue';

async function main(): Promise<void> {
    const githubToken = process.env.GITHUB_TOKEN;
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const pollIntervalMs = (Number(process.env.POLL_INTERVAL_SECONDS) || 30) * 1000;

    if (!githubToken) throw new Error('GITHUB_TOKEN is required');

    const github = new OctokitGitHub(githubToken);
    const taskQueue = new BullTaskQueue(redisUrl);

    const { server, poller } = createApp(github, taskQueue, pollIntervalMs);
    poller.start();

    const port = Number(process.env.PORT) || 3000;
    server.listen(port, () => {
        console.log(`[server]: listening on port ${port}`);
    });
}

main().catch((err) => {
    console.error('[server]: fatal error', err);
    process.exit(1);
});
