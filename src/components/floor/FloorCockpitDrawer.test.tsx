import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FloorCockpitDrawer, type FloorChatSender } from './FloorCockpitDrawer';

const boundClientContext = {
  sessionRef: 'chat:practice-session',
  clientRef: 'client:johnson-household',
  label: 'Johnson Household',
  chips: [
    { label: 'Client', value: 'Johnson Household' },
    { label: 'Policy', value: 'Progressive Auto • policy ****1234' },
    { label: 'Work item', value: 'Renewal rate jump review' },
  ],
};

describe('FloorCockpitDrawer', () => {
  it('renders the Lewis Floor cockpit with safe context chips', () => {
    const sendMessage = vi.fn() as unknown as FloorChatSender;

    render(
      <FloorCockpitDrawer
        open
        onOpenChange={() => undefined}
        initialContext={boundClientContext}
        sendMessage={sendMessage}
      />,
    );

    expect(screen.getByRole('heading', { name: /Lewis Floor/i })).toBeInTheDocument();
    expect(screen.getByText(/Context/i)).toBeInTheDocument();
    expect(screen.getByText('Client: Johnson Household')).toBeInTheDocument();
    expect(screen.getByText('Policy: Progressive Auto • policy ****1234')).toBeInTheDocument();
    expect(screen.queryByText(/[0-9a-f]{8}-[0-9a-f]{4}/i)).not.toBeInTheDocument();
  });

  it('streams a safe message into tool progress, assistant text, and an approve/edit/kill package with no send button', async () => {
    const sentRequests: unknown[] = [];
    const sendMessage: FloorChatSender = async (request, emit) => {
      sentRequests.push(request);
      emit({ type: 'tool', label: 'Checking renewal context', state: 'started' });
      emit({ type: 'delta', delta: 'I prepared the renewal review. ' });
      emit({
        type: 'package',
        packageRef: 'package:renewal-review-001',
        revision: 1,
        title: 'Renewal review ready',
        summary: 'Review the rate change and approve, edit, or kill the prepared package.',
        actions: ['approve', 'edit', 'kill'],
      });
      emit({ type: 'done', messageRef: 'msg:assistant-001' });
    };

    render(
      <FloorCockpitDrawer
        open
        onOpenChange={() => undefined}
        initialContext={boundClientContext}
        sendMessage={sendMessage}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Message Lewis Floor/i), {
      target: { value: 'Prep the renewal review.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send to Lewis Floor/i }));

    await waitFor(() => expect(screen.getByText(/Checking renewal context/i)).toBeInTheDocument());
    expect(await screen.findByText(/I prepared the renewal review/i)).toBeInTheDocument();
    expect(screen.getByText('Renewal review ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Kill$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Authorize send|Send now|Log manual send/i })).not.toBeInTheDocument();

    expect(sentRequests).toEqual([
      expect.objectContaining({
        sessionRef: 'chat:practice-session',
        message: 'Prep the renewal review.',
        contextRefs: expect.objectContaining({ clientRef: 'client:johnson-household' }),
      }),
    ]);
  });

  it('blocks unsafe regulated input before it can reach the sender', async () => {
    const sendMessage = vi.fn() as unknown as FloorChatSender;

    render(
      <FloorCockpitDrawer
        open
        onOpenChange={() => undefined}
        initialContext={boundClientContext}
        sendMessage={sendMessage}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Message Lewis Floor/i), {
      target: { value: 'The SSN is 123-45-6789 and DOB is 01/02/1980.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send to Lewis Floor/i }));

    expect(await screen.findByText(/Blocked before model/i)).toBeInTheDocument();
    expect(screen.getByText(/secure client field\/document flow/i)).toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('blocks raw UUIDs and signed document URLs before submission', async () => {
    const sendMessage = vi.fn() as unknown as FloorChatSender;

    render(
      <FloorCockpitDrawer
        open
        onOpenChange={() => undefined}
        initialContext={boundClientContext}
        sendMessage={sendMessage}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Message Lewis Floor/i), {
      target: {
        value:
          'Open https://lrqajzwcmdwahnjyidgv.supabase.co/storage/v1/object/sign/documents/file.pdf?token=abc for 550e8400-e29b-41d4-a716-446655440000',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send to Lewis Floor/i }));

    expect(await screen.findByText(/Blocked before model/i)).toBeInTheDocument();
    expect(screen.getByText(/opaque context refs/i)).toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
