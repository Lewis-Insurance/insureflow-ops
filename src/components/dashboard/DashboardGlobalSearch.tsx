import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, Building2, User, FileText, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useGlobalSearch, SearchResult } from '@/hooks/useGlobalSearch';

export function DashboardGlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const { results, loading, search, clearResults } = useGlobalSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the search - only trigger after user stops typing for 400ms
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (query.trim()) {
      debounceTimerRef.current = setTimeout(() => {
        setDebouncedQuery(query);
      }, 400);
    } else {
      setDebouncedQuery('');
      clearResults();
      setShowResults(false);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, clearResults]);

  // Trigger search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.trim()) {
      search(debouncedQuery);
      setShowResults(true);
    }
  }, [debouncedQuery, search]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleResultClick = useCallback((result: SearchResult) => {
    setShowResults(false);
    setQuery('');
    setDebouncedQuery('');
    clearResults();

    // Navigate to the appropriate page based on entity type
    switch (result.entity_type) {
      case 'account':
        navigate(`/crm/accounts/${result.id}`);
        break;
      case 'contact':
        navigate(`/customers/${result.id}`);
        break;
      case 'policy':
        navigate(`/policies/${result.id}`);
        break;
      case 'business':
        navigate(`/crm/accounts/${result.id}`);
        break;
      default:
        break;
    }
  }, [navigate, clearResults]);

  const handleClear = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setShowResults(false);
    clearResults();
    inputRef.current?.focus();
  }, [clearResults]);

  const handleSearchClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handleQuickSearch = useCallback((term: string) => {
    setQuery(term);
    setDebouncedQuery(term);
    search(term);
    setShowResults(true);
  }, [search]);

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getEntityIcon = (entityType: SearchResult['entity_type']) => {
    switch (entityType) {
      case 'contact':
        return <User className="h-5 w-5" />;
      case 'account':
        return <Users className="h-5 w-5" />;
      case 'business':
        return <Building2 className="h-5 w-5" />;
      case 'policy':
        return <FileText className="h-5 w-5" />;
      default:
        return <Search className="h-5 w-5" />;
    }
  };

  const getEntityLabel = (entityType: SearchResult['entity_type']) => {
    switch (entityType) {
      case 'contact':
        return 'Contact';
      case 'account':
        return 'Customer';
      case 'business':
        return 'Business';
      case 'policy':
        return 'Policy';
      default:
        return entityType;
    }
  };

  const getEntityColor = (entityType: SearchResult['entity_type']) => {
    switch (entityType) {
      case 'contact':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'account':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'business':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'policy':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Determine if we should show the dropdown
  const shouldShowDropdown = showResults && (loading || results.length > 0 || (debouncedQuery.trim() && !loading));

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Main Search Container */}
      <Card className={`border-2 transition-all duration-200 ${isFocused ? 'border-green-500 shadow-lg shadow-green-500/20' : 'border-green-500/50'}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {/* Big Green Search Button */}
            <Button
              onClick={handleSearchClick}
              className="h-14 px-6 bg-green-600 hover:bg-green-700 text-white font-bold text-lg shadow-lg hover:shadow-xl transition-all"
              size="lg"
              type="button"
            >
              <Search className="h-6 w-6 mr-2" />
              Search
            </Button>

            {/* Search Input */}
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={query}
                onChange={handleInputChange}
                placeholder="Search by customer name, policy number, address, email, phone..."
                className="h-14 text-lg pl-4 pr-12 border-2 border-gray-200 dark:border-gray-700 focus:border-green-500 focus:ring-green-500"
                onFocus={() => {
                  setIsFocused(true);
                  if (debouncedQuery.trim() && results.length > 0) {
                    setShowResults(true);
                  }
                }}
                onBlur={() => setIsFocused(false)}
              />
              {query && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 hover:bg-gray-200 dark:hover:bg-gray-700"
                  onClick={handleClear}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>

          {/* Search Hints - only show when input is empty */}
          {!query && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground">Try:</span>
              <Badge variant="outline" className="text-xs cursor-pointer hover:bg-accent" onClick={() => handleQuickSearch('auto')}>auto policies</Badge>
              <Badge variant="outline" className="text-xs cursor-pointer hover:bg-accent" onClick={() => handleQuickSearch('home')}>home policies</Badge>
              <Badge variant="outline" className="text-xs cursor-pointer hover:bg-accent" onClick={() => handleQuickSearch('lewis')}>customer name</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Results Dropdown */}
      {shouldShowDropdown && (
        <Card className="absolute top-full left-0 right-0 z-50 mt-2 max-h-[500px] overflow-y-auto bg-background border-2 border-green-500/50 shadow-xl">
          <CardContent className="p-3">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
                <span className="ml-3 text-muted-foreground">Searching...</span>
              </div>
            )}

            {!loading && results.length === 0 && debouncedQuery.trim() && (
              <div className="text-center py-8">
                <Search className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No results found for "{debouncedQuery}"</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Try searching by name, policy number, email, or phone</p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wide px-2 py-1">
                  {results.length} result{results.length !== 1 ? 's' : ''} found
                </div>
                {results.map((result) => (
                  <button
                    key={`${result.entity_type}-${result.id}`}
                    className="w-full text-left p-4 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors border border-transparent hover:border-green-200 dark:hover:border-green-800"
                    onClick={() => handleResultClick(result)}
                    type="button"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className={`p-2 rounded-lg ${getEntityColor(result.entity_type)}`}>
                          {getEntityIcon(result.entity_type)}
                        </div>
                        <div>
                          <div className="font-semibold text-base">{result.label}</div>
                          <div className="text-sm text-muted-foreground">
                            {result.subtitle && (
                              <div className="mb-0.5">{result.subtitle}</div>
                            )}
                            <div className="flex items-center gap-3">
                              {result.email && (
                                <span className="text-xs">{result.email}</span>
                              )}
                              {result.phone && (
                                <span className="text-xs">{result.phone}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <Badge className={getEntityColor(result.entity_type)}>
                        {getEntityLabel(result.entity_type)}
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
