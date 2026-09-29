import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { projectsRouter } from './routes/projects.router';
import { signalsRouter } from './routes/signals.router';
import { configRouter } from './routes/config.router';
import { routingRouter } from './routes/routing.router';
import { candidateWorkRouter } from './routes/candidate-work.router';
import { FixtureError } from './services/fixture.service';

export const app = express();

app.use(cors());
app.use(express.json());

// Base health endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'supanova-research-intake-backend',
    timestamp: new Date().toISOString(),
  });
});

// Fixture-backed read-only API routes
app.use('/api/projects', projectsRouter);
app.use('/api/signals', signalsRouter);
app.use('/api/routing-config', configRouter);
app.use('/api/routing', routingRouter);
app.use('/api/candidate-work', candidateWorkRouter);

// Centralized error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof FixtureError) {
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
    });
    return;
  }

  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'InternalServerError',
    message: err.message || 'An unexpected internal server error occurred',
  });
});
