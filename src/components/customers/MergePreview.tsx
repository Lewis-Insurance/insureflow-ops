import { Check, Building2, Home, FileText, ListTodo, Phone, Mail, Calendar, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AccountWithCounts, useAccountWithCounts } from '@/hooks/useCustomerMerge';
import { formatDistanceToNow } from 'date-fns';
import { humanizeStatus } from '@/lib/format';

interface MergePreviewProps {
  accountId1: string | null;
  accountId2: string | null;
  masterId: string | null;
  onSelectMaster: (accountId: string) => void;
}

function AccountCard({
  account,
  isLoading,
  isMaster,
  onSelect,
}: {
  account: AccountWithCounts | null | undefined;
  isLoading: boolean;
  isMaster: boolean;
  onSelect: () => void;
}) {
  if (isLoading) {
    return (
      <Card className="flex-1">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="grid grid-cols-2 gap-4 pt-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!account) {
    return (
      <Card className="flex-1 border-dashed">
        <CardContent className="py-16 text-center text-muted-foreground">
          Select a customer above
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'flex-1 cursor-pointer transition-all',
        isMaster
          ? 'ring-2 ring-green-500 bg-green-50/50 dark:bg-green-950/20'
          : 'hover:ring-2 hover:ring-muted-foreground/20'
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {account.type === 'commercial_business' ? (
              <Building2 className="h-5 w-5 text-blue-500" />
            ) : (
              <Home className="h-5 w-5 text-green-500" />
            )}
            <CardTitle className="text-lg">{account.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {isMaster && (
              <Badge className="bg-green-600 text-white">
                <Check className="h-3 w-3 mr-1" />
                Master
              </Badge>
            )}
            <div
              className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                isMaster
                  ? 'border-green-500 bg-green-500'
                  : 'border-muted-foreground/40'
              )}
            >
              {isMaster && <Check className="h-3 w-3 text-white" />}
            </div>
          </div>
        </div>
        <Badge variant="outline" className="w-fit">
          {account.type === 'commercial_business' ? 'Business' : 'Household'}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Contact Info */}
        <div className="space-y-2 text-sm">
          {account.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>{account.email}</span>
            </div>
          )}
          {account.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4" />
              <span>{account.phone}</span>
            </div>
          )}
          {(account.address_line1 || account.city) && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>
                {[account.address_line1, account.city, account.state, account.zip_code]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Created {formatDistanceToNow(new Date(account.created_at), { addSuffix: true })}</span>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <Badge
            variant={account.account_status === 'active' ? 'default' : 'secondary'}
          >
            {humanizeStatus(account.account_status) || 'Unknown'}
          </Badge>
        </div>

        {/* Related Data Counts */}
        <div className="grid grid-cols-2 gap-3 pt-4 border-t">
          <CountCard
            label="Policies"
            count={account.policiesCount}
            detail={`${account.activePoliciesCount} active`}
            icon={FileText}
          />
          <CountCard
            label="Quotes"
            count={account.quotesCount}
            icon={FileText}
          />
          <CountCard
            label="Documents"
            count={account.documentsCount}
            icon={FileText}
          />
          <CountCard
            label="Tasks"
            count={account.tasksCount}
            detail={`${account.openTasksCount} open`}
            icon={ListTodo}
          />
          <CountCard
            label="Communications"
            count={account.communicationsCount}
            icon={Phone}
            className="col-span-2"
          />
        </div>

        {/* Notes Preview */}
        {account.notes && (
          <div className="pt-4 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
            <p className="text-sm line-clamp-2">{account.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CountCard({
  label,
  count,
  detail,
  icon: Icon,
  className,
}: {
  label: string;
  count: number;
  detail?: string;
  icon: React.ElementType;
  className?: string;
}) {
  return (
    <div className={cn('bg-muted/50 rounded-lg p-3', className)}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-semibold">{count}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function MergePreview({
  accountId1,
  accountId2,
  masterId,
  onSelectMaster,
}: MergePreviewProps) {
  const { data: account1, isLoading: loading1 } = useAccountWithCounts(accountId1);
  const { data: account2, isLoading: loading2 } = useAccountWithCounts(accountId2);

  return (
    <div className="space-y-4">
      <div className="text-center text-sm text-muted-foreground">
        Click on a customer card to select it as the <strong>master</strong> (surviving) record.
        All data from the other customer will be merged into the master.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AccountCard
          account={account1}
          isLoading={loading1}
          isMaster={masterId === accountId1}
          onSelect={() => accountId1 && onSelectMaster(accountId1)}
        />
        <AccountCard
          account={account2}
          isLoading={loading2}
          isMaster={masterId === accountId2}
          onSelect={() => accountId2 && onSelectMaster(accountId2)}
        />
      </div>
    </div>
  );
}

// Summary of what will be transferred
export function MergeSummary({
  masterId,
  mergedId,
}: {
  masterId: string | null;
  mergedId: string | null;
}) {
  const { data: masterAccount } = useAccountWithCounts(masterId);
  const { data: mergedAccount } = useAccountWithCounts(mergedId);

  if (!masterAccount || !mergedAccount) {
    return null;
  }

  return (
    <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Merge Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <strong>Master:</strong> {masterAccount.name}
        </div>
        <div className="border-l-2 border-amber-400 pl-3 space-y-1">
          <p className="font-medium">Will be transferred from {mergedAccount.name}:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
            {mergedAccount.policiesCount > 0 && (
              <li>{mergedAccount.policiesCount} policies</li>
            )}
            {mergedAccount.quotesCount > 0 && (
              <li>{mergedAccount.quotesCount} quotes</li>
            )}
            {mergedAccount.documentsCount > 0 && (
              <li>{mergedAccount.documentsCount} documents</li>
            )}
            {mergedAccount.tasksCount > 0 && (
              <li>{mergedAccount.tasksCount} tasks</li>
            )}
            {mergedAccount.communicationsCount > 0 && (
              <li>{mergedAccount.communicationsCount} communications</li>
            )}
            {mergedAccount.notes && <li>Notes will be appended</li>}
            {mergedAccount.policiesCount === 0 &&
              mergedAccount.quotesCount === 0 &&
              mergedAccount.documentsCount === 0 &&
              mergedAccount.tasksCount === 0 &&
              mergedAccount.communicationsCount === 0 &&
              !mergedAccount.notes && (
                <li className="text-muted-foreground">No related data to transfer</li>
              )}
          </ul>
        </div>
        <div className="pt-2 border-t border-amber-200 text-amber-800 dark:text-amber-200">
          <strong>{mergedAccount.name}</strong> will be archived after the merge.
        </div>
      </CardContent>
    </Card>
  );
}
