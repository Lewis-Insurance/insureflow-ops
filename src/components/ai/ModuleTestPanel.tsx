/**
 * ModuleTestPanel
 * 
 * Allows users to test a draft module with sample documents
 * before publishing it to the team.
 */

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload, FileText, Loader2, CheckCircle, AlertCircle,
  Trash2, RefreshCw, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useExecuteModule } from '@/integrations/supabase/hooks/useAIModules';
import AIResultsDisplay from '@/components/ai/AIResultsDisplay';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ModuleTestPanelProps {
  moduleId: string;
}

interface UploadedFile {
  id: string;
  name: string;
  file: File;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  documentId?: string;
  error?: string;
}

export default function ModuleTestPanel({ moduleId }: ModuleTestPanelProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [textInput, setTextInput] = useState('');
  const [result, setResult] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();
  const executeModule = useExecuteModule();

  // File drop handler
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      file,
      status: 'pending',
    }));
    setFiles(prev => [...prev, ...newFiles]);
    setError(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg'],
      'text/*': ['.txt', '.csv'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
  });

  // Remove file
  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Clear all
  const clearAll = () => {
    setFiles([]);
    setTextInput('');
    setResult(null);
    setError(null);
  };

  // Upload files and execute module
  const runTest = async () => {
    if (files.length === 0) {
      setError('Please upload at least one document to test');
      return;
    }

    setIsExecuting(true);
    setError(null);
    setResult(null);

    try {
      // Upload files to Supabase storage
      const uploadedDocIds: string[] = [];

      for (const uploadFile of files) {
        setFiles(prev =>
          prev.map(f =>
            f.id === uploadFile.id ? { ...f, status: 'uploading' } : f
          )
        );

        // Upload to storage
        const filePath = `test-documents/${moduleId}/${Date.now()}-${uploadFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, uploadFile.file);

        if (uploadError) {
          setFiles(prev =>
            prev.map(f =>
              f.id === uploadFile.id
                ? { ...f, status: 'error', error: uploadError.message }
                : f
            )
          );
          continue;
        }

        // Don't persist a public URL (Batch 6A): the durable `storage_path` is
        // stored instead; sign on read via getSignedStorageUrl when display is needed.
        // Create document record
        const { data: docData, error: docError } = await supabase
          .from('documents')
          .insert({
            file_name: uploadFile.name,
            file_type: uploadFile.file.type,
            file_size: uploadFile.file.size,
            storage_path: filePath,
            file_url: null,
            status: 'pending',
          })
          .select()
          .single();

        if (docError) {
          setFiles(prev =>
            prev.map(f =>
              f.id === uploadFile.id
                ? { ...f, status: 'error', error: docError.message }
                : f
            )
          );
          continue;
        }

        uploadedDocIds.push(docData.id);
        setFiles(prev =>
          prev.map(f =>
            f.id === uploadFile.id
              ? { ...f, status: 'uploaded', documentId: docData.id }
              : f
          )
        );
      }

      if (uploadedDocIds.length === 0) {
        throw new Error('Failed to upload any documents');
      }

      // Execute the module
      const executionResult = await executeModule.mutateAsync({
        moduleSlug: moduleId, // Using moduleId as slug for now
        documentIds: uploadedDocIds,
        inputText: textInput || undefined,
      });

      setResult(executionResult);

      toast({
        title: 'Test completed!',
        description: 'Check the results below.',
      });
    } catch (err: any) {
      console.error('Test execution error:', err);
      setError(err.message || 'Failed to execute test');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50'
        )}
      >
        <input {...getInputProps()} />
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {isDragActive
            ? 'Drop your test documents here...'
            : 'Drag & drop test documents, or click to select'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, images, or text files (max 10MB each)
        </p>
      </div>

      {/* Uploaded Files */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Test Documents ({files.length})
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="text-xs"
            >
              Clear all
            </Button>
          </div>
          
          {files.map(file => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-2 rounded-md bg-muted/50"
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-sm truncate">{file.name}</span>
              
              {file.status === 'pending' && (
                <Badge variant="outline" className="text-xs">Ready</Badge>
              )}
              {file.status === 'uploading' && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
              {file.status === 'uploaded' && (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              {file.status === 'error' && (
                <Badge variant="destructive" className="text-xs">
                  {file.error || 'Error'}
                </Badge>
              )}
              
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => removeFile(file.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Text Input */}
      <div>
        <Textarea
          placeholder="Optional: Add specific questions or instructions..."
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          rows={2}
        />
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Run Button */}
      <Button
        onClick={runTest}
        disabled={files.length === 0 || isExecuting}
        className="w-full"
      >
        {isExecuting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Running test...
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4 mr-2" />
            Run Test
          </>
        )}
      </Button>

      {/* Results */}
      {result && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="font-medium">Test Results</span>
              {result.processing_time_ms && (
                <Badge variant="outline" className="text-xs">
                  {result.processing_time_ms}ms
                </Badge>
              )}
            </div>
            
            <ScrollArea className="max-h-[400px]">
              <AIResultsDisplay
                result={result.result}
                outputConfig={result.output_config || {}}
                emailDraft={
                  result.email_draft_subject
                    ? {
                        subject: result.email_draft_subject,
                        body: result.email_draft_body,
                      }
                    : null
                }
              />
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

