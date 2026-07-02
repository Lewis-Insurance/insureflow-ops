import { describe, expect, it } from 'vitest';
import { splitFloorSseBuffer } from './floorEventStream';

describe('floor event stream parser', () => {
  it('parses Hermes/Floor SSE envelopes into UI events while keeping partial buffer state', () => {
    const chunk = [
      'event: floor.tool',
      'data: {"type":"tool_progress","label":"Checking gates","state":"started"}',
      '',
      'event: floor.delta',
      'data: {"type":"assistant_delta","delta":"Prepared."}',
      '',
      'event: floor.package',
      'data: {"type":"decision_package_ready","package_ref":"package:abc","revision":2,"title":"Review ready","summary":"Approve, edit, or kill."}',
      '',
      'event: floor.done',
      'data: {"type":"completed","messageRef":"msg:abc"}',
      '',
      'event: floor.delta',
      'data: {"type":"assistant_delta","delta":"partial"}',
    ].join('\n');

    const parsed = splitFloorSseBuffer(chunk);

    expect(parsed.events).toEqual([
      { type: 'tool', label: 'Checking gates', state: 'started' },
      { type: 'delta', delta: 'Prepared.' },
      {
        type: 'package',
        packageRef: 'package:abc',
        revision: 2,
        title: 'Review ready',
        summary: 'Approve, edit, or kill.',
        actions: ['approve', 'edit', 'kill'],
      },
      { type: 'done', messageRef: 'msg:abc', hermesResponseId: undefined },
    ]);
    expect(parsed.remainder).toContain('partial');
  });
});
