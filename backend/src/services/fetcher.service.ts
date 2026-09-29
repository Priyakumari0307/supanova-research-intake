import {
  FetchSourceOptions,
  FetchedSourceResult,
  UrlValidationResult,
} from '../types/fetcher.types';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_SIZE_BYTES = 1024 * 1024; // 1 MB
const DEFAULT_USER_AGENT = 'Supanova-Research-Intake/1.0 (+https://supanova.example)';

/**
 * Validates that a given string is a well-formed HTTP or HTTPS URL.
 * Rejects unsupported protocols, malformed URLs, and non-string inputs.
 */
export function validateFetchUrl(urlStr: string): UrlValidationResult {
  if (!urlStr || typeof urlStr !== 'string' || urlStr.trim() === '') {
    return {
      isValid: false,
      error: 'URL is required and must be a non-empty string.',
    };
  }

  const trimmed = urlStr.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      error: `Invalid URL format: "${trimmed}".`,
    };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return {
      isValid: false,
      error: `Unsupported protocol "${protocol}". Only http: and https: URLs are permitted.`,
    };
  }

  if (!parsed.hostname || parsed.hostname.trim() === '') {
    return {
      isValid: false,
      error: `URL "${trimmed}" must contain a valid hostname.`,
    };
  }

  return {
    isValid: true,
    normalizedUrl: parsed.toString(),
  };
}

/**
 * Safely decodes common HTML entities into plain text.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
    });
}

/**
 * Safely extracts title and plain text content from raw HTML or text data.
 * Treats content strictly as untrusted data (removes scripts, styles, iframes).
 */
export function extractSourceContent(
  rawBody: string,
  contentType: string | null
): { title: string | null; content: string } {
  if (!rawBody) {
    return { title: null, content: '' };
  }

  const isHtml =
    (contentType && contentType.toLowerCase().includes('html')) ||
    /<(!doctype|html|head|body|p|div|h1|h2|h3|title)/i.test(rawBody);

  if (!isHtml) {
    return {
      title: null,
      content: rawBody.trim(),
    };
  }

  // Extract <title> if present
  let title: string | null = null;
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(rawBody);
  if (titleMatch && titleMatch[1]) {
    const rawTitle = titleMatch[1].replace(/<[^>]+>/g, '');
    title = decodeHtmlEntities(rawTitle).replace(/\s+/g, ' ').trim() || null;
  }

  // Remove head section, scripts, styles, and other non-body elements
  let clean = rawBody
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, ' ')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Convert block boundaries into whitespace
  clean = clean
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|nav|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  clean = decodeHtmlEntities(clean);

  // Normalize whitespace: collapse consecutive spaces, keep reasonable paragraph breaks
  clean = clean
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');

  return {
    title,
    content: clean,
  };
}

/**
 * Reads response body stream up to maxSizeBytes, truncating safely if the limit is exceeded.
 */
async function readResponseBodyLimited(
  response: Response,
  maxSizeBytes: number
): Promise<{ body: string; truncated: boolean; bytesRead: number }> {
  if (!response.body) {
    const text = await response.text();
    const byteLen = Buffer.byteLength(text, 'utf-8');
    if (byteLen > maxSizeBytes) {
      const buf = Buffer.from(text, 'utf-8').subarray(0, maxSizeBytes);
      return {
        body: buf.toString('utf-8'),
        truncated: true,
        bytesRead: maxSizeBytes,
      };
    }
    return {
      body: text,
      truncated: false,
      bytesRead: byteLen,
    };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        if (totalBytes + value.length > maxSizeBytes) {
          const allowed = maxSizeBytes - totalBytes;
          if (allowed > 0) {
            chunks.push(value.subarray(0, allowed));
            totalBytes += allowed;
          }
          truncated = true;
          await reader.cancel();
          break;
        } else {
          chunks.push(value);
          totalBytes += value.length;
        }
      }
    }
  } catch (err) {
    // If stream reading fails, preserve whatever chunks were read
  }

  const totalBuffer = Buffer.concat(chunks);
  const textDecoder = new TextDecoder('utf-8');
  const body = textDecoder.decode(totalBuffer);

  return {
    body,
    truncated,
    bytesRead: totalBytes,
  };
}

/**
 * Safely fetches a web resource over HTTP/HTTPS with timeout, redirect limiting,
 * max response size enforcement, and safe plain-data extraction.
 *
 * Security Guarantees:
 * - Accepts only http:// and https:// URLs.
 * - Rejects non-HTTP protocols before making requests.
 * - Restricts redirect hops and validates protocol on each hop.
 * - Enforces strict timeout and response size limits.
 * - Treats fetched content strictly as untrusted data (no execution).
 * - Never crashes the server on network, HTTP, or parsing errors.
 */
