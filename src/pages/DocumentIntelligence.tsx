import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  FileText, Upload, Search, Brain, Database, 
  TrendingUp, FileSearch, Sparkles, ChevronRight,
  AlertCircle, Loader2, Filter, Download, Eye, 
  Trash2, Shield, RefreshCw, ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { useDocumentIntelligence } from '@/hooks/useDocumentIntelligence';
import { useToast } from '@/hooks/use-toast';

export default function DocumentIntelligence() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const {
    documents,
    insights,
    loading,
    uploading,
    uploadProgress,
    processingStatus,
    searchResults,
    handleUpload,
    handleSearch,
    generateInsights,
    viewDocument,
    downloadDocument,
    deleteDocument,
  } = useDocumentIntelligence();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('documents');
  const [filters, setFilters] = useState({
    type: 'all',
    dateRange: 'all',
    status: 'all'
  });

  const filteredDocuments = documents.filter(doc => {
    if (filters.type !== 'all' && doc.category !== filters.type) return false;
    if (filters.status !== 'all' && doc.status !== filters.status) return false;
    return true;
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    await handleUpload(Array.from(files));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const onSearch = () => {
    if (searchQuery.trim()) {
      handleSearch(searchQuery);
    }
  };

  useEffect(() => {
    if (documents.length > 0 && insights.length === 0) {
      generateInsights();
    }
  }, [documents.length, insights.length, generateInsights]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="p-2 bg-gradient-to-r from-primary to-primary/80 rounded-lg">
                <Brain className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Document Intelligence Hub</h1>
                <p className="text-sm text-muted-foreground">AI-powered policy and document analysis</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{documents.length}</span> Documents
              </div>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Documents
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.doc"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && onSearch()}
              placeholder="Ask anything about your policies and documents..."
              className="pl-12 pr-32"
            />
            <Button
              onClick={onSearch}
              disabled={loading || !searchQuery.trim()}
              className="absolute right-2 top-1/2 transform -translate-y-1/2"
              size="sm"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              AI Search
            </Button>
          </div>
          
          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2">
              {searchResults.map(result => (
                <Card key={result.id} className="bg-accent/50">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <FileSearch className="w-4 h-4 text-primary" />
                          <span className="font-medium text-sm">{result.document}</span>
                          <Badge variant="secondary" className="text-xs">Page {result.page}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground italic">{result.excerpt}</p>
                        <p className="text-xs text-muted-foreground mt-1">{result.context}</p>
                      </div>
                      <div className="ml-4 text-right">
                        <div className="text-sm font-medium text-primary">{result.relevance}%</div>
                        <div className="text-xs text-muted-foreground">relevance</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="container mx-auto px-4 py-4">
        <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
          {['documents', 'insights', 'analytics'].map(tab => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 pb-8">
        {/* Upload Progress */}
        {uploading && processingStatus && (
          <Card className="mb-4 border-primary/50 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  <span className="text-sm font-medium">{processingStatus}</span>
                </div>
                <span className="text-sm text-muted-foreground">{Math.round(uploadProgress)}%</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div>
            {/* Filters */}
            <div className="flex items-center space-x-4 mb-4">
              <select
                value={filters.type}
                onChange={(e) => setFilters({...filters, type: e.target.value})}
                className="px-3 py-2 border border-input rounded-lg text-sm bg-background"
              >
                <option value="all">All Types</option>
                <option value="policy">Policies</option>
                <option value="claim">Claims</option>
                <option value="contract">Contracts</option>
                <option value="other">Other</option>
              </select>
              <select
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
                className="px-3 py-2 border border-input rounded-lg text-sm bg-background"
              >
                <option value="all">All Status</option>
                <option value="processed">Processed</option>
                <option value="processing">Processing</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            {/* Document Grid */}
            {filteredDocuments.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDocuments.map(doc => (
                  <Card key={doc.id} className="hover:shadow-lg transition-all duration-200 cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <FileText className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-sm">{doc.name}</h4>
                            <p className="text-xs text-muted-foreground">{doc.category} • {doc.size}</p>
                          </div>
                        </div>
                        <Badge variant={doc.status === 'processed' ? 'default' : 'secondary'}>
                          {doc.status}
                        </Badge>
                      </div>
                      
                      {doc.entities && (
                        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t">
                          <div className="text-xs">
                            <span className="text-muted-foreground">Policy #:</span>
                            <span className="ml-1 font-medium">{doc.entities.policyNumber}</span>
                          </div>
                          <div className="text-xs">
                            <span className="text-muted-foreground">Coverage:</span>
                            <span className="ml-1 font-medium">{doc.entities.coverage}</span>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center space-x-1">
                          <Shield className="w-4 h-4 text-green-600" />
                          <span className="text-xs text-muted-foreground">
                            {doc.confidence ? `${doc.confidence}%` : 'N/A'}
                          </span>
                        </div>
                        <div className="flex space-x-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => viewDocument(doc)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => downloadDocument(doc)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => deleteDocument(doc.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center">
                  <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No documents yet</h3>
                  <p className="text-muted-foreground mb-4">Upload your insurance policies, contracts, and documents to get started</p>
                  <Button onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Documents
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Insights Tab */}
        {activeTab === 'insights' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">AI-Generated Insights</h2>
              <Button
                onClick={generateInsights}
                disabled={loading || documents.length === 0}
                variant="outline"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh Insights
              </Button>
            </div>

            {insights.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.map(insight => (
                  <Card key={insight.id} className={`border-l-4 ${
                    insight.priority === 'high' ? 'border-l-destructive' :
                    insight.priority === 'medium' ? 'border-l-yellow-500' :
                    'border-l-green-500'
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          {insight.type === 'risk' && <AlertCircle className="w-5 h-5 text-destructive" />}
                          {insight.type === 'opportunity' && <TrendingUp className="w-5 h-5 text-green-600" />}
                          {insight.type === 'compliance' && <Shield className="w-5 h-5 text-primary" />}
                          {insight.type === 'trend' && <RefreshCw className="w-5 h-5 text-purple-600" />}
                          <h4 className="font-semibold">{insight.title}</h4>
                        </div>
                        <span className="text-2xl font-bold">{insight.value}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{insight.description}</p>
                      <Button variant="link" className="p-0 h-auto">
                        {insight.action}
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No insights available</h3>
                  <p className="text-muted-foreground">Upload documents to generate AI-powered insights</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <Card>
            <CardHeader>
              <CardTitle>Document Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{documents.length}</div>
                    <div className="text-sm text-muted-foreground">Total Documents</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">
                      {documents.filter(d => d.status === 'processed').length}
                    </div>
                    <div className="text-sm text-muted-foreground">Processed</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{insights.length}</div>
                    <div className="text-sm text-muted-foreground">AI Insights</div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
