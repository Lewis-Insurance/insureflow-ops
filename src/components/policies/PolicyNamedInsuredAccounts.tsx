import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { CustomerSearchSelect, type CustomerSearchResult } from '@/components/customers/CustomerSearchSelect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { Skeleton } from '@/components/ui/skeleton';

interface PolicyNamedInsuredAccountsProps {
  policyId: string;
  ownerAccount: {
    id: string;
    name: string;
    agency_workspace_id: string;
  };
}

interface NamedInsuredAccount {
  account_id: string;
  name: string;
  created_at: string;
}

export function PolicyNamedInsuredAccounts({ policyId, ownerAccount }: PolicyNamedInsuredAccountsProps) {
  const [selectedAccount, setSelectedAccount] = useState<CustomerSearchResult | null>(null);
  const [removeAccount, setRemoveAccount] = useState<NamedInsuredAccount | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isStaff } = usePermissions();
  const queryKey = ['policy-named-insureds', policyId];

  const { data: linkedAccounts = [], isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_policy_named_insureds', { p_policy_id: policyId });
      if (error) throw error;
      return data as NamedInsuredAccount[];
    },
    enabled: isStaff,
  });

  const addNamedInsured = useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase.rpc('add_policy_named_insured', {
        p_policy_id: policyId,
        p_account_id: accountId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setSelectedAccount(null);
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Named Insured account added' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not add Named Insured account', description: error.message, variant: 'destructive' });
    },
  });

  const removeNamedInsured = useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase.rpc('remove_policy_named_insured', {
        p_policy_id: policyId,
        p_account_id: accountId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setRemoveAccount(null);
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Named Insured account removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove Named Insured account', description: error.message, variant: 'destructive' });
    },
  });

  const excludedAccountIds = useMemo(
    () => [ownerAccount.id, ...linkedAccounts.map((account) => account.account_id)],
    [linkedAccounts, ownerAccount.id],
  );

  useEffect(() => {
    if (selectedAccount && excludedAccountIds.includes(selectedAccount.id)) {
      setSelectedAccount(null);
    }
  }, [excludedAccountIds, selectedAccount]);

  if (!isStaff) return null;

  const pickerUnavailable = isLoading || isError;

  return (
    <section aria-labelledby="named-insured-accounts-heading" className="space-y-3 border-t pt-4">
      <div>
        <h3 id="named-insured-accounts-heading" className="text-sm font-semibold">Named Insured accounts</h3>
        <p className="text-sm text-muted-foreground">Accounts that share this policy record.</p>
      </div>

      <div className="divide-y rounded-md border">
        <div className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
          <Link to={`/customers/${ownerAccount.id}`} className="font-medium underline-offset-2 hover:underline">
            {ownerAccount.name}
          </Link>
          <Badge variant="secondary">Primary</Badge>
        </div>
        {!isLoading && linkedAccounts.map((account) => (
          <div key={account.account_id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
            <Link to={`/customers/${account.account_id}`} className="font-medium underline-offset-2 hover:underline">
              {account.name}
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${account.name}`}
              onClick={() => setRemoveAccount(account)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {isLoading && (
          <div aria-label="Loading Named Insured accounts" className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        )}
      </div>

      {isError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-destructive px-3 py-2 text-sm">
          <span>Could not load linked accounts. {error instanceof Error ? error.message : 'Try again.'}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <CustomerSearchSelect
            value={selectedAccount}
            onChange={setSelectedAccount}
            agencyWorkspaceId={ownerAccount.agency_workspace_id}
            excludedAccountIds={excludedAccountIds}
            disabled={pickerUnavailable || addNamedInsured.isPending}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={pickerUnavailable || !selectedAccount || addNamedInsured.isPending}
          onClick={() => selectedAccount && addNamedInsured.mutate(selectedAccount.id)}
        >
          {addNamedInsured.isPending ? 'Adding...' : 'Add account'}
        </Button>
      </div>

      <AlertDialog open={!!removeAccount} onOpenChange={(open) => !open && setRemoveAccount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeAccount?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the company from this policy only. It does not remove the company from the relationship graph. The CRM graph is untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeNamedInsured.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeNamedInsured.isPending}
              onClick={() => removeAccount && removeNamedInsured.mutate(removeAccount.account_id)}
            >
              {removeNamedInsured.isPending ? 'Removing...' : 'Remove account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
