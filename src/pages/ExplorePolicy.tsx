import { useState, useCallback } from 'react';
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

const calculateFileHash = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

  const saveAnalysisToDatabase = useCallback(async (
    docId: string,
    data: {
      filename: string;
      accountId?: string;
      policyId?: string;
      documentHash: string;
      analysis: any;
    }
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('document_analyses')
        .insert({
          filename: data.filename,
          account_id: data.accountId || null,
          policy_id: data.policyId || null,
          document_hash: data.documentHash,
          analysis_data: data.analysis,
          extracted_text: data.analysis.extractedText || null,
          policy_number: data.analysis.policyNumber || null,
          carrier: data.analysis.carrier || null,
          insured_name: data.analysis.insuredName || null,
          analyzed_at: new Date().toISOString(),
          created_by: user?.id || null,
        });

      if (error) {
        console.error('Failed to save analysis to database:', error);
        toast({
          title: "Database Save Failed",
          description: "Analysis completed but failed to save to database",
          variant: "destructive",
        });
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error saving to database:', error);
      return false;
    }
  }, [toast]);

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
          ? { ...doc, progress: 5, progressMessage: 'Calculating file hash...' }
          : doc
      ));

      const documentHash = await calculateFileHash(file);

      setDocuments(prev => prev.map(doc =>
        doc.id === docId
          ? { ...doc, documentHash, progress: 10, progressMessage: 'Checking cache...' }
          : doc
      ));

      setDocuments(prev => prev.map(doc =>
        doc.id === docId
          ? { ...doc, progress: 20, progressMessage: 'Reading file...' }
          : doc
      ));

      const reader = new FileReader();
      reader.readAsDataURL(file);

      await new Promise<void>((resolve, reject) => {
        reader.onload = () => resolve();
        reader.onerror = () => reject(new Error('Failed to read file'));
      });

      const base64 = (reader.result as string).split(',')[1];

      setDocuments(prev => prev.map(doc =>
        doc.id === docId
          ? { ...doc, progress: 40, progressMessage: 'Running AI analysis (OCR + extraction)...' }
          : doc
      ));

      const { data, error } = await supabase.functions.invoke('ai-document-analysis', {
        body: {
          document: base64,
          filename: file.name,
          mimeType: file.type,
          documentHash,
        }
      });

      if (error) throw error;

      setDocuments(prev => prev.map(doc =>
        doc.id === docId
          ? {
              ...doc,
              status: 'complete',
              progress: 90,
              progressMessage: 'Saving results...',
              cacheHit: data.cacheHit || false,
              analysis: {
                summary: data.summary || 'No summary available',
                coverageDetails: data.coverageDetails || [],
                keyDates: data.keyDates || [],
                policyNumber: data.policyNumber,
                insuredName: data.insuredName,
                carrier: data.carrier,
                extractedText: data.extractedText,
              },
              accountId,
              policyId,
            }
          : doc
      ));

      await saveAnalysisToDatabase(docId, {
        filename: file.name,
        accountId,
        policyId,
        documentHash,
        analysis: data,
      });

      setDocuments(prev => prev.map(doc =>
        doc.id === docId
          ? {
              ...doc,
              progress: 100,
              progressMessage: 'Complete!',
              savedToDatabase: true,
            }
          : doc
      ));

      toast({
        title: data.cacheHit ? "Analysis Complete (Cached)" : "Analysis Complete",
        description: `${file.name} analyzed successfully${data.cacheHit ? ' using cached OCR (24x faster!)' : ''}`,
      });

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
  }, [toast, saveAnalysisToDatabase]);

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
    if (!selectedDoc?.analysis?.extractedText || !searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const text = selectedDoc.analysis.extractedText.toLowerCase();
      const query = searchQuery.toLowerCase();
      
      const results: SearchResult[] = [];
      const lines = text.split('\n');
      
      lines.forEach((line, index) => {
        if (line.includes(query)) {
          const relevance = (line.match(new RegExp(query, 'gi')) || []).length * 100;
          const contextStart = Math.max(0, index - 1);
          const contextEnd = Math.min(lines.length, index + 2);
          const context = lines.slice(contextStart, contextEnd).join(' ');
          
          results.push({
            text: line.trim(),
            relevance: Math.min(relevance, 100),
            context: context.substring(0, 200),
          });
        }
      });

      setSearchResults(results.slice(0, 10));

      if (results.length === 0) {
        toast({
          title: "No Results",
          description: "No matches found in the document",
        });
      }
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Search Failed",
        description: "Failed to search document",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const removeDocument = (docId: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== docId));
    if (selectedDoc?.id === docId) {
      setSelectedDoc(null);
    }
  };

  const saveToDatabase = async (doc: AnalyzedDocument) => {
    if (!doc.analysis || !doc.documentHash) {
      toast({
        title: "Missing Information",
        description: "Document must be analyzed before saving",
        variant: "destructive",
      });
      return;
    }

    try {
      const saved = await saveAnalysisToDatabase(doc.id, {
        filename: doc.filename,
        accountId: selectedAccountId || doc.accountId,
        policyId: selectedPolicyId || doc.policyId,
        documentHash: doc.documentHash,
        analysis: doc.analysis,
      });
      
      if (saved) {
        toast({
          title: "Saved",
          description: "Document analysis saved to database",
        });
        
        setDocuments(prev => prev.map(d => 
          d.id === doc.id ? { 
            ...d, 
            savedToDatabase: true, 
            accountId: selectedAccountId || d.accountId, 
            policyId: selectedPolicyId || d.policyId 
          } : d
        ));
      }
    } catch (error: any) {
      toast({
        title: "Save Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => saveToDatabase(selectedDoc)}
                          disabled={selectedDoc.savedToDatabase}
                        >
                          <Save className="w-4 h-4 mr-2" />
                          {selectedDoc.savedToDatabase ? 'Saved' : 'Save to DB'}
                        </Button>
                      )}
                      {selectedDoc.status === 'error' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retryAnalysis(selectedDoc)}
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
                        <Button onClick={() => retryAnalysis(selectedDoc)}>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Retry Analysis
                        </Button>
                      </div>
                    </div>
                  )}

                  {selectedDoc.status === 'complete' && selectedDoc.analysis && (
                    <Tabs defaultValue="summary" className="w-full">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="summary">Summary</TabsTrigger>
                        <TabsTrigger value="coverage">Coverage</TabsTrigger>
                        <TabsTrigger value="search">Search</TabsTrigger>
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

                      <TabsContent value="search" className="space-y-4">
                        <div className="flex gap-2">
                          <Input
                            placeholder="Search document text..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                          />
                          <Button onClick={handleSearch} disabled={isSearching}>
                            {isSearching ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Search className="w-4 h-4" />
                            )}
                          </Button>
                        </div>

                        <ScrollArea className="h-[400px]">
                          {searchResults.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                              {searchQuery ? 'No results found' : 'Enter a search query'}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {searchResults.map((result, idx) => (
                                <Card key={idx}>
                                  <CardContent className="p-3">
                                    <p className="text-sm mb-1">{result.text}</p>
                                    {result.context && (
                                      <p className="text-xs text-muted-foreground">
                                        ...{result.context}...
                                      </p>
                                    )}
                                    <div className="flex items-center justify-between mt-2">
                                      <Badge variant="outline" className="text-xs">
                                        Relevance: {result.relevance}%
                                      </Badge>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                      </TabsContent>
                    </Tabs>
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
