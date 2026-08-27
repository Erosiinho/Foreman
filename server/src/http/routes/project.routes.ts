import { Router } from 'express';
import ProjectController from '../controllers/project.controller';

export default function projectRoutes(controller: ProjectController): Router {
    const router = Router();

    router.get('/', controller.list);

    return router;
}
