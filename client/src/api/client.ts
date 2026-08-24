import type { IProject, ITask, ITaskDiff } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${API_URL}${path}`, {
            headers: { 'Content-Type': 'application/json' },
            ...init,
        });
    } catch {
        throw new ApiError(
            `Can't reach Foreman's API at ${API_URL} — check the server is running.`,
        );
    }

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(body.error ?? `Request failed (${res.status})`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
}

export function listProjects(): Promise<IProject[]> {
    return request('/projects');
}

export function listTasks(owner: string, repo: string): Promise<ITask[]> {
    return request(
        `/tasks?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
    );
}

export function createTask(
    owner: string,
    repo: string,
    title: string,
    description: string,
): Promise<ITask> {
    return request('/tasks', {
        method: 'POST',
        body: JSON.stringify({ owner, repo, title, description }),
    });
}

export function pauseTask(
    owner: string,
    repo: string,
    number: number,
): Promise<void> {
    return request(`/tasks/${owner}/${repo}/${number}/pause`, {
        method: 'POST',
    });
}

export function resumeTask(
    owner: string,
    repo: string,
    number: number,
): Promise<void> {
    return request(`/tasks/${owner}/${repo}/${number}/resume`, {
        method: 'POST',
    });
}

export function cancelTask(
    owner: string,
    repo: string,
    number: number,
): Promise<void> {
    return request(`/tasks/${owner}/${repo}/${number}/cancel`, {
        method: 'POST',
    });
}

export function getTaskDiff(
    owner: string,
    repo: string,
    number: number,
): Promise<ITaskDiff> {
    return request(`/tasks/${owner}/${repo}/${number}/diff`);
}
