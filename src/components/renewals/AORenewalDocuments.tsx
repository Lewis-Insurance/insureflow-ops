import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Upload,
  Loader2,
  Download,
  Trash2,
  Eye,
  File,
  FileImage,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface AORenewalDocumentsProps {
  renewalId: string;
  customerName: string;
  policyNumber: string;
}

interface RenewalDocument {
  id: string;
  filename: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
  document_type: string | null;
}

export function AORenewalDocuments({ renewalId, customerName, policyNumber }: AORenewalDocumentsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);

  // Fetch documents linked to this renewal
  const { data: documents, isLoading } = useQuery({
    queryKey: ['ao-renewal-documents', renewalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('id, filename, storage_path, mime_type, file_size, created_at, document_type')
        .eq('related_entity_type', 'ao_renewal')
        .eq('related_entity_id', renewalId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as RenewalDocument[];
    },
  });

  // Upload document mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user?.id) throw new Error('Not authenticated');

      setIsUploading(true);

      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const storagePath = `ao-renewals/${renewalId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Create document record
      const { error: insertError } = await supabase
        .from('documents')
        .insert({
          filename: file.name,
          storage_path: storagePath,
          mime_type: file.type,
          file_size: file.size,
          kind: 'ao_policy',
          document_type: 'current_policy',
          related_entity_type: 'ao_renewal',
          related_entity_id: renewalId,
        });

      if (insertError) throw insertError;

      return storagePath;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ao-renewal-documents', renewalId] });
      toast({
        title: 'Document uploaded',
        description: 'The policy document has been attached to this renewal.',
      });
      setIsUploading(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsUploading(false);
    },
  });

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: async (doc: RenewalDocument) => {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([doc.storage_path]);

      if (storageError) console.error('Storage delete error:', storageError);

      // Delete record
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', doc.id);

      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ao-renewal-documents', renewalId] });
      toast({
        title: 'Document deleted',
        description: 'The document has been removed.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      await uploadMutation.mutateAsync(file);
    }
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.tiff', '.tif'],
    },
    disabled: isUploading,
  });

  // Get signed URL for viewing/downloading
  const handleView = async (doc: RenewalDocument) => {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, 3600);

    if (error) {
      toast({ title: 'Error', description: 'Could not open document', variant: 'destructive' });
      return;
    }

    window.open(data.signedUrl, '_blank');
  };

  const handleDownload = async (doc: RenewalDocument) => {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, 60);

    if (error) {
      toast({ title: 'Error', description: 'Could not download document', variant: 'destructive' });
      return;
    }

    // Create download link
    const link = document.createElement('a');
    link.href = data.signedUrl;
    link.download = doc.filename;
    link.click();
  };

  const getFileIcon = (mimeType: string | null) => {
    if (mimeType?.startsWith('image/')) return FileImage;
    if (mimeType === 'application/pdf') return FileText;
    return File;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Policy Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Area */}
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all',
            isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary hover:bg-muted/50',
            isUploading && 'opacity-50 cursor-not-allowed'
          )}
        >
          <input {...getInputProps()} />
          {isUploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Uploading...</span>
            </div>
          ) : (
            <>
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">
                {isDragActive ? 'Drop files here' : 'Upload Prior/Current AO Policy'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF or image files
              </p>
            </>
          )}
        </div>

        {/* Documents List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : documents && documents.length > 0 ? (
          <div className="space-y-2">
            {documents.map((doc) => {
              const FileIcon = getFileIcon(doc.mime_type);
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.filename}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                        <span>
                          {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary" className="text-xs">
                      {doc.document_type || 'Policy'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleView(doc)}
                      title="View"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(doc)}
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(doc)}
                      disabled={deleteMutation.isPending}
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No documents attached yet. Upload the prior or current AO policy to keep it with this renewal.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
