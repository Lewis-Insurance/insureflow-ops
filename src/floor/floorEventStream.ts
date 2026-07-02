import type { FloorStreamEvent } from './types';

export function parseFloorSseBlock(block: string): FloorStreamEvent | null {
  const lines = block.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return null;

  let eventName = '';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) eventName = line.slice('event:'.length).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trim());
  }

  if (dataLines.length === 0) return null;

  const payload = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
  const type = typeof payload.type === 'string' ? payload.type : eventName.replace(/^floor\./, '');

  switch (type) {
    case 'assistant_delta':
    case 'delta':
      return { type: 'delta', delta: String(payload.delta ?? '') };
    case 'tool_progress':
    case 'tool':
      return {
        type: 'tool',
        label: String(payload.label ?? 'Working'),
        state: payload.state === 'done' || payload.state === 'failed' ? payload.state : 'started',
      };
    case 'decision_package_ready':
    case 'package':
      return {
        type: 'package',
        packageRef: String(payload.packageRef ?? payload.package_ref ?? ''),
        revision: Number(payload.revision ?? 1),
        workRequestRef:
          typeof payload.workRequestRef === 'string'
            ? payload.workRequestRef
            : typeof payload.work_request_ref === 'string'
              ? payload.work_request_ref
              : undefined,
        workRequestId:
          typeof payload.workRequestId === 'string'
            ? payload.workRequestId
            : typeof payload.work_request_id === 'string'
              ? payload.work_request_id
              : undefined,
        title: String(payload.title ?? 'Decision package ready'),
        summary: String(payload.summary ?? 'Review the prepared package.'),
        actions: ['approve', 'edit', 'kill'],
      };
    case 'completed':
    case 'done':
      return {
        type: 'done',
        messageRef: typeof payload.messageRef === 'string' ? payload.messageRef : undefined,
        hermesResponseId: typeof payload.hermesResponseId === 'string' ? payload.hermesResponseId : undefined,
      };
    case 'error':
      return {
        type: 'error',
        code: String(payload.code ?? 'floor_error'),
        message: String(payload.message ?? 'Lewis Floor is unavailable.'),
        retryable: Boolean(payload.retryable),
      };
    default:
      return null;
  }
}

export function splitFloorSseBuffer(buffer: string): { events: FloorStreamEvent[]; remainder: string } {
  const parts = buffer.split(/\r?\n\r?\n/);
  const remainder = parts.pop() ?? '';
  const events = parts.map(parseFloorSseBlock).filter((event): event is FloorStreamEvent => Boolean(event));
  return { events, remainder };
}
