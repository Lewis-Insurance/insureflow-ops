import { useState } from 'react';
import { Check, X, Users, SlidersHorizontal, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useBulkUpdateRenewalStatus,
  useBulkAssignRenewals,
  RenewalStatus,
  getStatusConfig,
} from '@/hooks/useRenewalWorkflow';
import { useAgencyMembers } from '@/hooks/useAgencyWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface BulkActionsBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onSelectAll?: () => void;
  totalCount?: number;
}

const BULK_STATUS_OPTIONS: { value: RenewalStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'renewed', label: 'Renewed' },
];

export function BulkActionsBar({
  selectedIds,
  onClearSelection,
  onSelectAll,
  totalCount,
}: BulkActionsBarProps) {
  const { profile } = useAuth();
  const { members } = useAgencyMembers(profile?.default_agency_workspace_id);
  const bulkUpdateStatus = useBulkUpdateRenewalStatus();
  const bulkAssign = useBulkAssignRenewals();

  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [showAssignConfirm, setShowAssignConfirm] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<RenewalStatus | null>(null);
  const [pendingAssignee, setPendingAssignee] = useState<string | null>(null);

  const handleStatusChange = (status: RenewalStatus) => {
    setPendingStatus(status);
    setShowStatusConfirm(true);
  };

  const confirmStatusChange = () => {
    if (!pendingStatus) return;

    bulkUpdateStatus.mutate(
      { renewalIds: selectedIds, status: pendingStatus },
      {
        onSuccess: () => {
          setShowStatusConfirm(false);
          setPendingStatus(null);
          onClearSelection();
        },
      }
    );
  };

  const handleAssignChange = (userId: string) => {
    setPendingAssignee(userId);
    setShowAssignConfirm(true);
  };

  const confirmAssignChange = () => {
    bulkAssign.mutate(
      {
        renewalIds: selectedIds,
        assignedTo: pendingAssignee === 'unassigned' ? null : pendingAssignee,
      },
      {
        onSuccess: () => {
          setShowAssignConfirm(false);
          setPendingAssignee(null);
          onClearSelection();
        },
      }
    );
  };

  const handleExport = () => {
    // Create CSV data
    const csvContent = `Renewal IDs Selected\n${selectedIds.join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `renewals-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${selectedIds.length} renewal(s)`);
  };

  if (selectedIds.length === 0) {
    return null;
  }

  const assigneeName = members?.data?.find(
    (m) => m.user_id === pendingAssignee
  )?.user?.full_name;

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-3 bg-background border shadow-lg rounded-lg px-4 py-3">
          {/* Selection Info */}
          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-sm px-3 py-1">
              {selectedIds.length} selected
            </Badge>
            {totalCount && totalCount > selectedIds.length && onSelectAll && (
              <Button variant="link" size="sm" className="text-xs h-auto p-0" onClick={onSelectAll}>
                Select all {totalCount}
              </Button>
            )}
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Status Change */}
          <Select onValueChange={(v) => handleStatusChange(v as RenewalStatus)}>
            <SelectTrigger className="w-[140px] h-9">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              <span className="text-sm">Set Status</span>
            </SelectTrigger>
            <SelectContent>
              {BULK_STATUS_OPTIONS.map((option) => {
                const config = getStatusConfig(option.value);
                return (
                  <SelectItem key={option.value} value={option.value}>
                    <span className={config.color}>{option.label}</span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Assign */}
          <Select onValueChange={handleAssignChange}>
            <SelectTrigger className="w-[140px] h-9">
              <Users className="h-4 w-4 mr-2" />
              <span className="text-sm">Assign To</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {members?.data?.map((member) => (
                <SelectItem key={member.user_id} value={member.user_id}>
                  {member.user?.full_name || member.user?.email || 'Unknown'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Export */}
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>

          <div className="w-px h-6 bg-border" />

          {/* Clear Selection */}
          <Button variant="ghost" size="sm" onClick={onClearSelection}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      {/* Status Change Confirmation */}
      <AlertDialog open={showStatusConfirm} onOpenChange={setShowStatusConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Status</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change the status of {selectedIds.length} renewal(s) to{' '}
              <strong>{pendingStatus ? getStatusConfig(pendingStatus).label : ''}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStatus(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStatusChange}
              disabled={bulkUpdateStatus.isPending}
            >
              {bulkUpdateStatus.isPending ? 'Updating...' : 'Update Status'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assignment Confirmation */}
      <AlertDialog open={showAssignConfirm} onOpenChange={setShowAssignConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assign Renewals</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to assign {selectedIds.length} renewal(s) to{' '}
              <strong>{pendingAssignee === 'unassigned' ? 'no one' : assigneeName || 'selected user'}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingAssignee(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAssignChange} disabled={bulkAssign.isPending}>
              {bulkAssign.isPending ? 'Assigning...' : 'Assign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
