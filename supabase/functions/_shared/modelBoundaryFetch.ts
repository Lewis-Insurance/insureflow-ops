import { redactPII } from './floorSafety.ts';

const MODEL_BOUNDARY_PATTERNS = [
  /api\.openai\.com\/v1\/(?:chat\/completions|embeddings)/i,
  /api\.anthropic\.com\/v1\/messages/i,
  /generativelanguage\.googleapis\.com\/v1beta\/models\/[^/]+:generateContent/i,
  /\/openai\/deployments\/[^/]+\/(?:chat\/completions|embeddings)/i,
];

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function isModelBoundaryUrl(input: RequestInfo | URL): boolean {
  const url = requestUrl(input);
  return MODEL_BOUNDARY_PATTERNS.some((pattern) => pattern.test(url));
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactPII(value).redacted;
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, redactValue(nested)]),
    );
  }
  return value;
}

export function redactModelPayloadForTest(payload: unknown): unknown {
  return redactValue(payload);
}

export function redactRequestInitForModelBoundary(input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
  if (!init?.body || !isModelBoundaryUrl(input)) return init;

  if (typeof init.body === 'string') {
    try {
      const parsed = JSON.parse(init.body) as unknown;
      return { ...init, body: JSON.stringify(redactValue(parsed)) };
    } catch (_error) {
      return { ...init, body: redactPII(init.body).redacted };
    }
  }

  return init;
}

export async function modelBoundaryFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, redactRequestInitForModelBoundary(input, init));
  } catch (error) {
    // A malformed credential (e.g. a secret saved with extra lines) makes
    // fetch throw "Invalid header value: <the entire value>" - propagating
    // that would echo the SECRET into client-visible error responses and
    // function logs (observed live 2026-07-06). Report the shape problem
    // only; never a header value.
    const msg = error instanceof Error ? error.message : String(error);
    if (/header (value|name)/i.test(msg)) {
      throw new Error('model call failed: a request header is malformed (check the provider API key secret for extra characters or line breaks)');
    }
    throw error;
  }
}

export interface AnthropicBoundaryContentBlock {
  type: string;
  text: string;
  [key: string]: unknown;
}

export interface AnthropicBoundaryResponse {
  content: AnthropicBoundaryContentBlock[];
  [key: string]: unknown;
}

/**
 * The response's TEXT content, order- and block-count-independent: Claude 5
 * models with adaptive thinking may prepend non-text blocks AND split prose
 * across multiple text blocks (preamble + answer), so neither content[0] nor
 * the first text block is guaranteed to carry the JSON (Bugbot on PR #72).
 * Concatenating every text block lets downstream JSON regexes find the
 * payload wherever it lives.
 */
export function anthropicResponseText(response: AnthropicBoundaryResponse): string {
  return (response.content ?? [])
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
}

export async function anthropicBoundaryCreate(
  credential: string,
  body: Record<string, unknown>,
): Promise<AnthropicBoundaryResponse> {
  const response = await modelBoundaryFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': credential,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = redactPII(await response.text()).redacted;
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<AnthropicBoundaryResponse>;
}
