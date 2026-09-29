import {
  Signal,
  RoutingInput,
  RoutingResult,
  CreateSignalInput,
  CreateSignalResult,
} from '../types/api.types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export class ApiError extends Error {
  public statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

/**
 * Fetches all signals from the backend ledger via GET /api/signals.
 */
export async function fetchSignals(): Promise<Signal[]> {
  try {
    const res = await fetch(`${API_BASE}/api/signals`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status} ${res.statusText}`;
      try {
        const errorJson = await res.json();
        if (errorJson.message) errorMsg = errorJson.message;
      } catch {
        // ignore parse error
      }
      throw new ApiError(errorMsg, res.status);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new ApiError('Malformed response: expected an array of signals.', 500);
    }

    return data;
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      `Could not connect to backend server at http://localhost:4000. Ensure the backend is running. (${err.message})`,
      0
    );
  }
}

/**
 * Evaluates deterministic project routing via POST /api/routing/evaluate.
 * This is a stateless calculation and does NOT create a signal or write to the ledger.
 */
export async function evaluateRouting(input: RoutingInput): Promise<RoutingResult> {
  try {
    const res = await fetch(`${API_BASE}/api/routing/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status} ${res.statusText}`;
      try {
        const errorJson = await res.json();
        if (errorJson.message) errorMsg = errorJson.message;
      } catch {
        // ignore parse error
      }
      throw new ApiError(errorMsg, res.status);
    }

    const result = (await res.json()) as RoutingResult;
    return result;
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      `Failed to evaluate routing: ${err.message || 'Could not connect to backend.'}`,
      0
    );
  }
}

/**
 * Creates and atomically persists a new research signal via POST /api/signals.
 * This is the guarded write action. Server generates identity and assigns project.
 */
export async function createSignal(input: CreateSignalInput): Promise<CreateSignalResult> {
  try {
    const res = await fetch(`${API_BASE}/api/signals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        text: input.text || undefined,
        url: input.url || undefined,
        title: input.title || undefined,
        notes: input.notes || undefined,
      }),
    });

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status} ${res.statusText}`;
      try {
        const errorJson = await res.json();
        if (errorJson.message) errorMsg = errorJson.message;
      } catch {
        // ignore parse error
      }
      throw new ApiError(errorMsg, res.status);
    }

    const data = await res.json();
    return data;
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      `Failed to create signal: ${err.message || 'Could not connect to backend.'}`,
      0
    );
  }
}
