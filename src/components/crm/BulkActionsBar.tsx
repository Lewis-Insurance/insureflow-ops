import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { CheckSquare, Tag, FileText, X, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Account, BulkAction } from '@/types/crm';

interface TeamMember {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface BulkActionsBarProps {
  selectedAccounts: Account[];
  onSelectionClear: () => void;
  onBulkAction: (action: Omit<BulkAction, 'id' | 'created_at' | 'created_by' | 'status' | 'progress' | 'success_count' | 'error_count' | 'errors'>) => void;
  className?: string;
}

export function BulkActionsBar({
  selectedAccounts,
  onSelectionClear,
  onBulkAction,
  className
}: BulkActionsBarProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [actionParams, setActionParams] = useState<Record<string, string | number>>({});
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Fetch team members when dialog opens
  useEffect(() => {
    if (isDialogOpen && selectedAction === 'create_tasks') {
      fetchTeamMembers();
    }
  }, [isDialogOpen, selectedAction]);

  const fetchTeamMembers = async () => {
    if (teamMembers.length > 0) return; // Already loaded

    setLoadingMembers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name', { ascending: true });

      if (error) {
        console.error('Error fetching team members:', error);
        return;
      }

      setTeamMembers(data || []);
    } catch (err) {
      console.error('Error fetching team members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const getDisplayName = (member: TeamMember) => {
    return member.full_name || member.email || 'Unknown User';
  };

  if (selectedAccounts.length === 0) return null;

  const handleActionSelect = (action: string) => {
    setSelectedAction(action);
    setActionParams({});
    setIsDialogOpen(true);
  };

  const handleExecuteAction = () => {
    if (!selectedAction) return;

    const bulkAction = {
      action_type: selectedAction,
      entity_type: 'accounts',
      entity_ids: selectedAccounts.map(account => account.id),
      parameters: actionParams,
      total_count: selectedAccounts.length,
    };

    onBulkAction(bulkAction);
    setIsDialogOpen(false);
    setSelectedAction('');
    setActionParams({});
    onSelectionClear();

    toast({
      title: "Bulk action started",
      description: `Processing ${selectedAccounts.length} accounts...`,
    });
  };

  const renderActionForm = () => {
    switch (selectedAction) {
      case 'add_tags':
        return (
          <div>
            <Label htmlFor="tags">Tags to Add</Label>
            <Input
              id="tags"
              placeholder="Enter tags separated by commas"
              value={actionParams.tags || ''}
              onChange={(e) => setActionParams({ ...actionParams, tags: e.target.value })}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Example: high-value, renewal-priority, vip-client
            </p>
          </div>
        );

      case 'create_tasks':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="task-title">Task Title</Label>
              <Input
                id="task-title"
                placeholder="e.g., Follow up on renewal"
                value={actionParams.title || ''}
                onChange={(e) => setActionParams({ ...actionParams, title: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                placeholder="Task details..."
                value={actionParams.description || ''}
                onChange={(e) => setActionParams({ ...actionParams, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select onValueChange={(value) => setActionParams({ ...actionParams, priority: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="assignee">Assign to</Label>
                <Select onValueChange={(value) => setActionParams({ ...actionParams, assignee_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingMembers ? "Loading..." : "Select assignee..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingMembers ? (
                      <SelectItem value="" disabled>Loading team members...</SelectItem>
                    ) : teamMembers.length === 0 ? (
                      <SelectItem value="" disabled>No team members found</SelectItem>
                    ) : (
                      teamMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {getDisplayName(member)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );

      case 'export':
        return (
          <div>
            <Label htmlFor="export-format">Export Format</Label>
            <Select onValueChange={(value) => setActionParams({ ...actionParams, format: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select format..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                <SelectItem value="pdf">PDF Report</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      default:
        return null;
    }
  };

  const getActionTitle = () => {
    switch (selectedAction) {
      case 'add_tags': return 'Add Tags';
      case 'create_tasks': return 'Create Tasks';
      case 'export': return 'Export Data';
      default: return 'Bulk Action';
    }
  };

  return (
    <>
      <div className={`flex items-center justify-between p-4 bg-primary/5 border-l-4 border-l-primary ${className}`}>
        <div className="flex items-center gap-3">
          <CheckSquare className="h-5 w-5 text-primary" />
          <span className="font-medium">
            {selectedAccounts.length} account{selectedAccounts.length === 1 ? '' : 's'} selected
          </span>
          <Badge variant="secondary">
            {selectedAccounts.filter(a => a.account_type === 'household').length} Household
          </Badge>
          <Badge variant="secondary">
            {selectedAccounts.filter(a => a.account_type === 'business').length} Business
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleActionSelect('add_tags')}
          >
            <Tag className="h-4 w-4 mr-2" />
            Add Tags
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleActionSelect('create_tasks')}
          >
            <FileText className="h-4 w-4 mr-2" />
            Create Tasks
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleActionSelect('export')}
          >
            Export
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onSelectionClear}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{getActionTitle()}</DialogTitle>
            <DialogDescription>
              This action will be applied to {selectedAccounts.length} selected accounts.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {renderActionForm()}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExecuteAction}>
              Execute Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}