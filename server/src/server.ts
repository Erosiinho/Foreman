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
import errorMiddleware from './http/middlewares/error';
import IssuePoller from './queue/issue-poller';

export interface App {
    app: Express;
    server: http.Server;
    poller: IssuePoller;
}

/** DI root: wires GitHub client -> repository -> service -> controller (mirrors kicker's server.ts layering). */
export function createApp(github: IGitHub, taskQueue: ITaskQueue, pollIntervalMs: number): App {
    const taskRepository = new TaskRepository(github);
    const taskService = new TaskService(taskRepository, taskQueue);
    const projectRepository = new ProjectRepository(github);
    const projectService = new ProjectService(projectRepository, taskRepository);
    const poller = new IssuePoller(projectRepository, taskRepository, taskQueue, pollIntervalMs);

    const app = express();
    app.use(cors());
    app.use(express.json());

    const taskController = new TaskController(taskService);
    app.use('/tasks', taskRoutes(taskController));

    const projectController = new ProjectController(projectService);
    app.use('/projects', projectRoutes(projectController));

    // Registered AFTER routes — an error middleware mounted earlier never sees their errors (Express requirement).
    app.use(errorMiddleware);

    const server = http.createServer(app);
    return { app, server, poller };
}
