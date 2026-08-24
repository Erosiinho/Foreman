import ProjectRepository from '../repositories/project.repository';
import TaskRepository from '../repositories/task.repository';
import { ITaskQueue } from './task.queue';

/**
 * Replaces the GitHub webhook trigger: periodically re-reads every `todo`-labeled issue across the
 * user's repos and enqueues a run for it. Safe to re-poll the same issue on every tick — the queue's
 * deterministic jobId (task.queue.ts) makes a duplicate enqueueRun for a still-queued/active issue a
 * no-op, and the worker flips the label off `todo` as soon as it picks the job up (run-task.processor.ts).
 */
export default class IssuePoller {
    private timer?: NodeJS.Timeout;

    constructor(
        private projectRepository: ProjectRepository,
        private taskRepository: TaskRepository,
        private taskQueue: ITaskQueue,
        private intervalMs: number,
    ) {}

    start(): void {
        this.pollOnce();
        this.timer = setInterval(() => this.pollOnce(), this.intervalMs);
    }

    stop(): void {
        clearInterval(this.timer);
    }

    async pollOnce(): Promise<void> {
        try {
            const repos = await this.projectRepository.list();
            for (const { owner, repo } of repos) {
                const tasks = await this.taskRepository.list(owner, repo);
                for (const task of tasks.filter((task) => task.status === 'todo')) {
                    await this.taskQueue.enqueueRun({
                        owner,
                        repo,
                        issueNumber: task.number,
                        title: task.title,
                        description: task.description,
                    });
                }
            }
        } catch (err) {
            console.error('[poller]: failed to poll for todo issues', err);
        }
    }
}
