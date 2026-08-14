import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/components/crm/CallClientConnection', () => ({
  CallClientConnection: () => <div data-testid="call-client-connection" />,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { TelephonyDashboard } from '@/components/crm/TelephonyDashboard';
import { supabase } from '@/integrations/supabase/client';

interface SelectCall {
  table: string;
  columns: string;
  options?: { count?: string; head?: boolean };
}

function createCountChain(count: number) {
  const chain: Record<string, unknown> = {};
  chain.eq = vi.fn(() => chain);
  chain.then = (resolve: (value: { count: number; data: null; error: null }) => void) =>
    Promise.resolve({ count, data: null, error: null }).then(resolve);
  return chain;
}

function mockTelephonySupabase({
  totalCalls = 2500,
  totalSMS = 1800,
  optOutCount = 12,
}: {
  totalCalls?: number;
  totalSMS?: number;
  optOutCount?: number;
} = {}) {
  const selectCalls: SelectCall[] = [];

  const settingsChain: Record<string, unknown> = {};
  settingsChain.select = vi.fn(() => settingsChain);
  settingsChain.maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: 'settings-1',
      twilio_phone_number: '+15550001111',
      forward_number: null,
      recording_enabled: true,
      webhook_status: 'ok',
    },
    error: null,
  });

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'call_sessions') {
      return {
        select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
          selectCalls.push({ table, columns, options });
          return createCountChain(totalCalls);
        }),
      } as never;
    }

    if (table === 'sms_messages') {
      return {
        select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
          selectCalls.push({ table, columns, options });
          return createCountChain(totalSMS);
        }),
      } as never;
    }

    if (table === 'consents') {
      return {
        select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
          selectCalls.push({ table, columns, options });
          return createCountChain(optOutCount);
        }),
      } as never;
    }

    if (table === 'telephony_settings') {
      return settingsChain as never;
    }

    return {} as never;
  });

  return { selectCalls, settingsChain };
}

describe('TelephonyDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests exact counts with head: true and renders uncapped totals', async () => {
    const { selectCalls } = mockTelephonySupabase({
      totalCalls: 2500,
      totalSMS: 1800,
      optOutCount: 12,
    });

    render(<TelephonyDashboard />);

    await waitFor(() => {
      expect(screen.getByText('2500')).toBeInTheDocument();
    });

    expect(screen.getByText('1800')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();

    const callsSelect = selectCalls.find((call) => call.table === 'call_sessions');
    const smsSelect = selectCalls.find((call) => call.table === 'sms_messages');
    const optOutSelect = selectCalls.find((call) => call.table === 'consents');

    expect(callsSelect?.options).toEqual({ count: 'exact', head: true });
    expect(smsSelect?.options).toEqual({ count: 'exact', head: true });
    expect(optOutSelect?.options).toEqual({ count: 'exact', head: true });
  });

  it('does not render the dead header Settings button', async () => {
    mockTelephonySupabase();

    render(<TelephonyDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Telephony Dashboard')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /^Settings$/i })).not.toBeInTheDocument();
  });
});
