import { AlertTriangle, Loader2 } from 'lucide-react';
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
import { useAccountWithCounts } from '@/hooks/useCustomerMerge';

interface MergeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  masterId: string | null;
  mergedId: string | null;
  onConfirm: () => void;
  isLoading: boolean;
}

export function MergeConfirmDialog({
  open,
  onOpenChange,
  masterId,
  mergedId,
  onConfirm,
  isLoading,
}: MergeConfirmDialogProps) {
  const { data: masterAccount } = useAccountWithCounts(masterId);
  const { data: mergedAccount } = useAccountWithCounts(mergedId);

  if (!masterAccount || !mergedAccount) {
    return null;
  }

  const totalRecords =
    mergedAccount.policiesCount +
    mergedAccount.quotesCount +
    mergedAccount.documentsCount +
    mergedAccount.tasksCount +
    mergedAccount.communicationsCount;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Confirm Customer Merge
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                You are about to merge <strong>{mergedAccount.name}</strong> into{' '}
                <strong>{masterAccount.name}</strong>.
              </p>

              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <p className="font-medium text-foreground">What will happen:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>
                    {totalRecords > 0
                      ? `${totalRecords} records will be transferred to ${masterAccount.name}`
                      : 'No records to transfer'}
                  </li>
                  {mergedAccount.notes && <li>Notes will be appended to master account</li>}
                  <li>
                    <strong>{mergedAccount.name}</strong> will be archived (soft-deleted)
                  </li>
                  <li>An audit record will be created for this merge</li>
                </ul>
              </div>

              <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm">
                <strong>Warning:</strong> This action cannot be easily undone. Please make sure
                you have selected the correct master account.
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Merging...
              </>
            ) : (
              'Merge Customers'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
