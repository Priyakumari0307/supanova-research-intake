export interface FetchSourceOptions {
  /** Maximum time in milliseconds before aborting request. Default: 5000ms */
  timeoutMs?: number;
  /** Maximum number of redirects to follow. Default: 5 */
  maxRedirects?: number;
  /** Maximum response body size in bytes. Default: 1048576 (1 MB) */
  maxSizeBytes?: number;
  /** User agent header string */
  userAgent?: string;
  /** Custom fetch implementation for dependency injection / testing */
  fetchFn?: typeof fetch;
}

export type FetchSourceStatus = 'success' | 'error';

export interface FetchedSourceResult {
  status: FetchSourceStatus;
  originalUrl: string;
  finalUrl: string;
  statusCode: number | null;
  contentType: string | null;
  contentLength: number;
  fetchedAt: string; // ISO 8601 string
  title: string | null;
  content: string; // Clean extracted text (untrusted data, strictly plain text)
  truncated: boolean;
  error?: string;
  redirectCount: number;
}

export interface UrlValidationResult {
  isValid: boolean;
  normalizedUrl?: string;
  error?: string;
}
