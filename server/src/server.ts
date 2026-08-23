import express, { Express } from 'express';
import cors from 'cors';
import http from 'node:http';
import IGitHub from './github/client';
import { ITaskQueue } from './queue/task.queue';
import TaskRepository from './repositories/task.repository';
import ProjectRepository from './repositories/project.repository';
import TaskService from './services/task.service';
import ProjectService from './services/project.service';
import TaskController from './http/controllers/task.controller';
import ProjectController from './http/controllers/project.controller';
import taskRoutes from './http/routes/task.routes';
import projectRoutes from './http/routes/project.routes';
import githubWebhookRoutes from './http/webhooks/github.webhook';
import errorMiddleware from './http/middlewares/error';

export interface App {
    app: Express;
    server: http.Server;
}

/** DI root: wires GitHub client -> repository -> service -> controller (mirrors kicker's server.ts layering). */
export function createApp(github: IGitHub, taskQueue: ITaskQueue, webhookSecret: string): App {
    const taskRepository = new TaskRepository(github);
    const taskService = new TaskService(taskRepository, taskQueue);
    const projectRepository = new ProjectRepository(github);
    const projectService = new ProjectService(projectRepository, taskRepository);

    const app = express();
    app.use(cors());

    // Mounted before express.json(): needs the raw request body to verify GitHub's HMAC signature.
    app.use('/webhooks/github', githubWebhookRoutes(taskQueue, webhookSecret));

    app.use(express.json());

    const taskController = new TaskController(taskService);
    app.use('/tasks', taskRoutes(taskController));

    const projectController = new ProjectController(projectService);
    app.use('/projects', projectRoutes(projectController));

    // Registered AFTER routes — an error middleware mounted earlier never sees their errors (Express requirement).
    app.use(errorMiddleware);

    const server = http.createServer(app);
    return { app, server };
}
