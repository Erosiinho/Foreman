import { Queue } from 'bullmq';
import Redis from 'ioredis';
import IRunTaskJob from '../types/IRunTaskJob';

export const TASKS_QUEUE_NAME = 'tasks';

export interface ControlMessage {
    action: 'pause' | 'cancel';
    issueNumber: number;
}

export interface ITaskQueue {
    enqueueRun(job: IRunTaskJob): Promise<void>;
    publishControl(owner: string, repo: string, message: ControlMessage): Promise<void>;
}

export function controlChannel(owner: string, repo: string): string {
    return `control:${owner}/${repo}`;
}

/** Deterministic jobId so a GitHub webhook redelivery (or opened+labeled firing back to back) can't enqueue a duplicate run. */
function jobId(job: IRunTaskJob): string {
    return `task-${job.owner}-${job.repo}-${job.issueNumber}`;
}

export default class BullTaskQueue implements ITaskQueue {
    private queue: Queue<IRunTaskJob>;
    private publisher: Redis;

    constructor(redisUrl: string) {
        // maxRetriesPerRequest: null is BullMQ's documented requirement for its Redis connections.
        const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
        this.queue = new Queue<IRunTaskJob>(TASKS_QUEUE_NAME, {
            connection,
            defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
        });
        this.publisher = new Redis(redisUrl);
    }

    async enqueueRun(job: IRunTaskJob): Promise<void> {
        await this.queue.add('run', job, { jobId: jobId(job) });
    }

    async publishControl(owner: string, repo: string, message: ControlMessage): Promise<void> {
        await this.publisher.publish(controlChannel(owner, repo), JSON.stringify(message));
    }
}
