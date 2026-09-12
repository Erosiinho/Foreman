import type { TaskStatus } from '../types';

export const STATUS_META: Record<
    TaskStatus,
    { label: string; color: string; pulse: boolean }
> = {
    todo: { label: 'Queued', color: 'var(--color-status-todo)', pulse: false },
    'in-progress': {
        label: 'Running',
        color: 'var(--color-status-progress)',
        pulse: true,
    },
    paused: {
        label: 'Paused',
        color: 'var(--color-status-paused)',
        pulse: false,
    },
    done: { label: 'Done', color: 'var(--color-status-done)', pulse: false },
    failed: {
        label: 'Failed',
        color: 'var(--color-status-failed)',
        pulse: false,
    },
    cancelled: {
        label: 'Cancelled',
        color: 'var(--color-status-cancelled)',
        pulse: false,
    },
};

/** Display order for status tallies on a project card — active work first, settled work last. */
export const STATUS_ORDER: TaskStatus[] = [
    'in-progress',
    'paused',
    'todo',
    'failed',
    'done',
    'cancelled',
];
