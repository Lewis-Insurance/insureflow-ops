import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  storageSizeMatchLabel,
  type StorageSizeMatchResult,
} from '@/lib/storageSizeMatchLabel';
import { cn } from '@/lib/utils';

interface DiagnosticResult {
  fileName: string;
  storagePath: string;
  dbSize: number | null;
  storageSize: number | null;
  match: StorageSizeMatchResult;
  mimeType: string | null;
}

const toneClassName: Record<StorageSizeMatchResult['tone'], string> = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

function formatSizeKb(bytes: number | null | undefined): string {
  if (bytes == null) return 'Unknown';
  return `${(bytes / 1024).toFixed(2)} KB`;
}

export function StorageDiagnostics() {
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);

  const checkLastUpload = async () => {
    setChecking(true);
    try {
      const { data: doc, error } = await supabase
        .from('documents')
        .select('filename, storage_path, file_size, mime_type')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;

      if (!doc.storage_path) {
        throw new Error('Latest document has no storage path');
      }

      const { data: downloadData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(doc.storage_path);

      const downloadFailed = Boolean(downloadError) || !downloadData;
      const storageSize = downloadData?.size ?? null;
      const match = storageSizeMatchLabel(doc.file_size, storageSize, {
        downloadFailed,
      });

      const diagnostic: DiagnosticResult = {
        fileName: doc.filename,
        storagePath: doc.storage_path,
        dbSize: doc.file_size,
        storageSize,
        match,
        mimeType: downloadData?.type ?? doc.mime_type,
      };

      setResult(diagnostic);

      if (downloadError) {
        throw downloadError;
      }

      toast({
        title: 'Diagnostics complete',
        description: `DB size: ${formatSizeKb(doc.file_size)}, storage size: ${formatSizeKb(storageSize)}`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Diagnostic error:', error);
      toast({
        title: 'Diagnostic failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Storage Diagnostics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={checkLastUpload} disabled={checking}>
          {checking ? 'Checking...' : 'Check Last Upload'}
        </Button>

        {result && (
          <div className="space-y-2 text-sm">
            <p>
              <strong>File:</strong> {result.fileName}
            </p>
            <p>
              <strong>Storage path:</strong> {result.storagePath}
            </p>
            <p>
              <strong>DB size:</strong> {formatSizeKb(result.dbSize)}
            </p>
            <p>
              <strong>Storage size:</strong> {formatSizeKb(result.storageSize)}
            </p>
            {result.mimeType && (
              <p>
                <strong>Content type:</strong> {result.mimeType}
              </p>
            )}
            <p className={cn('font-medium', toneClassName[result.match.tone])}>
              {result.match.label}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
