import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, Building2, User, FileText } from 'lucide-react';
import { formatPhoneForDisplay } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useGlobalSearch, SearchResult } from '@/hooks/useGlobalSearch';
import { useDebouncedCallback } from '@/hooks/useDebounce';

interface GlobalSearchProps {
  onResultSelect?: (result: SearchResult) => void;
  placeholder?: string;
  className?: string;
}

export function GlobalSearch({ 
  onResultSelect, 
  placeholder = "Search customers, policies, contacts...",
  className = ""
}: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const { results, loading, search, clearResults } = useGlobalSearch();

  // Debounce search to avoid too many API calls
  const debouncedSearch = useDebouncedCallback(search, 300, [search]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (value.trim()) {
      setShowResults(true);
      debouncedSearch(value);
    } else {
      setShowResults(false);
      clearResults();
    }
  }, [debouncedSearch, clearResults]);

  const handleResultClick = useCallback((result: SearchResult) => {
    setShowResults(false);
    setQuery('');
    
    // Navigate to the appropriate page based on entity type
    switch (result.entity_type) {
      case 'account':
        // Navigate to full customer detail page
        navigate(`/customers/${result.id}`);
        break;
      case 'contact':
        navigate(`/customers/${result.id}`);
        break;
      case 'policy':
        navigate(`/policies/${result.id}`);
        break;
      case 'business':
        // Navigate to full customer detail page for businesses too
        navigate(`/customers/${result.id}`);
        break;
      default:
        break;
    }
    
    onResultSelect?.(result);
  }, [navigate, onResultSelect]);

  const handleClear = useCallback(() => {
    setQuery('');
    setShowResults(false);
    clearResults();
  }, [clearResults]);

  const getEntityIcon = (entityType: SearchResult['entity_type']) => {
    switch (entityType) {
      case 'contact':
        return <User className="h-4 w-4" />;
      case 'account':
        return <Users className="h-4 w-4" />;
      case 'business':
        return <Building2 className="h-4 w-4" />;
      case 'policy':
        return <FileText className="h-4 w-4" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const getEntityBadgeVariant = (entityType: SearchResult['entity_type']) => {
    switch (entityType) {
      case 'contact':
        return 'secondary';
      case 'account':
        return 'default';
      case 'business':
        return 'outline';
      case 'policy':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={placeholder}
          className="pl-10 pr-10"
          onFocus={() => {
            if (query.trim() && results.length > 0) {
              setShowResults(true);
            }
          }}
        />
        {query && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
            onClick={handleClear}
          >
            ×
          </Button>
        )}
      </div>

      {showResults && (
        <Card className="absolute top-full left-0 right-0 z-50 mt-1 max-h-96 overflow-y-auto bg-background border shadow-lg">
          <CardContent className="p-2">
            {loading && (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
              </div>
            )}

            {!loading && results.length === 0 && query.trim() && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                No results found for "{query}"
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="space-y-1">
                {results.map((result) => (
                  <button
                    key={`${result.entity_type}-${result.id}`}
                    className="w-full text-left p-3 rounded-md hover:bg-accent transition-colors"
                    onClick={() => handleResultClick(result)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getEntityIcon(result.entity_type)}
                        <div>
                          <div className="font-medium">{result.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {result.subtitle && (
                              <div className="mb-1">{result.subtitle}</div>
                            )}
                            {result.email && (
                              <span className="mr-3">{result.email}</span>
                            )}
                            {result.phone && (
                              <span>{formatPhoneForDisplay(result.phone)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Badge variant={getEntityBadgeVariant(result.entity_type)}>
                        {result.entity_type === 'account' ? 'customer' : result.entity_type}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}