import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendFloorChatMessage } from './floorChatClient';
import { setFloorCockpitLaunchControlOverrideForTests } from './launchControl';

function streamFromText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

describe('floor chat client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setFloorCockpitLaunchControlOverrideForTests(null);
  });

  it('posts to the server-side hermes-chat bridge and emits parsed Floor events', async () => {
    setFloorCockpitLaunchControlOverrideForTests(true);

    const sse = [
      'event: floor.tool',
      'data: {"type":"tool_progress","label":"Binding context","state":"started"}',
      '',
      'event: floor.delta',
      'data: {"type":"assistant_delta","delta":"Prepared safely."}',
      '',
      'event: floor.done',
      'data: {"type":"completed","messageRef":"msg:1"}',
      '',
    ].join('\n');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(streamFromText(sse), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const events: unknown[] = [];

    await sendFloorChatMessage(
      {
        sessionRef: 'chat:practice-session',
        message: 'Prepare the renewal review.',
        contextRefs: { clientRef: 'client:practice' },
      },
      (event) => events.push(event),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://test-project.supabase.co/functions/v1/hermes-chat/message',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          sessionRef: 'chat:practice-session',
          message: 'Prepare the renewal review.',
          contextRefs: { clientRef: 'client:practice' },
        }),
      }),
    );
    expect(events).toEqual([
      { type: 'tool', label: 'Binding context', state: 'started' },
      { type: 'delta', delta: 'Prepared safely.' },
      { type: 'done', messageRef: 'msg:1', hermesResponseId: undefined },
    ]);
  });
});
