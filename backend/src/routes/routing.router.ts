import { Router, Request, Response, NextFunction } from 'express';
import { routeSignal } from '../services/routing.service';

export const routingRouter = Router();

/**
 * Evaluates deterministic routing for a given text, URL, or structured input.
 * Read-only diagnostic/preview evaluation endpoint (does not persist or create signals).
 */
routingRouter.post('/evaluate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = req.body;
    const result = await routeSignal(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
