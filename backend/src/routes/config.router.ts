import { Router, Request, Response, NextFunction } from 'express';
import { getRoutingConfig } from '../services/fixture.service';

export const configRouter = Router();

configRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await getRoutingConfig();
    res.json(config);
  } catch (err) {
    next(err);
  }
});
