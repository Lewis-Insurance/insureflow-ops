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

export function modelBoundaryFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, redactRequestInitForModelBoundary(input, init));
}
