import React, { useState } from 'react';
import { useTaskBulkActions, TaskStatus, TaskPriority } from '@/hooks/useTaskBulkActions';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { X, CheckCircle, Trash2, UserPlus, Flag } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface TaskBulkActionsBarProps {
  selectedTaskIds: string[];
  onClearSelection: () => void;
  onComplete: () => void;
}

export function TaskBulkActionsBar({ selectedTaskIds, onClearSelection, onComplete }: TaskBulkActionsBarProps) {
  const { processing, bulkUpdateStatus, bulkUpdatePriority, bulkAssign, bulkDelete } = useTaskBulkActions();
  const [showDialog, setShowDialog] = useState(false);
  const [action, setAction] = useState<'status' | 'priority' | 'assign' | 'delete' | null>(null);
  const [selectedValue, setSelectedValue] = useState('');

  if (selectedTaskIds.length === 0) return null;

  const handleAction = async () => {
    let success = false;

    switch (action) {
      case 'status':
        success = await bulkUpdateStatus(selectedTaskIds, selectedValue as TaskStatus);
        break;
      case 'priority':
        success = await bulkUpdatePriority(selectedTaskIds, selectedValue as TaskPriority);
        break;
      case 'assign':
        success = await bulkAssign(selectedTaskIds, selectedValue);
        break;
      case 'delete':
        success = await bulkDelete(selectedTaskIds);
        break;
    }

    if (success) {
      setShowDialog(false);
      setAction(null);
      setSelectedValue('');
      onClearSelection();
      onComplete();
    }
  };

  const openDialog = (actionType: 'status' | 'priority' | 'assign' | 'delete') => {
    setAction(actionType);
    setShowDialog(true);
  };

  return (
    <>
      <Card className="fixed bottom-6 left-1/2 transform -translate-x-1/2 shadow-lg z-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="font-medium">{selectedTaskIds.length} selected</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={onClearSelection}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="h-6 w-px bg-border" />

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openDialog('status')}
                disabled={processing}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Update Status
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => openDialog('priority')}
                disabled={processing}
              >
                <Flag className="h-4 w-4 mr-1" />
                Set Priority
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => openDialog('assign')}
                disabled={processing}
              >
                <UserPlus className="h-4 w-4 mr-1" />
                Assign
              </Button>

              <Button
                size="sm"
                variant="destructive"
                onClick={() => openDialog('delete')}
                disabled={processing}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === 'status' && 'Update Status'}
              {action === 'priority' && 'Set Priority'}
              {action === 'assign' && 'Assign Tasks'}
              {action === 'delete' && 'Delete Tasks'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {action === 'delete' ? (
              <p className="text-muted-foreground">
                Are you sure you want to delete {selectedTaskIds.length} task(s)? This action cannot be undone.
              </p>
            ) : (
              <div>
                <Label htmlFor="bulkValue">
                  {action === 'status' && 'Select Status'}
                  {action === 'priority' && 'Select Priority'}
                  {action === 'assign' && 'Assign To (User ID)'}
                </Label>
                {action === 'status' && (
                  <Select value={selectedValue} onValueChange={setSelectedValue}>
                    <SelectTrigger id="bulkValue">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {action === 'priority' && (
                  <Select value={selectedValue} onValueChange={setSelectedValue}>
                    <SelectTrigger id="bulkValue">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {action === 'assign' && (
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-md"
                    placeholder="Enter user ID"
                    value={selectedValue}
                    onChange={(e) => setSelectedValue(e.target.value)}
                  />
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAction} 
              disabled={processing || (action !== 'delete' && !selectedValue)}
              variant={action === 'delete' ? 'destructive' : 'default'}
            >
              {processing ? 'Processing...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
