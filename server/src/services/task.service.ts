import TaskRepository from '../repositories/task.repository';
import { ITaskQueue } from '../queue/task.queue';
import { BadRequestError, NotFoundError } from '../http/errors';
import ITask from '../types/ITask';
import ITaskDiff from '../types/ITaskDiff';

export default class TaskService {
    constructor(
        private taskRepository: TaskRepository,
        private taskQueue: ITaskQueue,
    ) {}

    async createTask(owner: string, repo: string, title: string, description: string): Promise<ITask> {
        return this.taskRepository.create(owner, repo, title, description);
    }

    async listTasks(owner: string, repo: string): Promise<ITask[]> {
        return this.taskRepository.list(owner, repo);
    }

    async getTaskDiff(owner: string, repo: string, number: number): Promise<ITaskDiff> {
        const task = await this.taskRepository.get(owner, repo, number);
        if (!task) throw new NotFoundError(`No task #${number} on ${owner}/${repo}`);
        const diff = await this.taskRepository.getDiff(owner, repo, number);
        if (!diff) throw new NotFoundError(`Task #${number} on ${owner}/${repo} hasn't opened a PR yet`);
        return diff;
    }

    /** Publishes the pause request; the worker subscribes to the same control channel (worker/src/queue/control-bus.ts). */
    async pauseTask(owner: string, repo: string, number: number): Promise<void> {
        const task = await this.taskRepository.get(owner, repo, number);
        if (!task) throw new NotFoundError(`No task #${number} on ${owner}/${repo}`);
        await this.taskQueue.publishControl(owner, repo, { action: 'pause', issueNumber: number });
    }

    async resumeTask(owner: string, repo: string, number: number): Promise<void> {
        const task = await this.taskRepository.get(owner, repo, number);
        if (!task) throw new NotFoundError(`No task #${number} on ${owner}/${repo}`);
        const resumeSessionId = await this.taskRepository.getSessionId(owner, repo, number);
        await this.taskQueue.enqueueRun({
            owner,
            repo,
            issueNumber: number,
            title: task.title,
            description: task.description,
            resumeSessionId,
        });
    }

    /** Publishes the cancel request; the worker aborts the run, discards uncommitted changes, and deletes the branch. */
    async cancelTask(owner: string, repo: string, number: number): Promise<void> {
        const task = await this.taskRepository.get(owner, repo, number);
        if (!task) throw new NotFoundError(`No task #${number} on ${owner}/${repo}`);
        await this.taskQueue.publishControl(owner, repo, { action: 'cancel', issueNumber: number });
    }

    /** Merges the task's PR directly via the GitHub API — no worker involvement, unlike pause/resume/cancel. */
    async mergeTask(owner: string, repo: string, number: number): Promise<void> {
        const task = await this.taskRepository.get(owner, repo, number);
        if (!task) throw new NotFoundError(`No task #${number} on ${owner}/${repo}`);
        if (task.status !== 'done') throw new BadRequestError(`Task #${number} on ${owner}/${repo} isn't done yet`);

        const merged = await this.taskRepository.mergePullRequest(owner, repo, number);
        if (!merged) throw new NotFoundError(`Task #${number} on ${owner}/${repo} hasn't opened a PR yet`);
    }
}
