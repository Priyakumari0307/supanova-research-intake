import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFetchUrl,
  extractSourceContent,
  decodeHtmlEntities,
  fetchSource,
} from './fetcher.service';

describe('Safe URL Fetching & Source Handling Engine', () => {
  describe('Requirement 1 & 2: Valid HTTP and HTTPS URL validation', () => {
    it('accepts valid HTTP URL', () => {
      const result = validateFetchUrl('http://example.com/research-notes');
      assert.equal(result.isValid, true);
      assert.equal(result.normalizedUrl, 'http://example.com/research-notes');
    });

    it('accepts valid HTTPS URL with query parameters and port', () => {
      const result = validateFetchUrl('https://sub.domain.org:8443/path?query=1#section');
      assert.equal(result.isValid, true);
      assert.ok(result.normalizedUrl?.startsWith('https://sub.domain.org:8443/'));
    });
  });

  describe('Requirement 3: Invalid URL rejection', () => {
    it('rejects empty string or whitespace', () => {
      const result = validateFetchUrl('   ');
      assert.equal(result.isValid, false);
      assert.ok(result.error?.includes('non-empty string'));
    });

    it('rejects completely malformed URL strings', () => {
      const result = validateFetchUrl('not-a-valid-url');
      assert.equal(result.isValid, false);
      assert.ok(result.error?.includes('Invalid URL format'));
    });

    it('rejects URL with missing hostname', () => {
      const result = validateFetchUrl('http://');
      assert.equal(result.isValid, false);
    });

    it('fetchSource rejects invalid URL without making network requests', async () => {
      const result = await fetchSource('invalid_url_input');
      assert.equal(result.status, 'error');
      assert.equal(result.statusCode, null);
      assert.ok(result.error?.includes('Invalid URL format'));
    });
  });

  describe('Requirement 4: Unsupported protocol rejection', () => {
    it('rejects ftp:// protocol', () => {
      const result = validateFetchUrl('ftp://files.example.com/data.txt');
      assert.equal(result.isValid, false);
      assert.ok(result.error?.includes('Unsupported protocol "ftp:"'));
    });

    it('rejects file:/// protocol', () => {
      const result = validateFetchUrl('file:///etc/passwd');
      assert.equal(result.isValid, false);
      assert.ok(result.error?.includes('Unsupported protocol "file:"'));
    });

    it('rejects javascript: protocol', () => {
      const result = validateFetchUrl('javascript:alert(1)');
      assert.equal(result.isValid, false);
      assert.ok(result.error?.includes('Unsupported protocol "javascript:"'));
    });

    it('rejects data: protocol', () => {
      const result = validateFetchUrl('data:text/html,<h1>Test</h1>');
      assert.equal(result.isValid, false);
      assert.ok(result.error?.includes('Unsupported protocol "data:"'));
    });
  });

  describe('Requirement 5: Timeout and network failure handling', () => {
    it('handles request timeout safely without crashing', async () => {
      const mockFetch: typeof fetch = async (_url, options) => {
        return new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      const result = await fetchSource('https://example.com/slow', {
        timeoutMs: 50,
        fetchFn: mockFetch,
      });

      assert.equal(result.status, 'error');
      assert.equal(result.statusCode, null);
      assert.ok(result.error?.includes('timed out'));
    });

    it('handles simulated network connection failure gracefully', async () => {
      const mockFetch: typeof fetch = async () => {
        throw new Error('getaddrinfo ENOTFOUND mock.server.example');
      };

      const result = await fetchSource('https://mock.server.example/api', {
        fetchFn: mockFetch,
      });

      assert.equal(result.status, 'error');
      assert.equal(result.statusCode, null);
      assert.ok(result.error?.includes('Network error'));
      assert.ok(result.error?.includes('ENOTFOUND'));
    });
  });

  describe('Requirement 6: Non-2xx response handling', () => {
    it('safely handles 404 Not Found response', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response('Page Not Found', {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'text/plain' },
        });
      };

      const result = await fetchSource('https://example.com/non-existent', {
        fetchFn: mockFetch,
      });

      assert.equal(result.status, 'error');
      assert.equal(result.statusCode, 404);
      assert.ok(result.error?.includes('404'));
      assert.equal(result.content, '');
    });

    it('safely handles 500 Internal Server Error response', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response('Server Error Details', {
          status: 500,
          statusText: 'Internal Server Error',
          headers: { 'Content-Type': 'text/plain' },
        });
      };

      const result = await fetchSource('https://example.com/broken-endpoint', {
        fetchFn: mockFetch,
      });

      assert.equal(result.status, 'error');
      assert.equal(result.statusCode, 500);
      assert.ok(result.error?.includes('500'));
    });
  });

  describe('Requirement 7: Response size limit enforcement', () => {
    it('truncates large response body to maxSizeBytes limit', async () => {
      const largePayload = 'A'.repeat(5000);
      const mockFetch: typeof fetch = async () => {
        return new Response(largePayload, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      };

      const result = await fetchSource('https://example.com/large-doc', {
        maxSizeBytes: 200,
        fetchFn: mockFetch,
      });

      assert.equal(result.status, 'success');
      assert.equal(result.truncated, true);
      assert.equal(result.contentLength, 200);
      assert.equal(result.content.length, 200);
    });
  });

  describe('Requirement 8: Successful source parsing and extraction', () => {
    it('extracts clean title and text content from valid HTML', async () => {
      const sampleHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Northwind Supply &amp; Logistics Overview</title>
          </head>
          <body>
            <h1>Supply Chain Modernization</h1>
            <p>We are migrating our legacy invoice sync mechanism to the automated portal.</p>
            <div>Additional notes for harborline freight integration.</div>
          </body>
        </html>
      `;

      const mockFetch: typeof fetch = async () => {
        return new Response(sampleHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      };

      const result = await fetchSource('https://northwind.example/overview', {
        fetchFn: mockFetch,
      });

      assert.equal(result.status, 'success');
      assert.equal(result.statusCode, 200);
      assert.equal(result.title, 'Northwind Supply & Logistics Overview');
      assert.ok(result.content.includes('Supply Chain Modernization'));
      assert.ok(result.content.includes('We are migrating our legacy invoice sync'));
      assert.ok(result.content.includes('Additional notes for harborline freight integration.'));
      assert.equal(result.truncated, false);
      assert.equal(result.redirectCount, 0);
    });

    it('extracts plain text documents cleanly', async () => {
      const rawText = 'Raw markdown research notes\n- Point 1\n- Point 2';
      const mockFetch: typeof fetch = async () => {
        return new Response(rawText, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      };

      const result = await fetchSource('https://example.com/notes.txt', {
        fetchFn: mockFetch,
      });

      assert.equal(result.status, 'success');
      assert.equal(result.title, null);
      assert.equal(result.content, rawText);
    });
  });

  describe('Requirement 9: Redirect limit and tracking', () => {
    it('follows safe redirects up to target URL and tracks finalUrl', async () => {
      const mockFetch: typeof fetch = async (url) => {
        if (url.toString() === 'http://example.com/initial') {
          return new Response(null, {
            status: 301,
            headers: { Location: 'https://example.com/final-destination' },
          });
        }
        return new Response('<html><title>Final Page</title><body>Success</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      };

      const result = await fetchSource('http://example.com/initial', {
        fetchFn: mockFetch,
      });

      assert.equal(result.status, 'success');
      assert.equal(result.originalUrl, 'http://example.com/initial');
      assert.equal(result.finalUrl, 'https://example.com/final-destination');
      assert.equal(result.redirectCount, 1);
      assert.equal(result.title, 'Final Page');
    });

    it('aborts when redirect count exceeds maxRedirects limit', async () => {
      let counter = 0;
      const mockFetch: typeof fetch = async () => {
        counter++;
        return new Response(null, {
          status: 302,
          headers: { Location: `https://example.com/loop-${counter}` },
        });
      };

      const result = await fetchSource('https://example.com/loop-0', {
        maxRedirects: 3,
        fetchFn: mockFetch,
      });

      assert.equal(result.status, 'error');
      assert.ok(result.error?.includes('Redirect limit exceeded'));
      assert.equal(result.redirectCount, 4);
    });

    it('rejects redirect pointing to dangerous non-HTTP protocol', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(null, {
          status: 302,
          headers: { Location: 'file:///etc/shadow' },
        });
      };

      const result = await fetchSource('https://example.com/redirect-to-file', {
        fetchFn: mockFetch,
      });

      assert.equal(result.status, 'error');
      assert.ok(result.error?.includes('Redirect target rejected'));
      assert.ok(result.error?.includes('Unsupported protocol'));
    });
  });

  describe('Requirement 10: Fetched content is treated strictly as data', () => {
    it('strips <script>, <style>, <iframe>, and event handlers without executing', () => {
      const maliciousHtml = `
        <html>
          <head>
            <title>Test &lt;script&gt;alert(1)&lt;/title&gt;</title>
            <style>body { display: none; } p { color: red; }</style>
            <script>
              window.eval("malicious_code()");
              process.exit(1);
            </script>
          </head>
          <body>
            <script src="https://evil.example/payload.js"></script>
            <p onclick="alert('clicked')">Legitimate research content here.</p>
            <iframe src="https://evil.example/embed"></iframe>
            <!-- Secret developer comment -->
          </body>
        </html>
      `;

      const { title, content } = extractSourceContent(maliciousHtml, 'text/html');

      // Title should have tags stripped and entities decoded into safe string
      assert.equal(title, 'Test <script>alert(1)</title>');
      // No script tags or script body content should remain
      assert.ok(!content.includes('window.eval'));
      assert.ok(!content.includes('process.exit'));
      assert.ok(!content.includes('display: none'));
      assert.ok(!content.includes('<iframe>'));
      assert.ok(!content.includes('Secret developer comment'));
      // Only plain clean content remains
      assert.equal(content, 'Legitimate research content here.');
    });
  });

  describe('Helper utilities: HTML entity decoding', () => {
    it('decodes named and numeric HTML entities correctly', () => {
      assert.equal(decodeHtmlEntities('&amp; &lt; &gt; &quot; &#39; &nbsp;'), '& < > " \'  ');
      assert.equal(decodeHtmlEntities('&#65;&#66;&#67;'), 'ABC');
      assert.equal(decodeHtmlEntities('&#x41;&#x42;&#x43;'), 'ABC');
    });
  });
});
