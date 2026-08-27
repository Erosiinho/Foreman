import ProjectRepository from '../repositories/project.repository';
import TaskRepository from '../repositories/task.repository';
import { STATUS_LABELS, TaskStatus } from '../types/ITask';
import IProject from '../types/IProject';

function emptyTaskCounts(): Record<TaskStatus, number> {
    return Object.fromEntries(STATUS_LABELS.map((status) => [status, 0])) as Record<TaskStatus, number>;
}

export default class ProjectService {
    constructor(
        private projectRepository: ProjectRepository,
        private taskRepository: TaskRepository,
    ) {}

    /**
     * One `list()` call per repo to build task counts (N+1 against the GitHub API) — fine at
     * personal-project repo counts, matches the "fetch all, filter client-side" tradeoff already
     * accepted in TaskRepository.list.
     */
    async listProjects(): Promise<IProject[]> {
        const repos = await this.projectRepository.list();
        return Promise.all(
            repos.map(async (repo) => {
                const tasks = await this.taskRepository.list(repo.owner, repo.repo);
                const taskCounts = emptyTaskCounts();
                for (const task of tasks) taskCounts[task.status]++;
                return { ...repo, taskCounts };
            }),
        );
    }
}
