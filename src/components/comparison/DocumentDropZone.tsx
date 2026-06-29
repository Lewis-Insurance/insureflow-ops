import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocumentDropZoneProps {
  title: string;
  description: string;
  onFilesDropped: (files: File[]) => Promise<void>;
  isProcessing?: boolean;
  processedFile?: string;
  error?: string;
}

export const DocumentDropZone = ({
  title,
  description,
  onFilesDropped,
  isProcessing = false,
  processedFile,
  error,
}: DocumentDropZoneProps) => {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setUploadedFiles(acceptedFiles);
      await onFilesDropped(acceptedFiles);
    },
    [onFilesDropped],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
    },
    maxFiles: 5,
    disabled: isProcessing,
  });

  const statusIcon = error ? (
    <XCircle className="h-8 w-8 text-cc-danger" aria-hidden="true" />
  ) : processedFile ? (
    <CheckCircle2 className="h-8 w-8 text-cc-success" aria-hidden="true" />
  ) : isProcessing ? (
    <Loader2 className="h-8 w-8 animate-spin text-cc-text-muted" aria-hidden="true" />
  ) : (
    <Upload className="h-8 w-8 text-cc-text-muted" aria-hidden="true" />
  );

  return (
    <div className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
      <div className="flex items-start justify-between gap-3 border-b border-cc-border-subtle px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-cc-text-primary">{title}</h2>
          <p className="mt-0.5 text-sm text-cc-text-muted">{description}</p>
        </div>
        {processedFile && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-cc-surface-overlay px-2.5 py-0.5 text-xs font-medium text-cc-success">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Ready
          </span>
        )}
      </div>

      <div className="p-5">
        <div
          {...getRootProps()}
          className={cn(
            'flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-cc-lg border-2 border-dashed p-8 text-center transition-colors',
            isDragActive ? 'border-cc-accent bg-cc-surface-raised' : 'border-cc-border-interactive',
            isProcessing ? 'cursor-not-allowed opacity-50' : !isDragActive && 'hover:bg-cc-surface-raised',
          )}
        >
          <input {...getInputProps()} aria-label={`Upload documents for ${title}`} />

          {statusIcon}

          <div className="mt-4">
            {isProcessing ? (
              <p className="text-sm text-cc-text-muted">Processing documents</p>
            ) : processedFile ? (
              <>
                <p className="text-sm font-medium text-cc-text-primary">{processedFile}</p>
                <p className="mt-1 text-xs text-cc-text-muted">Document processed successfully</p>
              </>
            ) : error ? (
              <>
                <p className="text-sm font-medium text-cc-danger">Processing failed</p>
                <p className="mt-1 text-xs text-cc-text-muted">{error}</p>
              </>
            ) : isDragActive ? (
              <p className="text-sm font-medium text-cc-text-primary">Drop files here</p>
            ) : (
              <>
                <p className="text-sm font-medium text-cc-text-primary">Drop files or click to upload</p>
                <p className="mt-1 text-xs text-cc-text-muted">PDF, XLSX, or CSV files</p>
              </>
            )}
          </div>

          {uploadedFiles.length > 0 && !processedFile && !error && (
            <div className="mt-4 w-full space-y-1">
              {uploadedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-center gap-2 text-sm text-cc-text-secondary">
                  <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="cc-num truncate">{file.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
