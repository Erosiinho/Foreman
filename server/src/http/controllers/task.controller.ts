import { z } from 'zod';
import TaskService from '../../services/task.service';
import asyncController from './controller';
import { BadRequestError } from '../errors';

const createTaskSchema = z.object({
    owner: z.string().trim().min(1),
    repo: z.string().trim().min(1),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1),
});

export default class TaskController {
    constructor(private taskService: TaskService) {}

    create = asyncController(async (req, res) => {
        const parsed = createTaskSchema.safeParse(req.body);
        if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Invalid body');

        const task = await this.taskService.createTask(
            parsed.data.owner,
            parsed.data.repo,
            parsed.data.title,
            parsed.data.description,
        );
        res.status(201).json(task);
    });

    list = asyncController(async (req, res) => {
        const owner = String(req.query.owner ?? '');
        const repo = String(req.query.repo ?? '');
        if (!owner || !repo) throw new BadRequestError('owner and repo query params are required');

        const tasks = await this.taskService.listTasks(owner, repo);
        res.status(200).json(tasks);
    });

    pause = asyncController(async (req, res) => {
        await this.taskService.pauseTask(String(req.params.owner), String(req.params.repo), Number(req.params.number));
        res.status(202).json({ status: 'pause requested' });
    });

    resume = asyncController(async (req, res) => {
        await this.taskService.resumeTask(String(req.params.owner), String(req.params.repo), Number(req.params.number));
        res.status(202).json({ status: 'resume requested' });
    });

    cancel = asyncController(async (req, res) => {
        await this.taskService.cancelTask(String(req.params.owner), String(req.params.repo), Number(req.params.number));
        res.status(202).json({ status: 'cancel requested' });
    });

    merge = asyncController(async (req, res) => {
        await this.taskService.mergeTask(String(req.params.owner), String(req.params.repo), Number(req.params.number));
        res.status(202).json({ status: 'merge requested' });
    });

    diff = asyncController(async (req, res) => {
        const diff = await this.taskService.getTaskDiff(
            String(req.params.owner),
            String(req.params.repo),
            Number(req.params.number),
        );
        res.status(200).json(diff);
    });
}
