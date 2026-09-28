import { Router, Request, Response, NextFunction } from 'express';
import { getSignals } from '../services/fixture.service';

export const signalsRouter = Router();

signalsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const signals = await getSignals();
    res.json(signals);
  } catch (err) {
    next(err);
  }
});
