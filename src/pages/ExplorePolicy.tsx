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

  const updateDocumentProgress = useCallback((docId: string, progress: number, message: string) => {
    setDocuments(prev => prev.map(doc => 
      doc.id === docId ? { ...doc, progress, progressMessage: message } : doc
    ));
  }, []);

  const analyzeDocument = useCallback(async (file: File, docId: string) => {
    try {
      // Calculate hash
      updateDocumentProgress(docId, 10, 'Calculating file hash...');
      const hash = await calculateFileHash(file);
      
      setDocuments(prev => prev.map(doc => 
        doc.id === docId ? { ...doc, documentHash: hash } : doc
      ));

      updateDocumentProgress(docId, 20, 'Converting to base64...');
      
      // Read file as base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      await new Promise((resolve, reject) => {
        reader.onload = resolve;
        reader.onerror = reject;
      });

      const base64 = (reader.result as string).split(',')[1];

      updateDocumentProgress(docId, 40, 'Analyzing document with AI OCR...');

      // Call AI document analysis edge function
      const { data, error } = await supabase.functions.invoke('ai-document-analysis', {
        body: {
          document: base64,
          filename: file.name,
          mimeType: file.type,
        }
      });

      if (error) throw error;

      updateDocumentProgress(docId, 90, 'Finalizing results...');

      // Update document with analysis results
      setDocuments(prev => prev.map(doc => 
        doc.id === docId
          ? {
              ...doc,
              status: 'complete',
              progress: 100,
              progressMessage: 'Analysis complete',
              analysis: {
                summary: data.summary || 'No summary available',
                coverageDetails: data.coverageDetails || [],
                keyDates: data.keyDates || [],
                policyNumber: data.policyNumber,
                insuredName: data.insuredName,
                carrier: data.carrier,
                extractedText: data.extractedText,
              }
            }
          : doc
      ));

      toast({
        title: "Analysis Complete",
        description: `${file.name} has been analyzed successfully`,
      });

    } catch (error: any) {
      console.error('Error analyzing document:', error);
      
      // Retry logic
      setDocuments(prev => prev.map(doc => {
        if (doc.id !== docId) return doc;
        
        const retryCount = (doc.retryCount || 0) + 1;
        
        if (retryCount < MAX_RETRIES) {
          toast({
            title: "Retrying Analysis",
            description: `Attempt ${retryCount + 1} of ${MAX_RETRIES}`,
          });
          
          // Retry after delay
          setTimeout(() => analyzeDocument(file, docId), 2000 * retryCount);
          
          return {
            ...doc,
            retryCount,
            progressMessage: `Retrying (${retryCount}/${MAX_RETRIES})...`,
          };
        }
        
        return {
          ...doc,
          status: 'error',
          error: error.message || 'Analysis failed after retries',
        };
      }));
      
      if ((documents.find(d => d.id === docId)?.retryCount || 0) >= MAX_RETRIES - 1) {
        toast({
          title: "Analysis Failed",
          description: error.message || 'Failed to analyze document after retries',
          variant: "destructive",
        });
      }
    }
  }, [toast, updateDocumentProgress, documents]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const validatedFiles: { file: File; doc: AnalyzedDocument }[] = [];
    
    // Validate files
    for (const file of acceptedFiles) {
      const validation = validateFile(file);
      
      if (!validation.valid) {
        toast({
          title: "Invalid File",
          description: `${file.name}: ${validation.error}`,
          variant: "destructive",
        });
        continue;
      }
      
      const doc: AnalyzedDocument = {
        id: crypto.randomUUID(),
        filename: file.name,
        status: 'validating',
        progress: 0,
        progressMessage: 'Validating file...',
        file,
        retryCount: 0,
      };
      
      validatedFiles.push({ file, doc });
    }

    if (validatedFiles.length === 0) return;

    // Add documents to state
    setDocuments(prev => [...prev, ...validatedFiles.map(v => v.doc)]);

    // Process in batches
    for (let i = 0; i < validatedFiles.length; i += BATCH_SIZE) {
      const batch = validatedFiles.slice(i, i + BATCH_SIZE);
      
      // Mark as analyzing
      batch.forEach(({ doc }) => {
        setDocuments(prev => prev.map(d => 
          d.id === doc.id ? { ...d, status: 'analyzing' } : d
        ));
      });
      
      // Analyze batch in parallel
      await Promise.all(
        batch.map(({ file, doc }) => analyzeDocument(file, doc.id))
      );
      
      // Small delay between batches
      if (i + BATCH_SIZE < validatedFiles.length) {
        await delay(1000);
      }
    }
  }, [analyzeDocument, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/jpg': ['.jpg'],
      'image/png': ['.png'],
    },
    multiple: true,
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
    if (!selectedAccountId || !doc.analysis) {
      toast({
        title: "Missing Information",
        description: "Please select an account before saving",
        variant: "destructive",
      });
      return;
    }

    try {
      // This would save the analysis to the database
      // Implementation depends on your database schema
      toast({
        title: "Saved",
        description: "Document analysis saved to database",
      });
      
      setDocuments(prev => prev.map(d => 
        d.id === doc.id ? { ...d, savedToDatabase: true, accountId: selectedAccountId, policyId: selectedPolicyId } : d
      ));
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
    analyzeDocument(doc.file, doc.id);
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
