import { Router } from 'express';
import TaskController from '../controllers/task.controller';

export default function taskRoutes(controller: TaskController): Router {
    const router = Router();

    router.post('/', controller.create);
    router.get('/', controller.list);
    router.post('/:owner/:repo/:number/pause', controller.pause);
    router.post('/:owner/:repo/:number/resume', controller.resume);
    router.post('/:owner/:repo/:number/cancel', controller.cancel);
    router.get('/:owner/:repo/:number/diff', controller.diff);

    return router;
}
