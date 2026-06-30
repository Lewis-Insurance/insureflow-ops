import { supabase } from '@/integrations/supabase/client';
import { splitFloorSseBuffer } from './floorEventStream';
import type { FloorChatRequest, FloorChatSender } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://lrqajzwcmdwahnjyidgv.supabase.co';

export const sendFloorChatMessage: FloorChatSender = async (request: FloorChatRequest, emit) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/hermes-chat/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: ['Bearer', session?.access_token ?? ''].join(' '),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Lewis Floor is unavailable.');
    throw new Error(message || `Lewis Floor request failed with HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Lewis Floor response did not include a stream.');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = splitFloorSseBuffer(buffer);
    buffer = parsed.remainder;
    parsed.events.forEach(emit);
  }

  if (buffer.trim()) {
    splitFloorSseBuffer(`${buffer}\n\n`).events.forEach(emit);
  }
};
