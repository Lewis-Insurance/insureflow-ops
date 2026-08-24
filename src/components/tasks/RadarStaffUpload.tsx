import { useCallback, useState } from 'react';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const MAX_FILE_SIZE = 20_000_000;
const UPSERT_BATCH_SIZE = 1_000;
const MAX_UPSERT_CALLS = 26;

type RadarKind = 'cancel' | 'swo';

interface RadarStaffUploadProps {
  workspaceId: string;
  onComplete?: () => void;
}

interface HarvestResult {
  uploadId?: string;
  rowCount?: number;
  uniqueRows?: number;
  validRows?: number;
  invalidRows?: number;
  duplicate?: boolean;
}

interface UpsertResult {
  processed?: number;
  inserted?: number;
  duplicates?: number;
  excluded?: number;
  tasked?: number;
  queued?: number;
  remaining?: number;
  remainingRows?: number;
  hasMore?: boolean;
  errors?: unknown[];
}

const numberOrZero = (value: unknown) => (typeof value === 'number' ? value : 0);

function serverMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const candidate = error as { message?: unknown; context?: { json?: () => Promise<unknown> } };
  return typeof candidate.message === 'string' && candidate.message ? candidate.message : fallback;
}

async function serverErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === 'object') {
    const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
    if (context?.json) {
      try {
        const body = await context.json();
        if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
          return (body as { error: string }).error;
        }
      } catch {
        // The response body may already have been consumed. Use the client error below.
      }
    }
  }
  return serverMessage(error, fallback);
}

function safeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function contentTypeFor(filename: string): string {
  return filename.toLowerCase().endsWith('.xlsx')
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'text/csv';
}

function shouldContinueUpsert(result: UpsertResult): boolean {
  if (typeof result.remaining === 'number') return result.remaining > 0;
  if (typeof result.remainingRows === 'number') return result.remainingRows > 0;
  if (typeof result.hasMore === 'boolean') return result.hasMore;
  // The current function processes at most the requested batch size. A full batch
  // needs another pass, including the harmless final empty pass for exact multiples.
  return result.processed === UPSERT_BATCH_SIZE;
}

