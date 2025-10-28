import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function StorageDiagnostics() {
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<any>(null);

  const checkLastUpload = async () => {
    setChecking(true);
    try {
      // Get the most recent document
      const { data: docs, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;

      // Get file info from storage
      const { data: fileList, error: listError } = await supabase.storage
        .from('documents')
        .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

      if (listError) throw listError;

      const fileInfo = fileList.find(f => f.name === docs.storage_path);

      // Try to download and check size
      const { data: downloadData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(docs.storage_path);

      if (downloadError) throw downloadError;

      const fileSizeInStorage = downloadData.size;
      const fileSizeInDB = docs.file_size;

      setResult({
        fileName: docs.filename,
        dbSize: fileSizeInDB,
        storageSize: fileSizeInStorage,
        match: fileSizeInDB === fileSizeInStorage,
        storageMetadata: fileInfo,
      });

      toast({
        title: 'Diagnostics Complete',
        description: `DB Size: ${(fileSizeInDB / 1024).toFixed(2)} KB, Storage Size: ${(fileSizeInStorage / 1024).toFixed(2)} KB`,
      });

    } catch (error: any) {
      console.error('Diagnostic Error:', error);
      toast({
        title: 'Diagnostic Failed',
        description: error.message,
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
            <p><strong>File:</strong> {result.fileName}</p>
            <p><strong>DB Size:</strong> {(result.dbSize / 1024).toFixed(2)} KB</p>
            <p><strong>Storage Size:</strong> {(result.storageSize / 1024).toFixed(2)} KB</p>
            <p className={result.match ? 'text-green-600' : 'text-red-600'}>
              <strong>Match:</strong> {result.match ? '✓ Yes' : '✗ No - File corrupted!'}
            </p>
            <pre className="text-xs bg-muted p-2 rounded overflow-auto">
              {JSON.stringify(result.storageMetadata, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
