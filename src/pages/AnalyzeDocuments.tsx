import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  FileText,
  Upload,
  Search,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileSearch,
  Download,
  X,
  ScanLine,
  Eye
} from 'lucide-react';

interface AnalyzedDocument {
  id: string;
  filename: string;
  status: 'analyzing' | 'complete' | 'error';
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
}

export default function AnalyzeDocuments() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<AnalyzedDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<AnalyzedDocument | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{
    text: string;
    page?: number;
    relevance: number;
  }>>([]);
  const [isSearching, setIsSearching] = useState(false);

  const analyzeDocument = useCallback(async (file: File, docId: string) => {
    try {
      // Read file as base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      await new Promise((resolve, reject) => {
        reader.onload = resolve;
        reader.onerror = reject;
      });

      const base64 = (reader.result as string).split(',')[1];

      // Call AI document analysis edge function
      const { data, error } = await supabase.functions.invoke('ai-document-analysis', {
        body: {
          document: base64,
          filename: file.name,
          mimeType: file.type,
        }
      });

      if (error) throw error;

      // Update document with analysis results
      setDocuments(prev => prev.map(doc => 
        doc.id === docId
          ? {
              ...doc,
              status: 'complete',
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
      setDocuments(prev => prev.map(doc => 
        doc.id === docId
          ? { ...doc, status: 'error', error: error.message || 'Analysis failed' }
          : doc
      ));
      
      toast({
        title: "Analysis Failed",
        description: error.message || 'Failed to analyze document',
        variant: "destructive",
      });
    }
  }, [toast]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newDocs: AnalyzedDocument[] = acceptedFiles.map(file => ({
      id: crypto.randomUUID(),
      filename: file.name,
      status: 'analyzing',
      file,
    }));

    setDocuments(prev => [...prev, ...newDocs]);

    // Analyze each document
    for (const doc of newDocs) {
      analyzeDocument(doc.file, doc.id);
    }
  }, [analyzeDocument]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/*': ['.jpg', '.jpeg', '.png'],
    },
    multiple: true,
  });

  const handleSearch = async () => {
    if (!selectedDoc?.analysis?.extractedText || !searchQuery.trim()) return;

    setIsSearching(true);
    try {
      // Simple text search in extracted content
      const text = selectedDoc.analysis.extractedText.toLowerCase();
      const query = searchQuery.toLowerCase();
      
      const results: Array<{ text: string; relevance: number }> = [];
      const lines = text.split('\n');
      
      lines.forEach(line => {
        if (line.includes(query)) {
          const relevance = (line.match(new RegExp(query, 'gi')) || []).length * 100;
          results.push({
            text: line.trim(),
            relevance: Math.min(relevance, 100),
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
              <h1 className="text-3xl font-bold tracking-tight">Analyze Documents</h1>
              <p className="text-muted-foreground flex items-center gap-1.5">
                <ScanLine className="h-3.5 w-3.5" />
                One-time document analysis with advanced AI OCR
              </p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1">
            <Sparkles className="w-3 h-3" />
            Powered by AI
          </Badge>
        </div>

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
                    Supports PDF, DOCX, DOC, JPG, PNG
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Document List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Analyzed Documents ({documents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
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
                                <div className="flex items-center gap-2 mt-1">
                                  {doc.status === 'analyzing' && (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                                      <span className="text-xs text-muted-foreground">Analyzing...</span>
                                    </>
                                  )}
                                  {doc.status === 'complete' && (
                                    <>
                                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                                      <span className="text-xs text-green-600">Complete</span>
                                    </>
                                  )}
                                  {doc.status === 'error' && (
                                    <>
                                      <AlertCircle className="w-3 h-3 text-destructive" />
                                      <span className="text-xs text-destructive">Error</span>
                                    </>
                                  )}
                                </div>
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
              <Card className="h-[600px] flex items-center justify-center">
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
                    <div>
                      <CardTitle>{selectedDoc.filename}</CardTitle>
                      {selectedDoc.analysis?.policyNumber && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Policy: {selectedDoc.analysis.policyNumber}
                        </p>
                      )}
                    </div>
                    <Badge variant={
                      selectedDoc.status === 'complete' ? 'default' :
                      selectedDoc.status === 'analyzing' ? 'secondary' :
                      'destructive'
                    }>
                      {selectedDoc.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedDoc.status === 'analyzing' && (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                        <p className="text-sm text-muted-foreground">Analyzing document with AI OCR...</p>
                      </div>
                    </div>
                  )}

                  {selectedDoc.status === 'error' && (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                        <p className="text-sm font-medium mb-2">Analysis Failed</p>
                        <p className="text-xs text-muted-foreground">{selectedDoc.error}</p>
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
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-medium">{coverage.type}</h4>
                                    {coverage.premium && (
                                      <Badge variant="secondary">{coverage.premium}</Badge>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                      <span className="text-muted-foreground">Limit:</span>
                                      <p className="font-medium">{coverage.limit}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Deductible:</span>
                                      <p className="font-medium">{coverage.deductible}</p>
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
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              placeholder="Search coverage details..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                              className="pl-10"
                            />
                          </div>
                          <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
                            {isSearching ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <FileSearch className="w-4 h-4" />
                            )}
                          </Button>
                        </div>

                        {searchResults.length > 0 && (
                          <div className="space-y-2">
                            {searchResults.map((result, idx) => (
                              <Card key={idx}>
                                <CardContent className="p-3">
                                  <div className="flex items-start justify-between">
                                    <p className="text-sm flex-1">{result.text}</p>
                                    <Badge variant="secondary" className="ml-2 shrink-0">
                                      {result.relevance}%
                                    </Badge>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}

                        {searchResults.length === 0 && searchQuery && !isSearching && (
                          <div className="text-center py-8 text-muted-foreground text-sm">
                            No results found for "{searchQuery}"
                          </div>
                        )}
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
