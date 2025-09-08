import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Bookmark, Share2, Star, Settings, Filter } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { SavedView, CRMFilters } from '@/types/crm';

interface SavedViewsManagerProps {
  currentFilters: CRMFilters;
  savedViews: SavedView[];
  onViewSelect: (view: SavedView) => void;
  onViewSave: (view: Omit<SavedView, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => void;
  onViewDelete: (viewId: string) => void;
  className?: string;
}

export function SavedViewsManager({
  currentFilters,
  savedViews,
  onViewSelect,
  onViewSave,
  onViewDelete,
  className
}: SavedViewsManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [viewDescription, setViewDescription] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [selectedView, setSelectedView] = useState<string>('');

  const myViews = savedViews.filter(view => !view.organization_shared);
  const sharedViews = savedViews.filter(view => view.organization_shared);

  const handleSaveView = () => {
    if (!viewName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for the saved view.",
        variant: "destructive",
      });
      return;
    }

    const newView = {
      name: viewName.trim(),
      description: viewDescription.trim() || undefined,
      filters: currentFilters,
      view_type: 'accounts',
      organization_shared: isShared,
      is_default: isDefault,
    };

    onViewSave(newView);
    
    // Reset form
    setViewName('');
    setViewDescription('');
    setIsShared(false);
    setIsDefault(false);
    setIsDialogOpen(false);

    toast({
      title: "View saved",
      description: `"${newView.name}" has been saved successfully.`,
    });
  };

  const handleViewSelect = (viewId: string) => {
    const view = savedViews.find(v => v.id === viewId);
    if (view) {
      onViewSelect(view);
      setSelectedView(viewId);
      toast({
        title: "View applied",
        description: `Applied filters from "${view.name}".`,
      });
    }
  };

  const hasActiveFilters = Object.values(currentFilters).some(value => 
    value !== undefined && value !== '' && value !== 'all'
  );

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Saved Views</span>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm"
              disabled={!hasActiveFilters}
            >
              <Bookmark className="h-4 w-4 mr-2" />
              Save Current View
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save View</DialogTitle>
              <DialogDescription>
                Save your current filters and search criteria as a reusable view.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="view-name">View Name *</Label>
                <Input
                  id="view-name"
                  placeholder="e.g., Florida households with renewals in 60 days"
                  value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="view-description">Description</Label>
                <Textarea
                  id="view-description"
                  placeholder="Optional description of what this view shows..."
                  value={viewDescription}
                  onChange={(e) => setViewDescription(e.target.value)}
                  rows={3}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Share with organization</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow other team members to use this view
                  </p>
                </div>
                <Switch
                  checked={isShared}
                  onCheckedChange={setIsShared}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Set as default</Label>
                  <p className="text-sm text-muted-foreground">
                    Use this view when the page loads
                  </p>
                </div>
                <Switch
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveView}>
                Save View
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quick view selector */}
      <div className="space-y-3">
        <Select value={selectedView} onValueChange={handleViewSelect}>
          <SelectTrigger>
            <SelectValue placeholder="Select a saved view..." />
          </SelectTrigger>
          <SelectContent>
            {myViews.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  My Views
                </div>
                {myViews.map(view => (
                  <SelectItem key={view.id} value={view.id}>
                    <div className="flex items-center gap-2">
                      {view.is_default && <Star className="h-3 w-3 text-yellow-500" />}
                      {view.name}
                    </div>
                  </SelectItem>
                ))}
              </>
            )}
            
            {sharedViews.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Shared Views
                </div>
                {sharedViews.map(view => (
                  <SelectItem key={view.id} value={view.id}>
                    <div className="flex items-center gap-2">
                      <Share2 className="h-3 w-3 text-blue-500" />
                      {view.name}
                    </div>
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>

        {/* Active filters indicator */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(currentFilters).map(([key, value]) => {
              if (value && value !== '' && value !== 'all') {
                return (
                  <Badge key={key} variant="outline" className="text-xs">
                    {key}: {String(value)}
                  </Badge>
                );
              }
              return null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}