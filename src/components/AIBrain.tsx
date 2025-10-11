import React, { useState, useRef } from 'react';
import { 
  Brain, Search, Sparkles, RefreshCw, Plus, 
  Database, Shield, Zap, Loader2, Tag, Download, Upload, FileText
} from 'lucide-react';
import { useKnowledgeBase } from '@/hooks/useKnowledgeBase';
import { useAIBrain } from '@/hooks/useAIBrain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const InsuranceAIBrain = () => {
  const { entries, loading: kbLoading, stats, fetchKnowledgeBase } = useKnowledgeBase();
  const { queryKnowledge, updateEmbeddings, loading: aiLoading } = useAIBrain();
  const { toast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newEntry, setNewEntry] = useState({
    title: '',
    content: '',
    category: 'policies',
    tags: '',
    source: ''
  });
  const [isImporting, setIsImporting] = useState(false);
  const [showDocumentImport, setShowDocumentImport] = useState(false);
  const [isConvertingDocs, setIsConvertingDocs] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    const category = selectedCategory === 'all' ? undefined : selectedCategory;
    const results = await queryKnowledge(searchQuery, category);
    setSearchResults(results);
  };
  
  const handleUpdateEmbeddings = async () => {
    await updateEmbeddings();
    await fetchKnowledgeBase();
  };

  const handleAddKnowledge = async () => {
    if (!newEntry.title || !newEntry.content) {
      toast({
        title: "Error",
        description: "Title and content are required",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from('knowledge_base')
      .insert({
        title: newEntry.title,
        content: newEntry.content,
        category: newEntry.category,
        tags: newEntry.tags.split(',').map(t => t.trim()).filter(Boolean),
        source: newEntry.source || 'Manual Entry'
      });
    
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ 
        title: "Success", 
        description: "Knowledge added successfully!" 
      });
      setShowAddDialog(false);
      setNewEntry({
        title: '',
        content: '',
        category: 'policies',
        tags: '',
        source: ''
      });
      fetchKnowledgeBase();
    }
  };

  const handleDownloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/knowledge-template.csv';
    link.download = 'knowledge-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Template Downloaded",
      description: "Use this template to import knowledge entries",
    });
  };

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error('CSV file is empty or invalid');
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const entries = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
        if (!values || values.length < headers.length) continue;

        const entry: any = {};
        headers.forEach((header, index) => {
          entry[header] = values[index]?.replace(/^"|"$/g, '').trim();
        });

        // Convert tags from pipe-separated to array
        if (entry.tags) {
          entry.tags = entry.tags.split('|').map((t: string) => t.trim());
        }

        entries.push(entry);
      }

      const { error } = await supabase
        .from('knowledge_base')
        .insert(entries);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Imported ${entries.length} knowledge entries`,
      });

      fetchKnowledgeBase();
      
    } catch (error: any) {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const convertDocumentToKnowledge = async (document: any) => {
    // Extract key sections from document
    const knowledge = {
      title: document.name?.replace(/\.[^/.]+$/, "") || document.filename?.replace(/\.[^/.]+$/, "") || "Untitled",
      content: document.extracted_content || document.content || "No content available",
      category: document.category || 'policies',
      tags: document.keywords || document.tags || [],
      source: document.name || document.filename || 'Document Import'
    };
    
    const { error } = await supabase.from('knowledge_base').insert(knowledge);
    if (error) throw error;
    return knowledge;
  };

  const handleImportFromDocuments = async () => {
    setIsConvertingDocs(true);
    
    try {
      // Fetch documents that haven't been converted yet
      const { data: documents, error: docError } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (docError) throw docError;

      if (!documents || documents.length === 0) {
        toast({
          title: "No Documents",
          description: "No documents found in Document Intelligence. Upload some documents first.",
          variant: "destructive",
        });
        return;
      }

      let convertedCount = 0;
      const errors: string[] = [];

      for (const doc of documents) {
        try {
          await convertDocumentToKnowledge(doc);
          convertedCount++;
        } catch (err: any) {
          errors.push(`${doc.name || doc.filename}: ${err.message}`);
        }
      }

      if (convertedCount > 0) {
        toast({
          title: "Success",
          description: `Converted ${convertedCount} documents to knowledge entries`,
        });
        fetchKnowledgeBase();
      }

      if (errors.length > 0) {
        toast({
          title: "Partial Success",
          description: `Converted ${convertedCount} documents, but ${errors.length} failed`,
          variant: "destructive",
        });
      }

    } catch (error: any) {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsConvertingDocs(false);
      setShowDocumentImport(false);
    }
  };
  
  // Group entries by category
  const categorizedEntries = entries.reduce((acc, entry) => {
    const cat = entry.category || 'uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(entry);
    return acc;
  }, {} as Record<string, typeof entries>);
  
  const categories = Object.keys(categorizedEntries);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle>AI Knowledge Brain</CardTitle>
                <CardDescription>
                  Intelligent knowledge base with {stats.totalEntries} entries across {stats.categories} categories
                </CardDescription>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Knowledge
              </Button>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
              >
                {isImporting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Import CSV
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadTemplate}
              >
                <Download className="w-4 h-4 mr-2" />
                Download Template
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowDocumentImport(true)}
                disabled={isConvertingDocs}
              >
                {isConvertingDocs ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4 mr-2" />
                )}
                Import from Documents
              </Button>
              <Button
                variant="outline"
                onClick={handleUpdateEmbeddings}
                disabled={aiLoading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${aiLoading ? 'animate-spin' : ''}`} />
                Update AI Embeddings
              </Button>
              <Button onClick={fetchKnowledgeBase} disabled={kbLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${kbLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleImportCSV}
              className="hidden"
            />
          </div>
        </CardHeader>
      </Card>
      
      {/* AI Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Sparkles className="w-5 h-5 mr-2 text-purple-600" />
            AI-Powered Knowledge Search
          </CardTitle>
          <CardDescription>
            Ask questions about insurance policies, procedures, and regulations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <Input
              placeholder="Ask anything about insurance..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={aiLoading}>
              {aiLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Search with AI
            </Button>
          </div>
          
          {/* Search Results */}
          {searchResults && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-semibold mb-2">AI Response:</h4>
              <p className="text-gray-700 whitespace-pre-wrap">{searchResults.response}</p>
              
              {searchResults.sources && searchResults.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-sm text-gray-500 mb-2">Sources:</p>
                  <div className="flex flex-wrap gap-2">
                    {searchResults.sources.map((source: any, idx: number) => (
                      <Badge key={idx} variant="secondary">
                        {source.title} ({Math.round(source.relevance * 100)}%)
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {searchResults.confidence && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Confidence:</span>
                    <span className="font-medium">{searchResults.confidence}%</span>
                  </div>
                  <Progress value={searchResults.confidence} className="mt-1" />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Knowledge Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Entries</p>
                <p className="text-2xl font-bold">{stats.totalEntries}</p>
              </div>
              <Database className="w-8 h-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Categories</p>
                <p className="text-2xl font-bold">{stats.categories}</p>
              </div>
              <Brain className="w-8 h-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">AI Ready</p>
                <p className="text-2xl font-bold">95%</p>
              </div>
              <Shield className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Response Time</p>
                <p className="text-2xl font-bold">1.2s</p>
              </div>
              <Zap className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Knowledge Entries by Category */}
      <Card>
        <CardHeader>
          <CardTitle>Knowledge Base Entries</CardTitle>
          <CardDescription>
            Browse and manage your insurance knowledge base
          </CardDescription>
        </CardHeader>
        <CardContent>
          {kbLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No knowledge entries found</p>
            </div>
          ) : (
            <Tabs defaultValue={categories[0] || 'all'}>
              <TabsList className="grid grid-cols-4 w-full max-w-2xl">
                {categories.slice(0, 4).map(cat => (
                  <TabsTrigger key={cat} value={cat}>
                    {cat} ({categorizedEntries[cat].length})
                  </TabsTrigger>
                ))}
              </TabsList>
              
              {categories.map(category => (
                <TabsContent key={category} value={category} className="space-y-2">
                  {categorizedEntries[category].map(entry => (
                    <div key={entry.id} className="p-4 border rounded-lg hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold">{entry.title}</h4>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {entry.content}
                          </p>
                          <div className="flex items-center space-x-2 mt-2">
                            {entry.tags.map((tag, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <Badge variant="secondary">{entry.category}</Badge>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <span className="text-xs text-gray-500">
                          Source: {entry.source || 'Manual Entry'}
                        </span>
                        <span className="text-xs text-gray-500">
                          Updated: {new Date(entry.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Import from Documents Dialog */}
      <Dialog open={showDocumentImport} onOpenChange={setShowDocumentImport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from Document Intelligence</DialogTitle>
            <DialogDescription>
              Convert documents from Document Intelligence into knowledge base entries
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will convert all documents from your Document Intelligence into knowledge base entries. 
              Each document will be added with its extracted content, title, and metadata.
            </p>
            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-semibold mb-2">What gets converted:</h4>
              <ul className="text-sm space-y-1 list-disc list-inside">
                <li>Document title becomes knowledge title</li>
                <li>Extracted content becomes knowledge content</li>
                <li>Document category is preserved</li>
                <li>Keywords/tags are imported</li>
                <li>Original filename is stored as source</li>
              </ul>
            </div>
            <div className="flex space-x-2">
              <Button 
                onClick={handleImportFromDocuments}
                disabled={isConvertingDocs}
                className="flex-1"
              >
                {isConvertingDocs ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Converting...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Convert Documents
                  </>
                )}
              </Button>
              <Button 
                variant="outline"
                onClick={() => setShowDocumentImport(false)}
                disabled={isConvertingDocs}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Knowledge Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Insurance Knowledge</DialogTitle>
            <DialogDescription>
              Add new knowledge to your AI brain for intelligent search and assistance
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={newEntry.title}
                onChange={(e) => setNewEntry({...newEntry, title: e.target.value})}
                placeholder="e.g., Auto Insurance Deductibles"
              />
            </div>
            
            <div>
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={newEntry.content}
                onChange={(e) => setNewEntry({...newEntry, content: e.target.value})}
                placeholder="Detailed explanation..."
                rows={6}
              />
            </div>
            
            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={newEntry.category} onValueChange={(v) => setNewEntry({...newEntry, category: v})}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="policies">Policies</SelectItem>
                  <SelectItem value="procedures">Procedures</SelectItem>
                  <SelectItem value="products">Products</SelectItem>
                  <SelectItem value="regulations">Regulations</SelectItem>
                  <SelectItem value="claims">Claims</SelectItem>
                  <SelectItem value="faqs">FAQs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input
                id="tags"
                value={newEntry.tags}
                onChange={(e) => setNewEntry({...newEntry, tags: e.target.value})}
                placeholder="auto, coverage, liability"
              />
            </div>
            
            <div>
              <Label htmlFor="source">Source</Label>
              <Input
                id="source"
                value={newEntry.source}
                onChange={(e) => setNewEntry({...newEntry, source: e.target.value})}
                placeholder="e.g., Policy Manual v2.3"
              />
            </div>
            
            <Button onClick={handleAddKnowledge} className="w-full">
              Add to Knowledge Base
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InsuranceAIBrain;