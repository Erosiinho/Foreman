import 'dotenv/config';
import { DelayedError, Worker } from 'bullmq';
import Redis from 'ioredis';
import GithubClient from './github/client';
import { createRunTaskProcessor } from './jobs/run-task.processor';
import ControlBus from './queue/control-bus';
import RepoLock, { RELOCK_DELAY_MS } from './queue/repo-lock';
import { createNotifier } from './lib/telegram';
import IRunTaskJob from './types/IRunTaskJob';

// Must match TASKS_QUEUE_NAME in server/src/queue/task.queue.ts — no shared package between the two.
const TASKS_QUEUE_NAME = 'tasks';

async function main(): Promise<void> {
    const githubToken = process.env.GITHUB_TOKEN;
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const projectsRoot = process.env.PROJECTS_ROOT || '/projects';
    const concurrency = Number(process.env.WORKER_CONCURRENCY) || 4;
    const runTimeoutMs = (Number(process.env.RUN_TIMEOUT_MINUTES) || 45) * 60 * 1000;
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;

    if (!githubToken) throw new Error('GITHUB_TOKEN is required');

    const github = new GithubClient(githubToken);
    const controlBus = new ControlBus(redisUrl);
    const notify = createNotifier(
        telegramBotToken && telegramChatId ? { botToken: telegramBotToken, chatId: telegramChatId } : undefined,
    );
    const processor = createRunTaskProcessor({ github, projectsRoot, controlBus, notify, runTimeoutMs });

    // maxRetriesPerRequest: null is BullMQ's documented requirement for its Redis connections.
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const repoLock = new RepoLock(new Redis(redisUrl));

    // concurrency > 1 lets different repos run in parallel; RepoLock still caps each repo at one active-or-paused task.
    const worker = new Worker<IRunTaskJob>(
        TASKS_QUEUE_NAME,
        async (job, token) => {
            const { owner, repo, issueNumber } = job.data;
            const acquired = await repoLock.tryAcquire(owner, repo, issueNumber, runTimeoutMs);
            if (!acquired) {
                await job.moveToDelayed(Date.now() + RELOCK_DELAY_MS, token);
                throw new DelayedError();
            }

            try {
                const outcome = await processor(job.data);
                if (outcome === 'paused') {
                    await repoLock.hold(owner, repo, issueNumber);
                } else {
                    await repoLock.release(owner, repo, issueNumber);
                }
                return outcome;
            } catch (err) {
                await repoLock.release(owner, repo, issueNumber);
                throw err;
            }
        },
        { connection, concurrency },
    );

    worker.on('completed', (job) => console.log(`[worker] task-${job.data.issueNumber}: ${job.returnvalue}`));
    worker.on('failed', (job, err) => console.error(`[worker] task-${job?.data.issueNumber} failed:`, err));

    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        process.on(signal, async () => {
            console.log(`[worker]: ${signal} received, shutting down`);
            await worker.close();
            await controlBus.close();
            process.exit(0);
        });
    }

    console.log(`[worker]: listening for tasks (concurrency=${concurrency}, timeout=${runTimeoutMs / 60000}min)`);
}

main().catch((err) => {
    console.error('[worker]: fatal error', err);
    process.exit(1);
});
