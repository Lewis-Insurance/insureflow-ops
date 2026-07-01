import { supabase } from '@/integrations/supabase/client';
import { assertFloorCockpitEnabled } from './launchControl';
import type { FloorActionInput } from './floorAction';
import type { FloorDecisionPackagePreview } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://lrqajzwcmdwahnjyidgv.supabase.co';

export interface FloorActionResponse {
  ok: boolean;
  idempotent?: boolean;
  workRequestRef?: string;
  packageRef?: string;
  feedbackEventId?: string;
  verb?: string;
  preview?: FloorDecisionPackagePreview;
  error?: string;
  message?: string;
}

export async function invokeFloorAction(input: FloorActionInput): Promise<FloorActionResponse> {
  assertFloorCockpitEnabled();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/floor-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: ['Bearer', session?.access_token ?? ''].join(' '),
    },
    body: JSON.stringify(input),
  });

  const body = (await response.json().catch(() => ({}))) as FloorActionResponse;

  if (!response.ok) {
    throw new Error(body.message || body.error || `Floor action failed with HTTP ${response.status}`);
  }

  return body;
}
