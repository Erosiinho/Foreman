export const STATUS_LABELS = ['todo', 'in-progress', 'paused', 'done', 'failed', 'cancelled'] as const;

export type TaskStatus = (typeof STATUS_LABELS)[number];

export default interface ITask {
    owner: string;
    repo: string;
    number: number;
    title: string;
    description: string;
    status: TaskStatus;
    updatedAt: string;
}
