import { useState, useEffect } from 'react';
import { Bookmark, Trash2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { DocumentFilters } from './AdvancedFilters';

interface SavedView {
  id: string;
  name: string;
  filters: DocumentFilters;
  created_at: string;
  is_favorite: boolean;
}

interface SavedViewsProps {
  onLoadView: (filters: DocumentFilters) => void;
}

const STORAGE_KEY = 'document_saved_views';

export function SavedViews({ onLoadView }: SavedViewsProps) {
  const [views, setViews] = useState<SavedView[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadViewsFromStorage();
  }, []);

  const loadViewsFromStorage = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setViews(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading saved views:', error);
    }
  };

  const saveViewsToStorage = (newViews: SavedView[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newViews));
      setViews(newViews);
    } catch (error) {
      console.error('Error saving views:', error);
    }
  };

  const handleSave = (name: string, filters: DocumentFilters) => {
    const newView: SavedView = {
      id: crypto.randomUUID(),
      name,
      filters,
      created_at: new Date().toISOString(),
      is_favorite: false
    };

    const updated = [...views, newView];
    saveViewsToStorage(updated);

    toast({
      title: "Success",
      description: "View saved successfully",
    });
  };

  const handleDelete = (id: string) => {
    const updated = views.filter(v => v.id !== id);
    saveViewsToStorage(updated);

    toast({
      title: "Success",
      description: "View deleted",
    });
  };

  const handleToggleFavorite = (id: string) => {
    const updated = views.map(v => 
      v.id === id ? { ...v, is_favorite: !v.is_favorite } : v
    );
    saveViewsToStorage(updated);
  };

  if (views.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <Bookmark className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Saved Views</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {views.map(view => (
          <Card key={view.id} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div 
                  className="flex-1 cursor-pointer"
                  onClick={() => onLoadView(view.filters)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{view.name}</span>
                    {view.is_favorite && (
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {view.filters.uploadedBy && view.filters.uploadedBy.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {view.filters.uploadedBy.length} agent(s)
                      </Badge>
                    )}
                    {view.filters.accountId && view.filters.accountId.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {view.filters.accountId.length} customer(s)
                      </Badge>
                    )}
                    {view.filters.policyId && view.filters.policyId.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {view.filters.policyId.length} policy(ies)
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFavorite(view.id);
                    }}
                  >
                    <Star className={`w-3 h-3 ${view.is_favorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(view.id);
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
