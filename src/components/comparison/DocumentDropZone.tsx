import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  error
}: DocumentDropZoneProps) => {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploadedFiles(acceptedFiles);
    await onFilesDropped(acceptedFiles);
  }, [onFilesDropped]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv']
    },
    maxFiles: 5,
    disabled: isProcessing
  });

  const getStatusIcon = () => {
    if (error) return <XCircle className="h-8 w-8 text-destructive" />;
    if (processedFile) return <CheckCircle2 className="h-8 w-8 text-green-500" />;
    if (isProcessing) return <Loader2 className="h-8 w-8 animate-spin text-primary" />;
    return <Upload className="h-8 w-8 text-muted-foreground" />;
  };

  return (
    <Card className="border-2 border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {title}
          {processedFile && (
            <Badge variant="outline" className="bg-green-50">
              Ready
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          {...getRootProps()}
          className={cn(
            "flex flex-col items-center justify-center p-8 rounded-lg transition-colors cursor-pointer min-h-[200px]",
            isDragActive && "bg-primary/5 border-primary",
            isProcessing && "opacity-50 cursor-not-allowed",
            !isDragActive && !isProcessing && "hover:bg-muted/50"
          )}
        >
          <input {...getInputProps()} />
          
          {getStatusIcon()}
          
          <div className="mt-4 text-center">
            {isProcessing ? (
              <p className="text-sm text-muted-foreground">Processing documents...</p>
            ) : processedFile ? (
              <>
                <p className="text-sm font-medium">{processedFile}</p>
                <p className="text-xs text-muted-foreground mt-1">Document processed successfully</p>
              </>
            ) : error ? (
              <>
                <p className="text-sm font-medium text-destructive">Processing failed</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </>
            ) : isDragActive ? (
              <p className="text-sm text-primary font-medium">Drop files here...</p>
            ) : (
              <>
                <p className="text-sm font-medium">Drop files or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, XLSX, or CSV files</p>
              </>
            )}
          </div>

          {uploadedFiles.length > 0 && !processedFile && !error && (
            <div className="mt-4 w-full">
              {uploadedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>{file.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
