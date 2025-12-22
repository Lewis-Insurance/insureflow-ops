import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  FileText,
  MoreVertical,
  Eye,
  Pencil,
  Trash2,
  Sparkles,
  Download,
  ExternalLink,
  Upload,
  File,
  FileImage,
  FileSpreadsheet,
} from 'lucide-react';
import { useDocuments, useDeleteDocument, useUpdateDocument, useDocumentUrl, type Document } from '@/hooks/useDocuments';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { DocumentAIAnalysisModal } from './DocumentAIAnalysisModal';

interface DocumentsListProps {
  accountId?: string;
  policyId?: string;
  title?: string;
  showPolicyColumn?: boolean;
  onUploadClick?: () => void;
  onAskAI?: (document: Document) => void;
}

const DOCUMENT_TYPES = [
  { value: 'COI', label: 'Certificate of Insurance' },
  { value: 'ACORD', label: 'ACORD Form' },
  { value: 'dec_page', label: 'Declaration Page' },
  { value: 'endorsement', label: 'Endorsement' },
  { value: 'application', label: 'Application' },
  { value: 'loss_run', label: 'Loss Run' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'id_card', label: 'ID Card' },
  { value: 'agreement', label: 'Agreement' },
  { value: 'other', label: 'Other' },
];

function getFileIcon(mimeType: string | null, filename: string) {
  if (mimeType?.startsWith('image/')) {
    return <FileImage className="h-4 w-4 text-blue-500" />;
  }
  if (mimeType?.includes('spreadsheet') || filename.endsWith('.xlsx') || filename.endsWith('.csv')) {
    return <FileSpreadsheet className="h-4 w-4 text-green-500" />;
  }
  if (mimeType?.includes('pdf')) {
    return <FileText className="h-4 w-4 text-red-500" />;
  }
  return <File className="h-4 w-4 text-muted-foreground" />;
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentActions({
  document,
  onView,
  onEdit,
  onDelete,
  onAskAI,
  onDownload,
}: {
  document: Document;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAskAI: () => void;
  onDownload: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onView}>
          <Eye className="h-4 w-4 mr-2" />
          View
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDownload}>
          <Download className="h-4 w-4 mr-2" />
          Download
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="h-4 w-4 mr-2" />
          Edit Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onAskAI}>
          <Sparkles className="h-4 w-4 mr-2" />
          Ask AI
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DocumentsList({
  accountId,
  policyId,
  title = 'Documents',
  showPolicyColumn = false,
  onUploadClick,
  onAskAI,
}: DocumentsListProps) {
  const { data: documents = [], isLoading } = useDocuments({ accountId, policyId });
  const deleteDocument = useDeleteDocument();
  const updateDocument = useUpdateDocument();

  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<Document | null>(null);
  const [aiAnalysisDoc, setAiAnalysisDoc] = useState<Document | null>(null);
  const [editForm, setEditForm] = useState({ filename: '', kind: '' });

  const handleView = async (doc: Document) => {
    setViewingDoc(doc);
  };

  const handleEdit = (doc: Document) => {
    setEditForm({ filename: doc.filename, kind: doc.kind });
    setEditingDoc(doc);
  };

  const handleSaveEdit = () => {
    if (editingDoc) {
      updateDocument.mutate({
        id: editingDoc.id,
        updates: {
          filename: editForm.filename,
          kind: editForm.kind,
        },
      });
      setEditingDoc(null);
    }
  };

  const handleDelete = (doc: Document) => {
    setDeletingDoc(doc);
  };

  const confirmDelete = () => {
    if (deletingDoc) {
      deleteDocument.mutate(deletingDoc.id);
      setDeletingDoc(null);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(doc.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const handleAskAI = (doc: Document) => {
    setAiAnalysisDoc(doc);
    // Also call external handler if provided
    if (onAskAI) {
      onAskAI(doc);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">Loading documents...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {title}
            <Badge variant="secondary" className="ml-2">
              {documents.length}
            </Badge>
          </CardTitle>
          {onUploadClick && (
            <Button size="sm" onClick={onUploadClick}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No documents found</p>
              {onUploadClick && (
                <Button variant="outline" className="mt-4" onClick={onUploadClick}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload First Document
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  {showPolicyColumn && <TableHead>Policy</TableHead>}
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getFileIcon(doc.mime_type, doc.filename)}
                        <span className="font-medium truncate max-w-[200px]" title={doc.filename}>
                          {doc.filename}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {DOCUMENT_TYPES.find((t) => t.value === doc.kind)?.label || doc.kind}
                      </Badge>
                    </TableCell>
                    {showPolicyColumn && (
                      <TableCell>
                        {doc.policy ? (
                          <span className="text-sm">
                            {doc.policy.policy_number}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground">
                      {formatFileSize(doc.file_size)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <DocumentActions
                        document={doc}
                        onView={() => handleView(doc)}
                        onEdit={() => handleEdit(doc)}
                        onDelete={() => handleDelete(doc)}
                        onAskAI={onAskAI ? () => handleAskAI(doc) : undefined}
                        onDownload={() => handleDownload(doc)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View Document Dialog */}
      <Dialog open={!!viewingDoc} onOpenChange={() => setViewingDoc(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingDoc && getFileIcon(viewingDoc.mime_type, viewingDoc.filename)}
              {viewingDoc?.filename}
            </DialogTitle>
          </DialogHeader>
          {viewingDoc && <DocumentViewer document={viewingDoc} />}
        </DialogContent>
      </Dialog>

      {/* Edit Document Dialog */}
      <Dialog open={!!editingDoc} onOpenChange={() => setEditingDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>
              Update the document details below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="filename">Filename</Label>
              <Input
                id="filename"
                value={editForm.filename}
                onChange={(e) => setEditForm({ ...editForm, filename: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kind">Document Type</Label>
              <Select
                value={editForm.kind}
                onValueChange={(value) => setEditForm({ ...editForm, kind: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDoc(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateDocument.isPending}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingDoc} onOpenChange={() => setDeletingDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingDoc?.filename}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Analysis Modal */}
      <DocumentAIAnalysisModal
        open={!!aiAnalysisDoc}
        onOpenChange={(open) => !open && setAiAnalysisDoc(null)}
        document={aiAnalysisDoc}
      />
    </>
  );
}

function DocumentViewer({ document: doc }: { document: Document }) {
  const { data: url, isLoading } = useDocumentUrl(doc.storage_path);

  if (isLoading) {
    return <div className="text-center py-8">Loading document...</div>;
  }

  if (!url) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Unable to load document preview.</p>
        <Button variant="outline" className="mt-4" onClick={() => window.open(url!, '_blank')}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Open in New Tab
        </Button>
      </div>
    );
  }

  // For PDFs and images, show inline preview
  if (doc.mime_type?.includes('pdf')) {
    return (
      <iframe
        src={url}
        className="w-full h-[70vh] rounded border"
        title={doc.filename}
      />
    );
  }

  if (doc.mime_type?.startsWith('image/')) {
    return (
      <div className="flex justify-center">
        <img
          src={url}
          alt={doc.filename}
          className="max-w-full max-h-[70vh] rounded"
        />
      </div>
    );
  }

  // For other files, show download option
  return (
    <div className="text-center py-8">
      <File className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
      <p className="mb-4">Preview not available for this file type.</p>
      <Button onClick={() => window.open(url, '_blank')}>
        <Download className="h-4 w-4 mr-2" />
        Download File
      </Button>
    </div>
  );
}

export default DocumentsList;