export function RadarStaffUpload({ workspaceId, onComplete }: RadarStaffUploadProps) {
  const [kind, setKind] = useState<RadarKind>('cancel');
  const [uploading, setUploading] = useState(false);

  const rejectFiles = useCallback((rejections: FileRejection[]) => {
    const tooLarge = rejections.some((rejection) =>
      rejection.errors.some((error) => error.code === 'file-too-large'),
    );
    toast({
      title: tooLarge ? 'File is too large' : 'File type not supported',
      description: tooLarge
        ? 'Choose a CSV or XLSX file no larger than 20 MB.'
        : 'Choose one CSV or XLSX file.',
      variant: 'destructive',
    });
  }, []);

  const processFile = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file || uploading) return;

    setUploading(true);
    try {
      const uniqueName = `${Date.now()}-${crypto.randomUUID()}-${safeFilename(file.name)}`;
      const storagePath = `${workspaceId}/${uniqueName}`;
      const { error: uploadError } = await supabase.storage
        .from('radar-poc-uploads')
        .upload(storagePath, file, { contentType: contentTypeFor(file.name), upsert: false });
      if (uploadError) throw uploadError;

      const { data: harvestData, error: harvestError } = await supabase.functions.invoke<HarvestResult>(
        'radar-poc-harvest',
        { body: { agencyWorkspaceId: workspaceId, kind, storagePath, filename: file.name } },
      );
      if (harvestError) throw new Error(await serverErrorMessage(harvestError, 'Harvest failed.'));
      if (!harvestData?.uploadId) throw new Error('Harvest did not return an upload ID.');

      const totals: Required<Pick<UpsertResult, 'processed' | 'inserted' | 'duplicates' | 'excluded' | 'tasked' | 'queued'>> = {
        processed: 0,
        inserted: 0,
        duplicates: 0,
        excluded: 0,
        tasked: 0,
        queued: 0,
      };
      let keepGoing = true;
      let upsertCalls = 0;
      while (keepGoing) {
        upsertCalls += 1;
        const { data, error } = await supabase.functions.invoke<UpsertResult>('radar-opportunity-upsert', {
          body: {
            agencyWorkspaceId: workspaceId,
            uploadId: harvestData.uploadId,
            limit: UPSERT_BATCH_SIZE,
          },
        });
        if (error) throw new Error(await serverErrorMessage(error, 'Opportunity upsert failed.'));
        if (!data) throw new Error('Opportunity upsert returned no result.');
        if (data.errors?.length) {
          const label = data.errors.length === 1 ? 'row error' : 'row errors';
          throw new Error(`Opportunity upsert reported ${data.errors.length} ${label}.`);
        }

        totals.processed += numberOrZero(data.processed);
        totals.inserted += numberOrZero(data.inserted);
        totals.duplicates += numberOrZero(data.duplicates);
        totals.excluded += numberOrZero(data.excluded);
        totals.tasked += numberOrZero(data.tasked);
        totals.queued += numberOrZero(data.queued);
        keepGoing = shouldContinueUpsert(data);
        if (keepGoing && upsertCalls >= MAX_UPSERT_CALLS) {
          throw new Error('Opportunity upsert did not finish within the 25,000 row limit.');
        }
      }

      const rowCount = numberOrZero(harvestData.rowCount);
      const uniqueRows = harvestData.uniqueRows ?? rowCount;
      const validRows = harvestData.validRows ?? uniqueRows;
      const invalidRows = numberOrZero(harvestData.invalidRows);
      const duplicateRows = Math.max(0, rowCount - uniqueRows);
      const upsertSummary = [
        `${totals.inserted} added`,
        `${totals.duplicates} matched existing`,
        `${totals.excluded} excluded`,
        `${totals.tasked} tasked`,
        `${totals.queued} queued`,
      ].join(', ');

      toast({
        title: harvestData.duplicate ? 'Upload already harvested' : 'Radar upload complete',
        description: harvestData.duplicate
          ? `${rowCount} rows. This file matches an existing upload. ${upsertSummary}.`
          : `${rowCount} rows, ${validRows} valid, ${invalidRows} invalid, ${duplicateRows} duplicate. ${upsertSummary}.`,
      });
      onComplete?.();
    } catch (error) {
      toast({
        title: 'Radar upload failed',
        description: serverMessage(error, 'The file could not be processed.'),
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  }, [kind, onComplete, uploading, workspaceId]);

  const { getInputProps, getRootProps, isDragActive } = useDropzone({
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    disabled: uploading,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    multiple: false,
    onDropAccepted: processFile,
    onDropRejected: rejectFiles,
  });

  return (
    <section aria-labelledby="radar-upload-heading" className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h2 id="radar-upload-heading" className="text-base font-semibold text-cc-text-primary">
            Add Renewal radar records
          </h2>
          <p className="mt-1 text-sm text-cc-text-muted">
            Upload one CSV or one-sheet XLSX. Maximum 20 MB and 25,000 rows.
          </p>
        </div>
        <div className="w-full sm:w-48">
          <Label htmlFor="radar-upload-kind" className="text-sm text-cc-text-secondary">Record kind</Label>
          <Select
            value={kind}
            onValueChange={(value) => {
              if (value === 'cancel' || value === 'swo') setKind(value);
            }}
            disabled={uploading}
          >
            <SelectTrigger id="radar-upload-kind" className="mt-1 h-9 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cancel">Cancellation</SelectItem>
              <SelectItem value="swo">SWO</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div
        {...getRootProps()}
        className={cn(
          'mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-cc-lg border border-dashed border-cc-border-interactive bg-cc-surface-raised px-5 py-4 text-center transition-colors duration-fast',
          'focus-within:ring-2 focus-within:ring-cc-focus-ring focus-within:ring-offset-2',
          isDragActive && 'bg-cc-surface-overlay',
          uploading && 'cursor-not-allowed opacity-60',
        )}
      >
        <input {...getInputProps()} aria-label="Choose radar CSV or XLSX file" />
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-cc-text-muted motion-reduce:animate-none" aria-hidden="true" />
        ) : isDragActive ? (
          <FileSpreadsheet className="h-5 w-5 text-cc-text-secondary" aria-hidden="true" />
        ) : (
          <Upload className="h-5 w-5 text-cc-text-muted" aria-hidden="true" />
        )}
        <p className="mt-2 text-sm font-medium text-cc-text-primary">
          {uploading ? 'Uploading and processing' : isDragActive ? 'Drop the file here' : 'Drop a file here or browse'}
        </p>
        <p className="mt-1 text-xs text-cc-text-muted">Employer name is required. Include policy number, or county and expiration date.</p>
        {!uploading && (
          <Button type="button" variant="outline" className="mt-3 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay">
            Browse files
          </Button>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {uploading ? 'Radar file upload and processing in progress.' : ''}
      </p>
    </section>
  );
}
