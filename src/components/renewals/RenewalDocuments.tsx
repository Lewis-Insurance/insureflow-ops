import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { Upload, FileText, File, Image, Trash2, Download, Eye, FolderOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  useRenewalDocuments,
  useUploadRenewalDocument,
  useDeleteRenewalDocument,
  RenewalDocument,
  DocumentType,
} from '@/hooks/useRenewalWorkflow';
import { supabase } from '@/integrations/supabase/client';
import { getSignedStorageUrl } from '@/lib/storageUrl';

interface RenewalDocumentsProps {
  renewalId: string;
}

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'dec_page', label: 'Declaration Page' },
  { value: 'quote', label: 'Quote' },
  { value: 'application', label: 'Application' },
  { value: 'endorsement', label: 'Endorsement' },
  { value: 'policy', label: 'Policy Document' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'claim', label: 'Claim Document' },
  { value: 'other', label: 'Other' },
];

function getDocumentTypeBadge(type: DocumentType | null) {
  if (!type) return null;
  const config = DOCUMENT_TYPES.find((t) => t.value === type);
  return <Badge variant="outline">{config?.label || type}</Badge>;
}

function getFileIcon(fileType: string | null) {
  if (fileType?.includes('pdf')) return <FileText className="h-5 w-5 text-red-500" />;
  if (fileType?.includes('image')) return <Image className="h-5 w-5 text-blue-500" />;
  return <File className="h-5 w-5 text-gray-500" />;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RenewalDocuments({ renewalId }: RenewalDocumentsProps) {
  const { data: documents, isLoading, error } = useRenewalDocuments(renewalId);
  const uploadDocument = useUploadRenewalDocument();
  const deleteDocument = useDeleteRenewalDocument();

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RenewalDocument | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>('other');
  const [description, setDescription] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);

    // Auto-detect document type from filename
    const name = file.name.toLowerCase();
    if (name.includes('dec') || name.includes('declaration')) {
      setDocumentType('dec_page');
    } else if (name.includes('quote')) {
      setDocumentType('quote');
    } else if (name.includes('application') || name.includes('app')) {
      setDocumentType('application');
    } else if (name.includes('endorsement')) {
      setDocumentType('endorsement');
    } else if (name.includes('policy')) {
      setDocumentType('policy');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
      setShowUploadModal(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleUpload = () => {
    if (!selectedFile) return;

    uploadDocument.mutate(
      {
        renewalId,
        file: selectedFile,
        document_type: documentType,
        description: description || undefined,
      },
      {
        onSuccess: () => {
          setShowUploadModal(false);
          setSelectedFile(null);
          setDocumentType('other');
          setDescription('');
        },
      }
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteDocument.mutate(
      {
        documentId: deleteTarget.id,
        renewalId,
        filePath: deleteTarget.file_path,
      },
      {
        onSuccess: () => setDeleteTarget(null),
      }
    );
  };

  const handleDownload = async (doc: RenewalDocument) => {
    const { data, error } = await supabase.storage
      .from('documents')
      .download(doc.file_path);

    if (error || !data) {
      console.error('Download error:', error);
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleView = async (doc: RenewalDocument) => {
    const signedUrl = await getSignedStorageUrl('documents', doc.file_path);
    if (signedUrl) window.open(signedUrl, '_blank');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-destructive">
          <p>Failed to load documents</p>
        </CardContent>
      </Card>
    );
  }

  // Group documents by type
  const groupedDocs = (documents || []).reduce((acc, doc) => {
    const type = doc.document_type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(doc);
    return acc;
  }, {} as Record<string, RenewalDocument[]>);

  return (
    <>
      <Card
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={isDragging ? 'border-primary border-2 border-dashed' : ''}
      >
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Documents</CardTitle>
          <Button size="sm" onClick={() => setShowUploadModal(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
        </CardHeader>
        <CardContent>
          {documents && documents.length > 0 ? (
            <div className="space-y-6">
              {DOCUMENT_TYPES.map((type) => {
                const docs = groupedDocs[type.value];
                if (!docs?.length) return null;

                return (
                  <div key={type.value}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      {type.label} ({docs.length})
                    </h3>
                    <div className="space-y-2">
                      {docs.map((doc) => (
                        <DocumentRow
                          key={doc.id}
                          document={doc}
                          onView={() => handleView(doc)}
                          onDownload={() => handleDownload(doc)}
                          onDelete={() => setDeleteTarget(doc)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className={`text-center py-8 border-2 border-dashed rounded-lg ${
                isDragging ? 'border-primary bg-primary/5' : 'border-muted'
              }`}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="font-medium text-muted-foreground">
                {isDragging ? 'Drop file here' : 'No documents yet'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Drag and drop or click Upload to add documents
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Modal */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Add a document to this renewal
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* File Input */}
            <div className="space-y-2">
              <Label>File</Label>
              {selectedFile ? (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  {getFileIcon(selectedFile.type)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <Input
                    type="file"
                    className="hidden"
                    id="file-upload"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">Click to select file</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PDF, Word, or images up to 10MB
                    </p>
                  </label>
                </div>
              )}
            </div>

            {/* Document Type */}
            <div className="space-y-2">
              <Label>Document Type</Label>
              <Select
                value={documentType}
                onValueChange={(value) => setDocumentType(value as DocumentType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Brief description of this document..."
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {uploadDocument.isPending && (
              <div className="space-y-2">
                <Progress value={undefined} className="h-2" />
                <p className="text-sm text-muted-foreground text-center">Uploading...</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploadDocument.isPending}
            >
              {uploadDocument.isPending ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DocumentRow({
  document,
  onView,
  onDownload,
  onDelete,
}: {
  document: RenewalDocument;
  onView: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      {getFileIcon(document.file_type)}

      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{document.name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {document.file_size && <span>{formatFileSize(document.file_size)}</span>}
          <span>·</span>
          <span>{format(new Date(document.created_at), 'MMM d, yyyy')}</span>
          {document.uploader?.full_name && (
            <>
              <span>·</span>
              <span>by {document.uploader.full_name}</span>
            </>
          )}
        </div>
        {document.description && (
          <p className="text-xs text-muted-foreground mt-1">{document.description}</p>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onView}>
          <Eye className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDownload}>
          <Download className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
