import { Router, Request, Response, NextFunction } from 'express';
import { getSignals } from '../services/fixture.service';
import { createResearchSignal } from '../services/research-signal.service';

export const signalsRouter = Router();

signalsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const signals = await getSignals();
    res.json(signals);
  } catch (err) {
    next(err);
  }
});

signalsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await createResearchSignal(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
