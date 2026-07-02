import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { redactPII } from '../_shared/floorSafety.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SSN_PATTERN = /\b(?:\d{3}-\d{2}-\d{4}|\d{9})\b/;
const DOB_OR_DLN_LABEL_PATTERN = /\b(?:date\s+of\s+birth|dob|driver'?s?\s+license|dln)\b/i;
const RAW_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const SIGNED_STORAGE_URL_PATTERN = /(?:storage\/v1\/object\/(?:sign|public)|supabase\.co\/storage)/i;

interface FloorChatRequest {
  sessionRef: string;
  message: string;
  contextRefs?: {
    clientRef?: string;
    policyRef?: string;
    documentRefs?: string[];
    workItemRef?: string;
  };
}

function isUnsafeMessage(message: string): boolean {
  return (
    SSN_PATTERN.test(message) ||
    DOB_OR_DLN_LABEL_PATTERN.test(message) ||
    RAW_UUID_PATTERN.test(message) ||
    SIGNED_STORAGE_URL_PATTERN.test(message)
  );
}

function sse(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamFromEvents(events: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(event));
        controller.close();
      },
    }),
    {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    },
  );
}

function isCockpitEnabled(): boolean {
  const value = Deno.env.get('FLOOR_COCKPIT_ENABLED') ?? '';
  return value === 'true' || value === '1';
}

function syntheticResponse(body: FloorChatRequest): Response {
  const clientRef = body.contextRefs?.clientRef ?? 'client:practice-context';
  return streamFromEvents([
    sse('floor.tool', { type: 'tool_progress', label: 'Binding safe InsureFlow context', state: 'started' }),
    sse('floor.tool', { type: 'tool_progress', label: 'Checking Floor approval/send gates', state: 'done' }),
    sse('floor.delta', {
      type: 'assistant_delta',
      delta:
        'I prepared a practice-safe Floor response using opaque context refs only. No client, carrier, or third-party send was attempted. ',
    }),
    sse('floor.package', {
      type: 'decision_package_ready',
      packageRef: 'package:practice-floor-cockpit-001',
      revision: 1,
      title: 'Practice decision package ready',
      summary: `Review the prepared work for ${clientRef}. This synthetic package supports approve, edit, or kill only.`,
    }),
    sse('floor.done', { type: 'completed', messageRef: 'msg:practice-floor-cockpit-001' }),
  ]);
}

async function hermesProxyResponse(
  body: FloorChatRequest,
  redactedMessage: string,
  hermesUrl: string,
  hermesKey: string,
): Promise<Response> {
  const upstream = await fetch(`${hermesUrl.replace(/\/$/, '')}/v1/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: ['Bearer', hermesKey].join(' '),
    },
    body: JSON.stringify({
      model: Deno.env.get('HERMES_MODEL_NAME') ?? 'hermes-agent',
      conversation: body.sessionRef,
      input: redactedMessage,
      instructions:
        'You are Lewis Floor inside InsureFlow. Use only safe servicing summaries and opaque refs. Never send to clients, carriers, or third parties. Prepare work and require named-human approval for external actions.',
      store: true,
      stream: true,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    return streamFromEvents([
      sse('floor.error', {
        type: 'error',
        code: 'hermes_unavailable',
        message: `Hermes runtime returned HTTP ${upstream.status}. No external action was taken.`,
        retryable: true,
      }),
    ]);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        const reader = upstream.body!.getReader();
        let buffer = '';
        controller.enqueue(
          encoder.encode(sse('floor.tool', { type: 'tool_progress', label: 'Connected to Hermes runtime', state: 'started' })),
        );

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() ?? '';

          for (const block of blocks) {
            const eventLine = block.split(/\r?\n/).find((line) => line.startsWith('event:'));
            const dataLine = block.split(/\r?\n/).find((line) => line.startsWith('data:'));
            const eventName = eventLine?.slice('event:'.length).trim() ?? '';
            if (!dataLine) continue;
            const payload = JSON.parse(dataLine.slice('data:'.length).trim()) as Record<string, unknown>;

            if (eventName === 'response.output_text.delta' || typeof payload.delta === 'string') {
              controller.enqueue(encoder.encode(sse('floor.delta', { type: 'assistant_delta', delta: String(payload.delta ?? '') })));
            }
            if (eventName === 'response.completed') {
              controller.enqueue(encoder.encode(sse('floor.done', { type: 'completed', hermesResponseId: payload.id })));
            }
          }
        }

        controller.close();
      },
    }),
    {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    },
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isCockpitEnabled()) {
      return new Response(JSON.stringify({ error: 'floor_cockpit_disabled' }), {
        status: 423,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as FloorChatRequest;
    if (!body.sessionRef || !body.message) {
      return new Response(JSON.stringify({ error: 'sessionRef and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (isUnsafeMessage(body.message)) {
      return new Response(JSON.stringify({ error: 'pii_boundary_violation' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { redacted: redactedMessage } = redactPII(body.message);

    const hermesUrl = Deno.env.get('HERMES_API_URL');
    const hermesKey = Deno.env.get('HERMES_API_KEY') ?? Deno.env.get('API_SERVER_KEY');
    if (hermesUrl && hermesKey && Deno.env.get('FLOOR_HERMES_SYNTHETIC') !== 'true') {
      return await hermesProxyResponse(body, redactedMessage, hermesUrl, hermesKey);
    }

    return syntheticResponse(body);
  } catch (error) {
    return streamFromEvents([
      sse('floor.error', {
        type: 'error',
        code: 'floor_bridge_error',
        message: error instanceof Error ? error.message : 'Lewis Floor bridge failed safely.',
        retryable: true,
      }),
    ]);
  }
});
