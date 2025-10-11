import React, { useState } from 'react';
import { 
  Brain, Search, Sparkles, RefreshCw, Plus, 
  Database, Shield, Zap, Loader2, Tag
} from 'lucide-react';
import { useKnowledgeBase } from '@/hooks/useKnowledgeBase';
import { useAIBrain } from '@/hooks/useAIBrain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const InsuranceAIBrain = () => {
  const { entries, loading: kbLoading, stats, fetchKnowledgeBase } = useKnowledgeBase();
  const { queryKnowledge, updateEmbeddings, loading: aiLoading } = useAIBrain();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  
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
    </div>
  );
};

export default InsuranceAIBrain;