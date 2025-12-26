import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import { Search, Sparkles, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAIBrain } from '@/hooks/useAIBrain';
import { useKnowledgeBase } from '@/hooks/useKnowledgeBase';

export const AIKnowledgeSearch = () => {
  const { queryKnowledge, loading: aiLoading } = useAIBrain();
  const { entries } = useKnowledgeBase();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  // Group entries by category
  const categorizedEntries = entries.reduce((acc, entry) => {
    const cat = entry.category || 'uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(entry);
    return acc;
  }, {} as Record<string, typeof entries>);
  
  const categories = Object.keys(categorizedEntries);
  
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    const results = await queryKnowledge(searchQuery);
    setSearchResults(results);
  };
  
  return (
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
            className="px-3 py-2 border rounded-lg bg-background"
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
          <div className="mt-4 p-4 bg-muted rounded-lg space-y-4">
            <div>
              <h4 className="font-semibold mb-2 flex items-center">
                <Sparkles className="w-4 h-4 mr-2 text-purple-600" />
                Quick Answer:
              </h4>
              <p className="text-foreground">{searchResults.shortAnswer}</p>
            </div>
            
            {searchResults.fullAnswer && (
              <details className="cursor-pointer">
                <summary className="font-medium text-sm text-primary hover:underline">
                  Read full answer...
                </summary>
                <div className="mt-2 pt-2 border-t prose prose-sm max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(searchResults.fullAnswer) }} />
                </div>
              </details>
            )}
            
            {searchResults.fallback && searchResults.sources && searchResults.sources.length > 0 && (
              <div className="pt-3 border-t">
                <p className="text-sm text-muted-foreground mb-2">Matching entries:</p>
                <div className="space-y-2">
                  {searchResults.sources.map((source: any, idx: number) => (
                    <details key={idx} className="cursor-pointer">
                      <summary className="text-sm font-medium text-primary hover:underline">
                        {source.title}
                      </summary>
                      <div className="mt-1 pl-4 text-sm text-muted-foreground">
                        <p>{source.content?.substring(0, 200)}...</p>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
            
            {searchResults.confidence !== undefined && (
              <div className="pt-3 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Confidence:</span>
                  <span className="font-medium">{Math.round(searchResults.confidence * 100)}%</span>
                </div>
                <Progress value={searchResults.confidence * 100} className="mt-1" />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