export async function fetchSource(
  urlStr: string,
  options: FetchSourceOptions = {}
): Promise<FetchedSourceResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const fetchFn = options.fetchFn ?? globalThis.fetch;

  const fetchedAt = new Date().toISOString();

  // 1. Validate initial URL
  const validation = validateFetchUrl(urlStr);
  if (!validation.isValid || !validation.normalizedUrl) {
    return {
      status: 'error',
      originalUrl: urlStr,
      finalUrl: urlStr,
      statusCode: null,
      contentType: null,
      contentLength: 0,
      fetchedAt,
      title: null,
      content: '',
      truncated: false,
      error: validation.error || 'Invalid URL format.',
      redirectCount: 0,
    };
  }

  let currentUrl = validation.normalizedUrl;
  let redirectCount = 0;

  try {
    while (true) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetchFn(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          headers: {
            'User-Agent': userAgent,
            Accept: 'text/html,text/plain,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // Handle HTTP redirects (301, 302, 303, 307, 308)
      if (
        [301, 302, 303, 307, 308].includes(response.status) &&
        response.headers.has('location')
      ) {
        redirectCount++;
        if (redirectCount > maxRedirects) {
          return {
            status: 'error',
            originalUrl: urlStr,
            finalUrl: currentUrl,
            statusCode: response.status,
            contentType: response.headers.get('content-type'),
            contentLength: 0,
            fetchedAt,
            title: null,
            content: '',
            truncated: false,
            error: `Redirect limit exceeded (maximum ${maxRedirects} redirects allowed).`,
            redirectCount,
          };
        }

        const locationHeader = response.headers.get('location')!;
        let nextUrl: URL;
        try {
          nextUrl = new URL(locationHeader, currentUrl);
        } catch {
          return {
            status: 'error',
            originalUrl: urlStr,
            finalUrl: currentUrl,
            statusCode: response.status,
            contentType: response.headers.get('content-type'),
            contentLength: 0,
            fetchedAt,
            title: null,
            content: '',
            truncated: false,
            error: `Invalid redirect location header: "${locationHeader}".`,
            redirectCount,
          };
        }

        const targetValidation = validateFetchUrl(nextUrl.toString());
        if (!targetValidation.isValid || !targetValidation.normalizedUrl) {
          return {
            status: 'error',
            originalUrl: urlStr,
            finalUrl: nextUrl.toString(),
            statusCode: response.status,
            contentType: response.headers.get('content-type'),
            contentLength: 0,
            fetchedAt,
            title: null,
            content: '',
            truncated: false,
            error: `Redirect target rejected: ${targetValidation.error}`,
            redirectCount,
          };
        }

        currentUrl = targetValidation.normalizedUrl;
        continue;
      }

      // Non-2xx response status
      if (response.status < 200 || response.status >= 300) {
        return {
          status: 'error',
          originalUrl: urlStr,
          finalUrl: currentUrl,
          statusCode: response.status,
          contentType: response.headers.get('content-type'),
          contentLength: 0,
          fetchedAt,
          title: null,
          content: '',
          truncated: false,
          error: `HTTP ${response.status} ${response.statusText || 'Error'}`,
          redirectCount,
        };
      }

      // 2xx Success: read body with size limiter
      const contentType = response.headers.get('content-type');
      const { body, truncated, bytesRead } = await readResponseBodyLimited(
        response,
        maxSizeBytes
      );

      const { title, content } = extractSourceContent(body, contentType);

      return {
        status: 'success',
        originalUrl: urlStr,
        finalUrl: currentUrl,
        statusCode: response.status,
        contentType,
        contentLength: bytesRead,
        fetchedAt,
        title,
        content,
        truncated,
        redirectCount,
      };
    }
  } catch (err: any) {
    const isTimeout =
      err.name === 'AbortError' ||
      err.code === 'ABORT_ERR' ||
      err.message?.toLowerCase().includes('aborted');

    return {
      status: 'error',
      originalUrl: urlStr,
      finalUrl: currentUrl,
      statusCode: null,
      contentType: null,
      contentLength: 0,
      fetchedAt,
      title: null,
      content: '',
      truncated: false,
      error: isTimeout
        ? `Request timed out after ${timeoutMs}ms.`
        : `Network error: ${err.message || 'Failed to fetch resource.'}`,
      redirectCount,
    };
  }
}
