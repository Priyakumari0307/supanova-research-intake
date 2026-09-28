import { Router, Request, Response, NextFunction } from 'express';
import { getProjects } from '../services/fixture.service';

export const projectsRouter = Router();

projectsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const projects = await getProjects();
    res.json(projects);
  } catch (err) {
    next(err);
  }
});
