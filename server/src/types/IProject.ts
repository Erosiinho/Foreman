import { TaskStatus } from './ITask';

export default interface IProject {
    owner: string;
    repo: string;
    fullName: string;
    private: boolean;
    url: string;
    taskCounts: Record<TaskStatus, number>;
}
