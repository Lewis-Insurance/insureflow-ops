import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useChecklistItems } from '@/hooks/useChecklistItems';

interface TaskChecklistProps {
  taskId: string;
}

export function TaskChecklist({ taskId }: TaskChecklistProps) {
  const { items, loading, fetchItems, addItem, toggleItem, deleteItem } = useChecklistItems(taskId);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAddItem = async () => {
    if (!newItemTitle.trim()) return;
    
    await addItem(newItemTitle);
    setNewItemTitle('');
    setIsAdding(false);
  };

  const completedCount = items.filter(i => i.is_completed).length;
  const totalCount = items.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="font-medium">Checklist</h4>
          {totalCount > 0 && (
            <span className="text-sm text-muted-foreground">
              {completedCount}/{totalCount}
            </span>
          )}
        </div>
        {!isAdding && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="flex gap-2">
          <Input
            placeholder="Add a checklist item..."
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddItem();
              if (e.key === 'Escape') {
                setIsAdding(false);
                setNewItemTitle('');
              }
            }}
            autoFocus
          />
          <Button size="sm" onClick={handleAddItem}>
            <Check className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setIsAdding(false);
              setNewItemTitle('');
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading checklist...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No checklist items yet</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group"
            >
              <Checkbox
                checked={item.is_completed}
                onCheckedChange={(checked) => toggleItem(item.id, checked as boolean)}
              />
              <span
                className={`flex-1 text-sm ${
                  item.is_completed ? 'line-through text-muted-foreground' : ''
                }`}
              >
                {item.title}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="opacity-0 group-hover:opacity-100"
                onClick={() => deleteItem(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}