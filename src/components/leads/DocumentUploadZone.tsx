import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileUp, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DocumentUploadZoneProps {
  onFileSelect: (file: File) => void;
  acceptedTypes?: string[];
  maxSizeMB?: number;
  currentFile?: File | null;
  onClearFile?: () => void;
}

export const DocumentUploadZone = ({
  onFileSelect,
  acceptedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.docx'],
  maxSizeMB = 10,
  currentFile,
  onClearFile,
}: DocumentUploadZoneProps) => {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: any[]) => {
      setError(null);

      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0];
        if (rejection.errors[0]?.code === 'file-too-large') {
          setError(`File is too large. Maximum size is ${maxSizeMB}MB.`);
        } else if (rejection.errors[0]?.code === 'file-invalid-type') {
          setError(`Invalid file type. Accepted types: ${acceptedTypes.join(', ')}`);
        } else {
          setError('File upload failed. Please try again.');
        }
        return;
      }

      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        
        // Additional validation
        if (file.size > maxSizeMB * 1024 * 1024) {
          setError(`File is too large. Maximum size is ${maxSizeMB}MB.`);
          return;
        }

        // Validate file name length
        if (file.name.length > 255) {
          setError('File name is too long. Please rename the file and try again.');
          return;
        }

        onFileSelect(file);
      }
    },
    [onFileSelect, maxSizeMB, acceptedTypes]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedTypes.reduce((acc, type) => {
      const mimeTypes: Record<string, string[]> = {
        '.pdf': ['application/pdf'],
        '.jpg': ['image/jpeg'],
        '.jpeg': ['image/jpeg'],
        '.png': ['image/png'],
        '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      };
      return { ...acc, ...Object.fromEntries(mimeTypes[type]?.map(m => [m, [type]]) || []) };
    }, {}),
    maxSize: maxSizeMB * 1024 * 1024,
    multiple: false,
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
          error && "border-destructive"
        )}
      >
        <input {...getInputProps()} />
        <FileUp className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm font-medium mb-1">
          {isDragActive ? "Drop the file here" : "Drag & drop a document here"}
        </p>
        <p className="text-xs text-muted-foreground mb-2">or click to browse</p>
        <p className="text-xs text-muted-foreground">
          Accepted: {acceptedTypes.join(', ')} (max {maxSizeMB}MB)
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {currentFile && (
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div className="flex items-center gap-3">
            <FileUp className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">{currentFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(currentFile.size)}
              </p>
            </div>
          </div>
          {onClearFile && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClearFile();
                setError(null);
              }}
              className="p-1 hover:bg-background rounded-full transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
