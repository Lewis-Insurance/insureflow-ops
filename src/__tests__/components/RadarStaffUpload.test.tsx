import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RadarStaffUpload } from '@/components/tasks/RadarStaffUpload';

const { upload, invoke, toast } = vi.hoisted(() => ({
  upload: vi.fn(),
  invoke: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({ upload })),
    },
    functions: { invoke },
  },
}));

vi.mock('@/hooks/use-toast', () => ({ toast }));

describe('RadarStaffUpload', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(1_777_000_000_000);
    vi.stubGlobal('crypto', { randomUUID: () => 'upload-uuid' });
  });

  it('uploads under the workspace prefix, harvests, and drains upsert batches', async () => {
    const onComplete = vi.fn();
    upload.mockResolvedValue({ error: null });
    invoke
      .mockResolvedValueOnce({
        data: { uploadId: 'upload-1', rowCount: 1002, uniqueRows: 1001, validRows: 999, invalidRows: 2 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { processed: 1000, inserted: 800, duplicates: 100, excluded: 100, tasked: 300, queued: 400 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { processed: 1, inserted: 1, duplicates: 0, excluded: 0, tasked: 1, queued: 0 },
        error: null,
      });

    render(<RadarStaffUpload workspaceId="workspace-1" onComplete={onComplete} />);
    const file = new File(['employer name,policy number\nAcme,WC-1'], 'radar file.csv', {
      type: 'text/csv',
    });

    await userEvent.upload(screen.getByLabelText('Choose radar CSV or XLSX file'), file);

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(upload).toHaveBeenCalledWith(
      'workspace-1/1777000000000-upload-uuid-radar_file.csv',
      file,
      { contentType: 'text/csv', upsert: false },
    );
    expect(invoke).toHaveBeenNthCalledWith(1, 'radar-poc-harvest', {
      body: {
        agencyWorkspaceId: 'workspace-1',
        kind: 'cancel',
        storagePath: 'workspace-1/1777000000000-upload-uuid-radar_file.csv',
        filename: 'radar file.csv',
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'radar-opportunity-upsert', {
      body: { agencyWorkspaceId: 'workspace-1', uploadId: 'upload-1', limit: 1000 },
    });
    expect(invoke).toHaveBeenNthCalledWith(3, 'radar-opportunity-upsert', {
      body: { agencyWorkspaceId: 'workspace-1', uploadId: 'upload-1', limit: 1000 },
    });
    expect(toast).toHaveBeenCalledWith({
      title: 'Radar upload complete',
      description: '1002 rows, 999 valid, 2 invalid, 1 duplicate. 801 added, 100 matched existing, 100 excluded, 301 tasked, 400 queued.',
    });
  });

  it('rejects files above 20 MB before upload', async () => {
    render(<RadarStaffUpload workspaceId="workspace-1" />);
    const file = new File(['small'], 'too-large.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    Object.defineProperty(file, 'size', { value: 20_000_001 });

    fireEvent.change(screen.getByLabelText('Choose radar CSV or XLSX file'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith({
        title: 'File is too large',
        description: 'Choose a CSV or XLSX file no larger than 20 MB.',
        variant: 'destructive',
      });
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it('shows the server response when harvest fails', async () => {
    upload.mockResolvedValue({ error: null });
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: vi.fn().mockResolvedValue({ error: 'XLSX must contain exactly one worksheet' }) },
      },
    });

    render(<RadarStaffUpload workspaceId="workspace-1" />);
    const file = new File(['sheet'], 'radar.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await userEvent.upload(screen.getByLabelText('Choose radar CSV or XLSX file'), file);

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith({
        title: 'Radar upload failed',
        description: 'XLSX must contain exactly one worksheet',
        variant: 'destructive',
      });
    });
  });

  it('stops on row errors without exposing row details', async () => {
    upload.mockResolvedValue({ error: null });
    invoke
      .mockResolvedValueOnce({ data: { uploadId: 'upload-1', rowCount: 1, uniqueRows: 1, validRows: 1, invalidRows: 0 }, error: null })
      .mockResolvedValueOnce({
        data: { processed: 0, errors: [{ stagingId: 'secret-row-id', error: 'sensitive row detail' }] },
        error: null,
      });

    render(<RadarStaffUpload workspaceId="workspace-1" />);
    await userEvent.upload(
      screen.getByLabelText('Choose radar CSV or XLSX file'),
      new File(['data'], 'radar.csv', { type: 'text/csv' }),
    );

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith({
        title: 'Radar upload failed',
        description: 'Opportunity upsert reported 1 row error.',
        variant: 'destructive',
      });
    });
    expect(JSON.stringify(toast.mock.calls)).not.toContain('secret-row-id');
    expect(JSON.stringify(toast.mock.calls)).not.toContain('sensitive row detail');
  });

  it('caps pathological full-batch responses after the exact-limit probe', async () => {
    upload.mockResolvedValue({ error: null });
    invoke
      .mockResolvedValueOnce({ data: { uploadId: 'upload-1', rowCount: 25_000, uniqueRows: 25_000, validRows: 25_000, invalidRows: 0 }, error: null })
      .mockResolvedValue({
        data: { processed: 1000, inserted: 1000, duplicates: 0, excluded: 0, tasked: 0, queued: 1000 },
        error: null,
      });

    render(<RadarStaffUpload workspaceId="workspace-1" />);
    await userEvent.upload(
      screen.getByLabelText('Choose radar CSV or XLSX file'),
      new File(['data'], 'radar.csv', { type: 'text/csv' }),
    );

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith({
        title: 'Radar upload failed',
        description: 'Opportunity upsert did not finish within the 25,000 row limit.',
        variant: 'destructive',
      });
    });
    expect(invoke).toHaveBeenCalledTimes(27);
  });
});
