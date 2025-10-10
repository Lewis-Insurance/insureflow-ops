import React, { useRef } from 'react';
import { Upload, Download, Trash2, File, FileText, Image, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDocumentManager, DocumentRecord } from '@/hooks/useDocumentManager';
import { PermissionGuard } from '@/components/common/PermissionGuard';
import { formatBytes } from '@/lib/utils';
import { DocumentAnalysisButton } from '@/components/ai/DocumentAnalysisButton';

interface DocumentManagerProps {
  accountId: string;
  className?: string;
}

const DOCUMENT_CATEGORIES = [
  { value: 'id', label: 'ID Documents' },
  { value: 'proof_of_address', label: 'Proof of Address' },
  { value: 'dec_page', label: 'Declaration Page' },
  { value: 'quote', label: 'Quote' },
  { value: 'claim', label: 'Claim Documents' },
  { value: 'other', label: 'Other' }
];

export function DocumentManager({ accountId, className = "" }: DocumentManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    documents,
    loading,
    uploading,
    uploadDocument,
    downloadDocument,
    deleteDocument,
    canManageDocuments
  } = useDocumentManager(accountId);

  const [selectedCategory, setSelectedCategory] = React.useState('other');

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      await uploadDocument(file, selectedCategory);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFileIcon = (mimeType?: string) => {
    if (!mimeType) return <File className="h-4 w-4" />;
    
    if (mimeType.startsWith('image/')) return <Image className="h-4 w-4" />;
    if (mimeType.includes('pdf')) return <FileText className="h-4 w-4" />;
    if (mimeType.includes('zip') || mimeType.includes('rar')) return <Archive className="h-4 w-4" />;
    
    return <File className="h-4 w-4" />;
  };

  const getCategoryBadgeVariant = (category: string) => {
    switch (category) {
      case 'id': return 'destructive';
      case 'proof_of_address': return 'default';
      case 'dec_page': return 'secondary';
      case 'quote': return 'outline';
      case 'claim': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Documents</CardTitle>
          <div className="flex items-center gap-2">
            {documents.length > 0 && (
              <DocumentAnalysisButton
                accountId={accountId}
                variant="outline"
                size="sm"
              />
            )}
            <PermissionGuard permission="canManageDocuments">
              <div className="flex items-center space-x-2">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_CATEGORIES.map(category => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  size="sm"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? 'Uploading...' : 'Upload'}
                </Button>
              </div>
            </PermissionGuard>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.zip,.rar"
        />

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            <span className="ml-2">Loading documents...</span>
          </div>
        )}

        {!loading && documents.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <File className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No documents uploaded yet</p>
            <PermissionGuard permission="canManageDocuments">
              <p className="text-sm mt-2">Click "Upload" to add documents</p>
            </PermissionGuard>
          </div>
        )}

        {!loading && documents.length > 0 && (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  {getFileIcon(doc.mime_type)}
                  <div>
                    <div className="font-medium">{doc.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center space-x-2">
                      <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                      {doc.size_bytes && (
                        <>
                          <span>•</span>
                          <span>{formatBytes(doc.size_bytes)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Badge variant={getCategoryBadgeVariant(doc.category)}>
                    {DOCUMENT_CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}
                  </Badge>
                  
                  <DocumentAnalysisButton
                    documentId={doc.id}
                    documentName={doc.name}
                    variant="ghost"
                    size="sm"
                  />
                  
                  <PermissionGuard permission="canManageDocuments">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadDocument(doc)}
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteDocument(doc.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </PermissionGuard>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}