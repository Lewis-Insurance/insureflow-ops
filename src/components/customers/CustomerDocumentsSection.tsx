import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDocumentManager } from '@/hooks/useDocumentManager';
import { UploadDocModal } from './UploadDocModal';
import { FileText, Download, Trash2, Upload, Calendar, FileType, Brain } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { useAIAssistantContext } from '@/contexts/AIAssistantContext';

interface CustomerDocumentsSectionProps {
  accountId: string;
}

export function CustomerDocumentsSection({ accountId }: CustomerDocumentsSectionProps) {
  const { openSidebar } = useAIAssistantContext();
  const {
    documents,
    loading,
    checking,
    viewDocument,
    downloadDocument,
    deleteDocument,
    canManageDocuments,
    refetch: fetchDocuments,
    replaceDocumentFile,
    checkIntegrity,
    getDocumentUrl
  } = useDocumentManager(accountId);
  
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [repairDocId, setRepairDocId] = useState<string | null>(null);
  
  const handleUploadSuccess = () => {
    // Refresh the documents list after successful upload
    fetchDocuments();
    setUploadModalOpen(false);
  };

  const handleReplace = async (doc: any) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*,.doc,.docx,.txt';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        await replaceDocumentFile(doc, file);
        setRepairDocId(null);
        fetchDocuments();
      }
    };
    input.click();
  };
  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown size';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const getCategoryColor = (category: string) => {
    switch (category?.toLowerCase()) {
      case 'policy':
        return 'default';
      case 'claim':
        return 'destructive';
      case 'application':
        return 'secondary';
      case 'id':
      case 'identification':
        return 'outline';
      default:
        return 'secondary';
    }
  };


  if (loading) {
    return (
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading documents...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documents ({documents.length})
        </CardTitle>
        <div className="flex gap-2">
          {canManageDocuments && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={checkIntegrity}
                disabled={checking}
              >
                {checking ? 'Checking...' : 'Check Integrity'}
              </Button>
              <Button
                size="sm"
                onClick={() => setUploadModalOpen(true)}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Documents</h3>
            <p className="text-muted-foreground mb-4">
              No documents have been uploaded for this customer yet.
            </p>
            {canManageDocuments && (
              <Button onClick={() => setUploadModalOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload First Document
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((document) => (
              <div
                key={document.id}
                className="border rounded-lg p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileType className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium truncate">{document.name}</h4>
                        {document.category && (
                          <Badge variant={getCategoryColor(document.category)} className="text-xs">
                            {document.category}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{formatFileSize(document.size_bytes)}</span>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {formatDistanceToNow(new Date(document.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        {document.mime_type && (
                          <span className="uppercase text-xs font-mono">
                            {document.mime_type.split('/')[1]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openSidebar({
                        type: 'account',
                        id: document.id,
                        name: document.name,
                        metadata: {
                          documentId: document.id,
                          accountId: accountId,
                          category: document.category,
                          mimeType: document.mime_type,
                        }
                      })}
                      title="Ask AI about this document"
                      className="text-primary hover:text-primary hover:bg-primary/10"
                    >
                      <Brain className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadDocument(document)}
                      title="Download document"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const tab = window.open('about:blank', '_blank', 'noopener');
                        const url = await getDocumentUrl(document);
                        if (url) {
                          if (tab) tab.location.replace(url);
                          else window.open(url, '_blank');
                          setRepairDocId(null);
                        } else {
                          if (tab && !tab.closed) tab.close();
                          setRepairDocId(document.id);
                        }
                      }}
                      title="View document"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                    {canManageDocuments && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReplace(document)}
                          title="Replace file"
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteDocument(document.id)}
                          title="Delete document"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {repairDocId === document.id && (
                  <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
                    <span>File missing in storage.</span>
                    {canManageDocuments && (
                      <Button size="sm" variant="outline" onClick={() => handleReplace(document)}>
                        Replace now
                      </Button>
                    )}
                  </div>
                )}

              </div>
            ))}
          </div>
        )}
      </CardContent>
      
      {/* Enhanced Upload Modal */}
      <UploadDocModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        accountId={accountId}
        onSuccess={handleUploadSuccess}
      />
    </Card>
  );
}