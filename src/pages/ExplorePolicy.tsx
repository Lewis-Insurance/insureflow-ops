import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
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
import { useDocumentAnalysis } from '@/hooks/useDocumentAnalysis';
import { DocumentAnalysisDisplay } from '@/components/DocumentAnalysisDisplay';
import {
  FileText,
  Upload,
  Search,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Eye,
  Save,
  RefreshCw,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  MessageSquare,
} from 'lucide-react';

interface AnalyzedDocument {
  id: string;
  filename: string;
  status: 'validating' | 'analyzing' | 'complete' | 'error';
  progress: number;
  progressMessage: string;
  analysis?: {
    summary: string;
    coverageDetails: Array<{
      type: string;
      limit: string;
      deductible: string;
      premium?: string;
    }>;
    keyDates: Array<{
      label: string;
      date: string;
    }>;
    policyNumber?: string;
    insuredName?: string;
    carrier?: string;
    extractedText?: string;
  };
  error?: string;
  file: File;
  documentHash?: string;
  accountId?: string;
  policyId?: string;
  savedToDatabase?: boolean;
  cacheHit?: boolean;
  retryCount?: number;
}

interface SearchResult {
  text: string;
  page?: number;
  relevance: number;
  context?: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const BATCH_SIZE = 3;
const MAX_RETRIES = 3;
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

const validateFile = (file: File): { valid: boolean; error?: string } => {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File exceeds 50MB limit (${(file.size / 1024 / 1024).toFixed(2)}MB)` };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: `Unsupported file type: ${file.type}` };
  }
  return { valid: true };
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function ExplorePolicy() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<AnalyzedDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<AnalyzedDocument | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [uploadedDocumentIds, setUploadedDocumentIds] = useState<Map<string, string>>(new Map());

  const { analyzeDocument: analyzeDocumentMutation } = useDocumentAnalysis();

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

  const analyzeDocument = useCallback(async (
    file: File,
    docId: string,
    accountId?: string,
    policyId?: string,
    retryAttempt = 0
  ) => {
    try {
      setDocuments(prev => prev.map(doc =>
        doc.id === docId
          ? { ...doc, progress: 10, progressMessage: 'Uploading to Google Drive...' }
          : doc
      ));

      // Upload to Google Drive
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileName', file.name);
      formData.append('accountId', accountId || '');
      formData.append('policyId', policyId || '');

      const { data: uploadResult, error: uploadError } = await supabase.functions.invoke<{
        success: boolean;
        documentId: string;
        googleDriveId: string;
        fileName: string;
        analysisTriggered: boolean;
        error?: string;
      }>(
        'upload-to-google-drive',
        {
          body: formData,
        }
      );

      if (uploadError) throw uploadError;
      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      setDocuments(prev => prev.map(doc =>
        doc.id === docId
          ? { ...doc, progress: 50, progressMessage: 'Document uploaded. Analysis in progress...' }
          : doc
      ));

      // Store mapping for displaying results
      setUploadedDocumentIds(prev => new Map(prev).set(docId, uploadResult.documentId));

      // Mark as complete - analysis results will appear when ready
      setDocuments(prev => prev.map(doc =>
        doc.id === docId
          ? {
              ...doc,
              status: 'complete',
              progress: 100,
              progressMessage: 'Uploaded to Google Drive. Analysis may take a few minutes.',
            }
          : doc
      ));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
      console.error('Error analyzing document:', error);

      if (retryAttempt < MAX_RETRIES) {
        const delayMs = Math.min(1000 * Math.pow(2, retryAttempt), 10000);
        
        setDocuments(prev => prev.map(doc =>
          doc.id === docId
            ? {
                ...doc,
                progress: 0,
                progressMessage: `Retry ${retryAttempt + 1}/${MAX_RETRIES} in ${delayMs / 1000}s...`,
                retryCount: retryAttempt + 1,
              }
            : doc
        ));

        toast({
          title: `Retry ${retryAttempt + 1}/${MAX_RETRIES}`,
          description: `Retrying ${file.name} in ${delayMs / 1000}s...`,
        });

        await delay(delayMs);
        return analyzeDocument(file, docId, accountId, policyId, retryAttempt + 1);
      }

      setDocuments(prev => prev.map(doc =>
        doc.id === docId
          ? {
              ...doc,
              status: 'error',
              error: errorMessage,
              progress: 0,
              progressMessage: 'Failed after retries',
            }
          : doc
      ));

      toast({
        title: "Analysis Failed",
        description: `${errorMessage} (after ${MAX_RETRIES} attempts)`,
        variant: "destructive",
      });
    }
  }, [toast, analyzeDocumentMutation]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const validatedFiles: { file: File; doc: AnalyzedDocument }[] = [];
    const invalidFiles: { file: File; error: string }[] = [];

    for (const file of acceptedFiles) {
      const validation = validateFile(file);
      
      if (validation.valid) {
        validatedFiles.push({
          file,
          doc: {
            id: crypto.randomUUID(),
            filename: file.name,
            status: 'validating',
            progress: 0,
            progressMessage: 'Validating file...',
            file,
            accountId: selectedAccountId || undefined,
            policyId: selectedPolicyId || undefined,
          }
        });
      } else {
        invalidFiles.push({ file, error: validation.error! });
      }
    }

    if (invalidFiles.length > 0) {
      invalidFiles.forEach(({ file, error }) => {
        toast({
          title: "Validation Failed",
          description: `${file.name}: ${error}`,
          variant: "destructive",
        });
      });
    }

    if (validatedFiles.length > 0) {
      setDocuments(prev => [...prev, ...validatedFiles.map(vf => vf.doc)]);

      for (let i = 0; i < validatedFiles.length; i += BATCH_SIZE) {
        const batch = validatedFiles.slice(i, i + BATCH_SIZE);
        
        setDocuments(prev => prev.map(doc => {
          const inBatch = batch.find(b => b.doc.id === doc.id);
          return inBatch
            ? { ...doc, status: 'analyzing' as const, progressMessage: 'Starting analysis...' }
            : doc;
        }));

        await Promise.all(
          batch.map(({ file, doc }) =>
            analyzeDocument(file, doc.id, doc.accountId, doc.policyId)
          )
        );

        if (i + BATCH_SIZE < validatedFiles.length) {
          await delay(1000);
        }
      }

      toast({
        title: "Processing Complete",
        description: `Processed ${validatedFiles.length} document${validatedFiles.length > 1 ? 's' : ''}`,
      });
    }
  }, [analyzeDocument, selectedAccountId, selectedPolicyId, toast]);

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

  const handleSearch = async () => {
    if (!selectedDoc?.analysis || !searchQuery.trim()) return;

    setIsSearching(true);
    setSearchResults([]);

    try {
      // Build searchable content from all available analysis data
      const searchableContent = [
        selectedDoc.analysis.extractedText || '',
        selectedDoc.analysis.summary || '',
        selectedDoc.analysis.policyNumber || '',
        selectedDoc.analysis.insuredName || '',
        selectedDoc.analysis.carrier || '',
        ...selectedDoc.analysis.coverageDetails.map(c => `${c.type} ${c.limit} ${c.deductible} ${c.premium || ''}`),
        ...selectedDoc.analysis.keyDates.map(d => `${d.label} ${d.date}`),
      ].join(' ');

      if (!searchableContent.trim()) {
        toast({
          title: "No Content Available",
          description: "Document analysis doesn't contain searchable text",
          variant: "destructive",
        });
        setIsSearching(false);
        return;
      }

      // Try semantic search first if extractedText is available
      if (selectedDoc.analysis.extractedText) {
        const { data, error } = await supabase.functions.invoke('ai-brain-rag', {
          body: {
            query: searchQuery,
            context: selectedDoc.analysis.extractedText,
            documentId: selectedDoc.id,
            maxResults: 10,
          }
        });

        if (!error && data?.results && data.results.length > 0) {
          setSearchResults(data.results);
          toast({
            title: "Search Complete",
            description: `Found ${data.results.length} semantic matches`,
          });
          return;
        }
      }

      // Fallback to basic text search across all content
      const text = searchableContent.toLowerCase();
      const query = searchQuery.toLowerCase();
      const results: SearchResult[] = [];
      const lines = text.split('\n');

      lines.forEach((line, index) => {
        if (line.includes(query)) {
          const matches = (line.match(new RegExp(query, 'gi')) || []).length;
          const relevance = Math.min(matches * 20, 100);
          
          const contextStart = Math.max(0, index - 1);
          const contextEnd = Math.min(lines.length - 1, index + 1);
          const context = lines.slice(contextStart, contextEnd + 1).join(' ');

          results.push({
            text: line.trim(),
            relevance,
            context: context.trim(),
          });
        }
      });

      setSearchResults(results.slice(0, 10));

      if (results.length === 0) {
        toast({
          title: "No Results",
          description: "No matches found in the document",
        });
      } else {
        toast({
          title: "Search Complete",
          description: `Found ${results.length} text matches`,
        });
      }
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Search Failed",
        description: error instanceof Error ? error.message : "Failed to search document",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const exportAnalysis = (doc: AnalyzedDocument, format: 'json' | 'csv' = 'json') => {
    if (!doc.analysis) {
      toast({
        title: "Export Failed",
        description: "No analysis data available",
        variant: "destructive",
      });
      return;
    }

    try {
      if (format === 'json') {
        const exportData = {
          filename: doc.filename,
          analyzedAt: new Date().toISOString(),
          accountId: doc.accountId,
          policyId: doc.policyId,
          cacheHit: doc.cacheHit,
          documentHash: doc.documentHash,
          policyNumber: doc.analysis.policyNumber,
          carrier: doc.analysis.carrier,
          insuredName: doc.analysis.insuredName,
          summary: doc.analysis.summary,
          coverageDetails: doc.analysis.coverageDetails,
          keyDates: doc.analysis.keyDates,
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
          type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${doc.filename.replace(/\.[^/.]+$/, '')}-analysis.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (format === 'csv') {
        const headers = ['Coverage Type', 'Limit', 'Deductible', 'Premium'];
        const rows = doc.analysis.coverageDetails.map(c => [
          c.type,
          c.limit,
          c.deductible,
          c.premium || 'N/A'
        ]);

        const csv = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${doc.filename.replace(/\.[^/.]+$/, '')}-coverage.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }

      toast({
        title: "Export Complete",
        description: `Analysis exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export",
        variant: "destructive",
      });
    }
  };

  const removeDocument = (docId: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== docId));
    if (selectedDoc?.id === docId) {
      setSelectedDoc(null);
    }
    toast({
      title: "Document Removed",
      description: "Document removed from list",
    });
  };

  const retryDocument = (docId: string) => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    setDocuments(prev => prev.map(d =>
      d.id === docId
        ? { ...d, status: 'analyzing' as const, progress: 0, error: undefined, retryCount: 0 }
        : d
    ));

    analyzeDocument(doc.file, docId, doc.accountId, doc.policyId);
  };

  useEffect(() => {
    return () => {
      documents.forEach(doc => {
        try {
          URL.revokeObjectURL(URL.createObjectURL(doc.file));
        } catch (e) {
          // Ignore cleanup errors
        }
      });
    };
  }, [documents]);

  const retryAnalysis = (doc: AnalyzedDocument) => {
    setDocuments(prev => prev.map(d => 
      d.id === doc.id ? { ...d, status: 'analyzing', progress: 0, progressMessage: 'Retrying...', retryCount: 0 } : d
    ));
    analyzeDocument(doc.file, doc.id, doc.accountId, doc.policyId);
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-r from-primary to-primary/80 rounded-lg">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Explore a Policy</h1>
              <p className="text-muted-foreground">
                One-time document analysis with advanced AI OCR
              </p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1">
            <Sparkles className="w-3 h-3" />
            Powered by Lewis AI
          </Badge>
        </div>

        {/* Account & Policy Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Optional: Link to Account/Policy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="account">Account</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger id="account">
                    <SelectValue placeholder="Select account..." />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts?.map(account => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} ({account.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {selectedAccountId && (
                <div className="space-y-2">
                  <Label htmlFor="policy">Policy (Optional)</Label>
                  <Select value={selectedPolicyId} onValueChange={setSelectedPolicyId}>
                    <SelectTrigger id="policy">
                      <SelectValue placeholder="Select policy..." />
                    </SelectTrigger>
                    <SelectContent>
                      {policies?.map(policy => (
                        <SelectItem key={policy.id} value={policy.id}>
                          {policy.policy_number} - {policy.line_of_business}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Upload & Document List */}
          <div className="lg:col-span-1 space-y-4">
            {/* Upload Area */}
            <Card>
              <CardContent className="p-6">
                <div
                  {...getRootProps()}
                  className={`
                    border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                    transition-colors duration-200
                    ${isDragActive 
                      ? 'border-primary bg-primary/5' 
                      : 'border-muted-foreground/25 hover:border-primary/50'
                    }
                  `}
                >
                  <input {...getInputProps()} />
                  <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="text-sm font-medium mb-2">
                    {isDragActive ? 'Drop files here' : 'Drag & drop policy documents'}
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    or click to browse files
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Max 50MB • PDF, DOCX, DOC, JPG, PNG
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Document List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Documents ({documents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {documents.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No documents yet. Upload to start analyzing.
                      </div>
                    ) : (
                      documents.map(doc => (
                        <div
                          key={doc.id}
                          className={`
                            p-3 rounded-lg border cursor-pointer transition-colors
                            ${selectedDoc?.id === doc.id 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border hover:border-primary/50'
                            }
                          `}
                          onClick={() => setSelectedDoc(doc)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-2 flex-1">
                              <FileText className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{doc.filename}</p>
                                
                                {/* Status */}
                                <div className="flex items-center gap-2 mt-1">
                                  {doc.status === 'validating' && (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                                      <span className="text-xs text-muted-foreground">Validating...</span>
                                    </>
                                  )}
                                  {doc.status === 'analyzing' && (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                                      <span className="text-xs text-muted-foreground">{doc.progressMessage}</span>
                                    </>
                                  )}
                                  {doc.status === 'complete' && (
                                    <>
                                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                                      <span className="text-xs text-green-600">Complete</span>
                                      {doc.savedToDatabase && (
                                        <Database className="w-3 h-3 text-blue-600" />
                                      )}
                                    </>
                                  )}
                                  {doc.status === 'error' && (
                                    <>
                                      <AlertCircle className="w-3 h-3 text-destructive" />
                                      <span className="text-xs text-destructive">Error</span>
                                    </>
                                  )}
                                </div>
                                
                                {/* Progress Bar */}
                                {doc.status === 'analyzing' && (
                                  <Progress value={doc.progress} className="h-1 mt-2" />
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeDocument(doc.id);
                              }}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Analysis Results */}
          <div className="lg:col-span-2">
            {!selectedDoc ? (
              <Card className="h-[700px] flex items-center justify-center">
                <CardContent className="text-center">
                  <Eye className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">Select a document to view analysis</p>
                  <p className="text-sm text-muted-foreground">
                    Upload and select a document to see detailed coverage information
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <CardTitle>{selectedDoc.filename}</CardTitle>
                      {selectedDoc.analysis?.policyNumber && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Policy: {selectedDoc.analysis.policyNumber}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedDoc.status === 'complete' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => exportAnalysis(selectedDoc, 'json')}
                          >
                            <FileJson className="w-4 h-4 mr-2" />
                            JSON
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => exportAnalysis(selectedDoc, 'csv')}
                          >
                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                            CSV
                          </Button>
                        </>
                      )}
                      {selectedDoc.status === 'error' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retryDocument(selectedDoc.id)}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Retry
                        </Button>
                      )}
                      <Badge variant={
                        selectedDoc.status === 'complete' ? 'default' :
                        selectedDoc.status === 'analyzing' || selectedDoc.status === 'validating' ? 'secondary' :
                        'destructive'
                      }>
                        {selectedDoc.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {(selectedDoc.status === 'analyzing' || selectedDoc.status === 'validating') && (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center space-y-4">
                        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
                        <div>
                          <p className="text-sm font-medium">{selectedDoc.progressMessage}</p>
                          <Progress value={selectedDoc.progress} className="w-64 mx-auto mt-2" />
                          <p className="text-xs text-muted-foreground mt-2">{selectedDoc.progress}% complete</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedDoc.status === 'error' && (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                        <p className="text-sm font-medium mb-2">Analysis Failed</p>
                        <p className="text-xs text-muted-foreground mb-4">{selectedDoc.error}</p>
                        <Button onClick={() => retryDocument(selectedDoc.id)}>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Retry Analysis
                        </Button>
                      </div>
                    </div>
                  )}

                  {selectedDoc.status === 'complete' && selectedDoc.analysis && (
                    <div className="space-y-4">
                      {/* Ask Questions Section - Always Visible */}
                      <Card className="border-primary/20 bg-primary/5">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-primary" />
                            <CardTitle className="text-base">Ask Questions About This Document</CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex gap-2">
                            <Input
                              placeholder="e.g., What is the deductible for general liability? Who is the insured?"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                              className="flex-1"
                            />
                            <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
                              {isSearching ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Search className="w-4 h-4" />
                              )}
                              <span className="ml-2 hidden sm:inline">Search</span>
                            </Button>
                          </div>
                          
                          {/* Search Results */}
                          {searchResults.length > 0 && (
                            <div className="mt-4">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-medium">Results ({searchResults.length})</p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSearchQuery('');
                                    setSearchResults([]);
                                  }}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                              <ScrollArea className="h-[200px]">
                                <div className="space-y-2">
                                  {searchResults.map((result, idx) => (
                                    <Card key={idx} className="bg-background">
                                      <CardContent className="p-3">
                                        <p className="text-sm mb-1 font-medium">{result.text}</p>
                                        {result.context && (
                                          <p className="text-xs text-muted-foreground">
                                            ...{result.context}...
                                          </p>
                                        )}
                                        <Badge variant="outline" className="text-xs mt-2">
                                          Relevance: {result.relevance}%
                                        </Badge>
                                      </CardContent>
                                    </Card>
                                  ))}
                                </div>
                              </ScrollArea>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Tabs for Document Details */}
                      <Tabs defaultValue="summary" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="summary">Summary</TabsTrigger>
                          <TabsTrigger value="coverage">Coverage</TabsTrigger>
                        </TabsList>

                        <TabsContent value="summary" className="space-y-4">
                        <div>
                          <h3 className="text-sm font-semibold mb-2">Document Summary</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {selectedDoc.analysis.summary}
                          </p>
                        </div>

                        {selectedDoc.analysis.keyDates.length > 0 && (
                          <div>
                            <h3 className="text-sm font-semibold mb-2">Key Dates</h3>
                            <div className="space-y-2">
                              {selectedDoc.analysis.keyDates.map((date, idx) => (
                                <div key={idx} className="flex justify-between items-center p-2 bg-muted rounded">
                                  <span className="text-sm font-medium">{date.label}</span>
                                  <span className="text-sm text-muted-foreground">{date.date}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {(selectedDoc.analysis.insuredName || selectedDoc.analysis.carrier) && (
                          <div className="grid grid-cols-2 gap-4">
                            {selectedDoc.analysis.insuredName && (
                              <div>
                                <h3 className="text-sm font-semibold mb-1">Insured</h3>
                                <p className="text-sm text-muted-foreground">{selectedDoc.analysis.insuredName}</p>
                              </div>
                            )}
                            {selectedDoc.analysis.carrier && (
                              <div>
                                <h3 className="text-sm font-semibold mb-1">Carrier</h3>
                                <p className="text-sm text-muted-foreground">{selectedDoc.analysis.carrier}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="coverage" className="space-y-4">
                        <h3 className="text-sm font-semibold">Coverage Details</h3>
                        {selectedDoc.analysis.coverageDetails.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No coverage details extracted</p>
                        ) : (
                          <div className="space-y-3">
                            {selectedDoc.analysis.coverageDetails.map((coverage, idx) => (
                              <Card key={idx}>
                                <CardContent className="p-4">
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium">{coverage.type}</span>
                                      {coverage.premium && (
                                        <Badge variant="outline">{coverage.premium}</Badge>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                      <div>
                                        <span className="text-muted-foreground">Limit:</span>
                                        <span className="ml-2 font-medium">{coverage.limit}</span>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Deductible:</span>
                                        <span className="ml-2 font-medium">{coverage.deductible}</span>
                                      </div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>

                    {/* New Database-Backed Analysis */}
                    {uploadedDocumentIds.has(selectedDoc.id) && (
                      <div className="mt-6 pt-6 border-t">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <Database className="w-5 h-5" />
                          Structured Analysis (Database)
                        </h3>
                        <DocumentAnalysisDisplay documentId={uploadedDocumentIds.get(selectedDoc.id)!} />
                      </div>
                    )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
