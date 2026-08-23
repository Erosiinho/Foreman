export const STATUS_LABELS = [
    'todo',
    'in-progress',
    'paused',
    'done',
    'failed',
    'cancelled',
] as const;

export type TaskStatus = (typeof STATUS_LABELS)[number];

export interface ITask {
    owner: string;
    repo: string;
    number: number;
    title: string;
    description: string;
    status: TaskStatus;
    updatedAt: string;
}

export interface IDiffFile {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
}

export interface ITaskDiff {
    prNumber: number;
    prUrl: string;
    additions: number;
    deletions: number;
    files: IDiffFile[];
}

export interface IProject {
    owner: string;
    repo: string;
    fullName: string;
    private: boolean;
    url: string;
    taskCounts: Record<TaskStatus, number>;
}
