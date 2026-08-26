import { useCallback, useRef, useState } from 'react';
import { Loader2, Paperclip } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import {
  CUSTOMER_DOCUMENT_ACCEPT,
  CustomerDocumentUploadError,
  uploadCustomerDocument,
} from '@/lib/documents/uploadCustomerDocument';

interface PolicyDocumentDropProps {
  accountId: string;
  policyId: string;
  /** Used in the toast and the accessible label so the target policy is named. */
  policyLabel?: string | null;
  /** Called after every successful upload, for callers that hold their own list. */
  onUploaded?: () => void;
  className?: string;
}

/**
 * Compact add-a-document control for a single policy card.
 *
 * Sits on the card's action row beside "View full policy" and the overflow.
 * Drop a file on it, or click it to pick one. The policy is already known, so
 * the file goes straight up with `documents.policy_id` set instead of routing
 * through the full Upload Document modal. It is deliberately a small ghost
 * control, never a lime fill: the one lime on this panel is "New policy".
 */
export function PolicyDocumentDrop({
  accountId,
  policyId,
  policyLabel,
  onUploaded,
  className,
}: PolicyDocumentDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // dragenter/dragleave fire for child nodes too, so track depth rather than a
  // bare boolean or the control flickers while the pointer is still over it.
  const dragDepth = useRef(0);
  const [isOver, setIsOver] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canManageDocuments } = usePermissions();

  const busy = progress !== null;
  const policyName = policyLabel ? `policy ${policyLabel}` : 'this policy';

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0 || busy) return;

    setProgress({ done: 0, total: files.length });
    let uploaded = 0;

    try {
      for (const file of files) {
        try {
          // No auto classify/route step here on purpose. The one the Upload
          // Document modal calls sends camelCase keys to an edge function that
          // requires document_id/file_name, so it has never actually run. Do
          // not copy it in without fixing that first: switching it on is a
          // behavior change (it toasts) and belongs in its own change.
          await uploadCustomerDocument({ file, accountId, policyId });
          uploaded += 1;
          setProgress({ done: uploaded, total: files.length });
        } catch (error) {
          const message = error instanceof CustomerDocumentUploadError
            ? error.message
            : 'Failed to add the document';
          toast({
            title: `Could not add ${file.name}`,
            description: message,
            variant: 'destructive',
          });
        }
      }

      if (uploaded > 0) {
        // Refreshes the Documents panel on this same customer page.
        await queryClient.invalidateQueries({ queryKey: ['documents'], refetchType: 'all' });
        onUploaded?.();
        toast({
          title: uploaded === 1 ? 'Document added' : `${uploaded} documents added`,
          description: `Attached to ${policyName} and filed under Documents.`,
        });
      }
    } finally {
      setProgress(null);
    }
  }, [accountId, busy, onUploaded, policyId, policyName, queryClient, toast]);

  // Only react to an actual file drag. Dragging text or a link must not light
  // the control up as if it were a valid target.
  const isFileDrag = (event: React.DragEvent) =>
    Array.from(event.dataTransfer?.types || []).includes('Files');

  const handleDragEnter = (event: React.DragEvent) => {
    if (busy || !isFileDrag(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsOver(true);
  };

  const handleDragOver = (event: React.DragEvent) => {
    if (busy || !isFileDrag(event)) return;
    // Without this the browser opens the file instead of firing onDrop.
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsOver(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    dragDepth.current = 0;
    setIsOver(false);
    if (busy || !isFileDrag(event)) return;
    event.preventDefault();
    void uploadFiles(Array.from(event.dataTransfer.files || []));
  };

  if (!canManageDocuments) return null;

  const label = busy
    ? (progress && progress.total > 1
        ? `Adding ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`
        : 'Adding')
    : isOver
      ? 'Drop to add'
      : 'Add document';

  return (
    <div className={cn('relative', className)}>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={CUSTOMER_DOCUMENT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          // Reset first so picking the same file twice still fires onChange.
          event.target.value = '';
          void uploadFiles(files);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-label={`Add a document to ${policyName}. Drop a file here or click to choose one.`}
        aria-busy={busy}
        title={`Drop a file here or click to add a document to ${policyName}`}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-cc-md border border-dashed px-3 text-sm',
          'transition-colors duration-base ease-glide',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isOver
            ? 'border-cc-accent bg-cc-surface-overlay text-cc-text-primary'
            : 'border-cc-border-interactive bg-transparent text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary',
          busy && 'cursor-not-allowed opacity-80',
        )}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Paperclip className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{label}</span>
      </button>

      {/* Thin accent progress bar while files are going up. One file reads as an
          indeterminate full bar; several fill in as each one lands. */}
      {busy && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-full bg-cc-surface-overlay"
        >
          <span
            className="block h-full animate-pulse bg-cc-accent transition-[width] duration-base ease-glide"
            style={{
              width: progress && progress.total > 1
                ? `${Math.max(10, (progress.done / progress.total) * 100)}%`
                : '100%',
            }}
          />
        </span>
      )}
    </div>
  );
}
