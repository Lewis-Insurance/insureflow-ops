/**
 * Explore Policy Page - Aligned Architecture
 * 
 * Uses:
 * - document_extractions: for document records and evidence catalog
 * - knowledge_base: for vector chunks
 * - ai_conversations / ai_messages: for chat history
 * - document_evidence_items: for bbox highlighting
 * 
 * Features:
 * - Upload multiple documents
 * - Real-time processing status
 * - Evidence-backed Q&A
 * - Click citation -> highlight in document viewer
 */

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Upload,
  Loader2,
  Plus,
  FolderOpen,
  MessageSquare,
  Eye,
  Save,
  Link2,
  Sparkles,
} from 'lucide-react';

// New aligned architecture components
import {
  useCreateExploreSession,
  useExploreSession,
  useExploreDocuments,
  useUploadExploreDocument,
  useExploreChatMessages,
  ExploreDocument,
} from '@/hooks/useExploreSessions';
import { ExploreDocumentViewer } from '@/components/explore/ExploreDocumentViewer';
import { ExploreChatPanel } from '@/components/explore/ExploreChatPanel';
import { ExploreDocumentList } from '@/components/explore/ExploreDocumentList';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

export default function ExplorePolicy() {
  const { toast } = useToast();
  
  // Session state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [selectedDocument, setSelectedDocument] = useState<ExploreDocument | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<{
    evidenceId: string;
    pageIndex: number;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'documents' | 'chat'>('documents');

  // Hooks
  const createSession = useCreateExploreSession();
  const { data: session } = useExploreSession(conversationId);
  const { data: documents = [], isLoading: docsLoading } = useExploreDocuments(conversationId);
  const { data: messages = [] } = useExploreChatMessages(conversationId);
  const uploadDocument = useUploadExploreDocument();

  // Accounts and policies for linking
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, type')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: policies } = useQuery({
    queryKey: ['policies', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const { data, error } = await supabase
        .from('policies')
        .select('id, policy_number, line_of_business')
        .eq('account_id', selectedAccountId)
        .order('policy_number');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedAccountId,
  });

  // Create session on first document upload if needed
  const ensureSession = useCallback(async () => {
    if (conversationId) return conversationId;

    const result = await createSession.mutateAsync({
      title: 'Document Exploration',
      accountId: selectedAccountId || undefined,
      policyId: selectedPolicyId || undefined,
    });

    setConversationId(result.id);
    return result.id;
  }, [conversationId, createSession, selectedAccountId, selectedPolicyId]);

  // File drop handler
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const validFiles = acceptedFiles.filter((file) => {
        if (file.size > MAX_FILE_SIZE) {
          toast({
            title: 'File too large',
            description: `${file.name} exceeds 50MB limit`,
            variant: 'destructive',
          });
          return false;
        }
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
          toast({
            title: 'Unsupported file type',
            description: `${file.name} is not a supported document type`,
            variant: 'destructive',
          });
          return false;
        }
        return true;
      });

      if (validFiles.length === 0) return;

      try {
        const sessionId = await ensureSession();

        for (const file of validFiles) {
          await uploadDocument.mutateAsync({
            file,
            conversationId: sessionId,
            accountId: selectedAccountId || undefined,
            policyId: selectedPolicyId || undefined,
          });
        }

        toast({
          title: 'Documents uploaded',
          description: `${validFiles.length} document(s) uploaded for processing`,
        });
      } catch (error) {
        console.error('Upload error:', error);
      }
    },
    [ensureSession, uploadDocument, selectedAccountId, selectedPolicyId, toast]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/*': ['.jpg', '.jpeg', '.png'],
    },
    multiple: true,
    maxSize: MAX_FILE_SIZE,
  });

  // Handle citation click from chat
  const handleCitationClick = useCallback(
    (evidenceId: string, pageIndex?: number) => {
      // Find the evidence in the selected document's catalog
      if (selectedDocument?.evidence_catalog) {
        const evidence = selectedDocument.evidence_catalog.find(
          (e) => e.evidence_id === evidenceId
        );
        if (evidence) {
          setActiveHighlight({
            evidenceId: evidence.evidence_id,
            pageIndex: evidence.page_index,
          });
          return;
        }
      }

      // Try to find in any document
      for (const doc of documents) {
        const evidence = doc.evidence_catalog?.find((e) => e.evidence_id === evidenceId);
        if (evidence) {
          setSelectedDocument(doc);
          setActiveHighlight({
            evidenceId: evidence.evidence_id,
            pageIndex: evidence.page_index,
          });
          return;
        }
      }

      toast({
        title: 'Evidence not found',
        description: 'Could not locate the cited evidence in the documents',
        variant: 'destructive',
      });
    },
    [selectedDocument, documents, toast]
  );

  // Stats
  const completedDocs = documents.filter((d) => d.processing_status === 'completed');
  const hasDocuments = documents.length > 0;
  const hasCompletedDocs = completedDocs.length > 0;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" />
              Explore Documents
            </h1>
            <p className="text-muted-foreground">
              Upload insurance documents and ask evidence-backed questions
            </p>
          </div>

          <div className="flex items-center gap-2">
            {session && (
              <Badge variant="outline" className="gap-1">
                <FolderOpen className="h-3 w-3" />
                Session active
              </Badge>
            )}
            {hasCompletedDocs && (
              <Badge variant="default" className="bg-green-600">
                {completedDocs.length} ready
              </Badge>
            )}
          </div>
        </div>

        {/* Account/Policy Linking */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">
                  Link to Account (optional)
                </label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No account</SelectItem>
                    {accounts?.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedAccountId && (
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1 block">
                    Link to Policy (optional)
                  </label>
                  <Select value={selectedPolicyId} onValueChange={setSelectedPolicyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select policy..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No policy</SelectItem>
                      {policies?.map((policy) => (
                        <SelectItem key={policy.id} value={policy.id}>
                          {policy.policy_number} ({policy.line_of_business})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" style={{ minHeight: '70vh' }}>
          {/* Left Panel: Documents + Upload */}
          <div className="lg:col-span-3 space-y-4">
            {/* Upload Zone */}
            <Card>
              <CardContent className="p-4">
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <input {...getInputProps()} />
                  {uploadDocument.isPending ? (
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
                  ) : (
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  )}
                  <p className="text-sm text-muted-foreground">
                    {isDragActive
                      ? 'Drop files here...'
                      : 'Drag & drop or click to upload'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, DOC, DOCX, JPG, PNG (max 50MB)
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Document List */}
            {hasDocuments ? (
              <ExploreDocumentList
                documents={documents}
                selectedDocumentId={selectedDocument?.id}
                onSelectDocument={setSelectedDocument}
                conversationId={conversationId!}
              />
            ) : (
              <Card className="h-[300px] flex items-center justify-center">
                <div className="text-center text-muted-foreground p-6">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No documents uploaded yet</p>
                  <p className="text-xs mt-1">
                    Upload documents to start exploring
                  </p>
                </div>
              </Card>
            )}
          </div>

          {/* Center Panel: Document Viewer */}
          <div className="lg:col-span-5">
            {selectedDocument ? (
              <ExploreDocumentViewer
                documentId={selectedDocument.document_id}
                storagePath={selectedDocument.id} // Will be fetched from extraction
                pageCount={selectedDocument.page_count || 1}
                evidenceCatalog={selectedDocument.evidence_catalog}
                activeHighlight={activeHighlight}
                onHighlightClick={(evidenceId, pageIndex) =>
                  setActiveHighlight({ evidenceId, pageIndex })
                }
              />
            ) : (
              <Card className="h-full min-h-[500px] flex items-center justify-center">
                <div className="text-center text-muted-foreground p-6">
                  <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Document Viewer</p>
                  <p className="text-sm mt-1">
                    Select a document from the list to view it here
                  </p>
                  {hasCompletedDocs && (
                    <p className="text-xs mt-2">
                      Click citations in chat to highlight evidence
                    </p>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* Right Panel: Chat + Analysis */}
          <div className="lg:col-span-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="documents" className="gap-1">
                  <FileText className="h-4 w-4" />
                  Analysis
                </TabsTrigger>
                <TabsTrigger value="chat" className="gap-1">
                  <MessageSquare className="h-4 w-4" />
                  Ask AI
                </TabsTrigger>
              </TabsList>

              <TabsContent value="documents" className="mt-4">
                {selectedDocument?.processing_status === 'completed' &&
                selectedDocument.extracted_fields ? (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Extracted Data
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[500px]">
                        <div className="space-y-4">
                          {/* Identity */}
                          {selectedDocument.extracted_fields.identity && (
                            <div>
                              <h4 className="text-sm font-semibold mb-2">Identity</h4>
                              <div className="space-y-1 text-sm">
                                {Object.entries(selectedDocument.extracted_fields.identity).map(
                                  ([key, value]: [string, any]) => (
                                    <div key={key} className="flex justify-between">
                                      <span className="text-muted-foreground capitalize">
                                        {key.replace(/_/g, ' ')}
                                      </span>
                                      <span className="font-medium">
                                        {typeof value === 'object' ? value?.value || '-' : value}
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          )}

                          {/* Premium */}
                          {selectedDocument.extracted_fields.premium && (
                            <div>
                              <h4 className="text-sm font-semibold mb-2">Premium</h4>
                              <div className="space-y-1 text-sm">
                                {Object.entries(selectedDocument.extracted_fields.premium).map(
                                  ([key, value]: [string, any]) => (
                                    <div key={key} className="flex justify-between">
                                      <span className="text-muted-foreground capitalize">
                                        {key.replace(/_/g, ' ')}
                                      </span>
                                      <span className="font-medium">
                                        {typeof value === 'object'
                                          ? value?.display_value || value?.value || '-'
                                          : value}
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          )}

                          {/* Coverages */}
                          {selectedDocument.extracted_fields.coverages?.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold mb-2">Coverages</h4>
                              <div className="space-y-2">
                                {selectedDocument.extracted_fields.coverages.map(
                                  (cov: any, idx: number) => (
                                    <div
                                      key={idx}
                                      className="p-2 bg-muted rounded text-sm"
                                    >
                                      <div className="font-medium">{cov.display_name}</div>
                                      {cov.limit?.value && (
                                        <div className="text-muted-foreground">
                                          Limit: {cov.limit.display_value || cov.limit.value}
                                        </div>
                                      )}
                                      {cov.deductible?.value && (
                                        <div className="text-muted-foreground">
                                          Deductible:{' '}
                                          {cov.deductible.display_value || cov.deductible.value}
                                        </div>
                                      )}
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          )}

                          {/* Raw fields fallback */}
                          {!selectedDocument.extracted_fields.identity &&
                            !selectedDocument.extracted_fields.premium && (
                              <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                                {JSON.stringify(selectedDocument.extracted_fields, null, 2)}
                              </pre>
                            )}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                ) : selectedDocument?.processing_status === 'processing' ||
                  selectedDocument?.processing_status === 'pending' ? (
                  <Card className="h-[500px] flex items-center justify-center">
                    <div className="text-center p-6">
                      <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                      <p className="text-sm font-medium">Processing document...</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Extracting text and analyzing content
                      </p>
                    </div>
                  </Card>
                ) : (
                  <Card className="h-[500px] flex items-center justify-center">
                    <div className="text-center text-muted-foreground p-6">
                      <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">
                        {selectedDocument
                          ? 'No analysis available yet'
                          : 'Select a completed document to view analysis'}
                      </p>
                    </div>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="chat" className="mt-4 h-[550px]">
                {conversationId && hasCompletedDocs ? (
                  <ExploreChatPanel
                    conversationId={conversationId}
                    messages={messages}
                    documentExtractionIds={completedDocs.map((d) => d.id)}
                    onCitationClick={handleCitationClick}
                  />
                ) : (
                  <Card className="h-full flex items-center justify-center">
                    <div className="text-center text-muted-foreground p-6">
                      <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm font-medium">Ask AI Questions</p>
                      <p className="text-xs mt-1">
                        {!conversationId
                          ? 'Upload a document to start a session'
                          : 'Wait for at least one document to finish processing'}
                      </p>
                    </div>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
