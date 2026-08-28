import { Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { usePortalPolicies } from '@/hooks/usePortalPolicies';
import { formatLocalDateDisplay } from '@/lib/date/localDate';

export function PortalPolicies({ accountId }: { accountId: string }) {
  const { data: policies = [], isLoading, error } = usePortalPolicies(accountId);

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-destructive">
          <p className="font-medium">Policies could not be loaded</p>
          <p className="mt-1 text-sm text-muted-foreground">Contact your agency if this continues.</p>
        </CardContent>
      </Card>
    );
  }

  if (policies.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <Shield className="mx-auto mb-4 h-10 w-10 opacity-50" />
          <p>No policies are available for this account. Contact your agency if you need help.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {policies.map((policy) => (
        <Card key={policy.policy_id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">{policy.line_of_business || 'Insurance policy'}</p>
              <p className="font-mono text-sm text-muted-foreground">{policy.policy_number}</p>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>{policy.carrier_name}</p>
              {policy.expiration_date && <p>Expires {formatLocalDateDisplay(policy.expiration_date)}</p>}
            </div>
            <Badge variant="secondary">{policy.policy_status || 'Status unavailable'}</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
