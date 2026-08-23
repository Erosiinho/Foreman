import ProjectService from '../../services/project.service';
import asyncController from './controller';

export default class ProjectController {
    constructor(private projectService: ProjectService) {}

    list = asyncController(async (_req, res) => {
        const projects = await this.projectService.listProjects();
        res.status(200).json(projects);
    });
}
