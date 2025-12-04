import { useState, useEffect, useCallback } from 'react';

interface KanbanColumn {
  id: string;
  items: Array<{ id: string; [key: string]: any }>;
}

interface UseKanbanKeyboardOptions {
  columns: KanbanColumn[];
  onMove: (itemId: string, fromColumnId: string, toColumnId: string) => void;
  enabled?: boolean;
}

export function useKanbanKeyboard({
  columns,
  onMove,
  enabled = true,
}: UseKanbanKeyboardOptions) {
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [focusedColumnId, setFocusedColumnId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  // Find item and column by item ID
  const findItemLocation = useCallback((itemId: string) => {
    for (const column of columns) {
      const itemIndex = column.items.findIndex(item => item.id === itemId);
      if (itemIndex !== -1) {
        return { column, itemIndex };
      }
    }
    return null;
  }, [columns]);

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
    // Clear announcement after screen reader has time to read it
    setTimeout(() => setAnnouncement(''), 1000);
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!focusedItemId || !focusedColumnId) return;

      const location = findItemLocation(focusedItemId);
      if (!location) return;

      const { column, itemIndex } = location;
      const columnIndex = columns.findIndex(col => col.id === column.id);

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          // Move focus to previous item in same column
          if (itemIndex > 0) {
            const prevItem = column.items[itemIndex - 1];
            setFocusedItemId(prevItem.id);
            announce(`Focused on ${prevItem.title || 'item'}`);
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          // Move focus to next item in same column
          if (itemIndex < column.items.length - 1) {
            const nextItem = column.items[itemIndex + 1];
            setFocusedItemId(nextItem.id);
            announce(`Focused on ${nextItem.title || 'item'}`);
          }
          break;

        case 'ArrowLeft':
          e.preventDefault();
          // Move focus to previous column
          if (columnIndex > 0) {
            const prevColumn = columns[columnIndex - 1];
            if (prevColumn.items.length > 0) {
              setFocusedColumnId(prevColumn.id);
              setFocusedItemId(prevColumn.items[0].id);
              announce(`Moved to ${prevColumn.id} column`);
            }
          }
          break;

        case 'ArrowRight':
          e.preventDefault();
          // Move focus to next column
          if (columnIndex < columns.length - 1) {
            const nextColumn = columns[columnIndex + 1];
            if (nextColumn.items.length > 0) {
              setFocusedColumnId(nextColumn.id);
              setFocusedItemId(nextColumn.items[0].id);
              announce(`Moved to ${nextColumn.id} column`);
            }
          }
          break;

        case ' ':
        case 'Enter':
          e.preventDefault();
          // Toggle drag mode
          if (isDragging) {
            // Drop item
            setIsDragging(false);
            announce(`Dropped item in ${focusedColumnId} column`);
          } else {
            // Pick up item
            setIsDragging(true);
            announce(`Picked up item. Use arrow keys to move, Enter to drop, Escape to cancel`);
          }
          break;

        case 'Escape':
          e.preventDefault();
          if (isDragging) {
            setIsDragging(false);
            announce('Drag cancelled');
          }
          break;
      }

      // If dragging and moving between columns, perform the move
      if (isDragging && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const newLocation = findItemLocation(focusedItemId);
        if (newLocation && newLocation.column.id !== column.id) {
          onMove(focusedItemId, column.id, newLocation.column.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedItemId, focusedColumnId, isDragging, columns, findItemLocation, onMove, announce, enabled]);

  const setItemFocus = useCallback((itemId: string, columnId: string) => {
    setFocusedItemId(itemId);
    setFocusedColumnId(columnId);
  }, []);

  const clearFocus = useCallback(() => {
    setFocusedItemId(null);
    setFocusedColumnId(null);
    setIsDragging(false);
  }, []);

  return {
    focusedItemId,
    focusedColumnId,
    isDragging,
    announcement,
    setItemFocus,
    clearFocus,
  };
}
