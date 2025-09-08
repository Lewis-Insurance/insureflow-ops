import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus, Tag as TagIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface TagManagerProps {
  tags: Array<{ tag_name: string; id?: string }>;
  entityType: 'account' | 'contact';
  entityId: string;
  onTagsUpdate?: (tags: Array<{ tag_name: string; id?: string }>) => void;
  className?: string;
}

export function TagManager({ 
  tags = [], 
  entityType, 
  entityId, 
  onTagsUpdate,
  className 
}: TagManagerProps) {
  const [newTag, setNewTag] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    
    const trimmedTag = newTag.trim().toLowerCase();
    
    // Check for duplicates
    if (tags.some(tag => tag.tag_name.toLowerCase() === trimmedTag)) {
      toast({
        title: "Tag already exists",
        description: "This tag has already been added.",
        variant: "destructive",
      });
      return;
    }

    setIsAdding(true);
    try {
      // In a real implementation, this would make an API call
      const newTagObject = {
        tag_name: trimmedTag,
        id: `temp-${Date.now()}` // Temporary ID
      };
      
      const updatedTags = [...tags, newTagObject];
      onTagsUpdate?.(updatedTags);
      
      setNewTag('');
      toast({
        title: "Tag added",
        description: `Tag "${trimmedTag}" has been added.`,
      });
    } catch (error) {
      toast({
        title: "Error adding tag",
        description: "Failed to add the tag. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveTag = async (tagToRemove: { tag_name: string; id?: string }) => {
    try {
      const updatedTags = tags.filter(tag => tag.tag_name !== tagToRemove.tag_name);
      onTagsUpdate?.(updatedTags);
      
      toast({
        title: "Tag removed",
        description: `Tag "${tagToRemove.tag_name}" has been removed.`,
      });
    } catch (error) {
      toast({
        title: "Error removing tag",
        description: "Failed to remove the tag. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <TagIcon className="h-4 w-4" />
        Tags
      </div>
      
      {/* Display existing tags */}
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge
            key={tag.id || `${tag.tag_name}-${Date.now()}`}
            variant="secondary"
            className="flex items-center gap-1 hover:bg-secondary/80 transition-colors"
          >
            {tag.tag_name}
            <button
              onClick={() => handleRemoveTag(tag)}
              className="ml-1 hover:text-destructive transition-colors"
              type="button"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        
        {tags.length === 0 && (
          <span className="text-sm text-muted-foreground italic">
            No tags added yet
          </span>
        )}
      </div>

      {/* Add new tag */}
      <div className="flex gap-2">
        <Input
          placeholder="Add a tag..."
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button
          onClick={handleAddTag}
          disabled={!newTag.trim() || isAdding}
          size="sm"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}