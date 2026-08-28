import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { UserPlus, Loader2, Check, AlertCircle } from 'lucide-react';
import { logger } from '@/lib/logger';

interface InviteToPortalButtonProps {
  accountId: string;
  accountName: string;
  defaultEmail?: string;
  defaultFirstName?: string;
  defaultLastName?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

interface PortalInviteClusterRow {
  account_id: string;
  name: string;
  node_role: string | null;
  is_business: boolean;
  default_selected: boolean;
}

const groupForRole = (row: PortalInviteClusterRow): 'Parent' | 'Sites' | 'Other' => {
  if (row.node_role === 'parent_company') return 'Parent';
  if (
    row.is_business &&
    ['owned_business', 'affiliated_business', 'owns'].includes(row.node_role ?? '')
  ) {
    return 'Sites';
  }
  return 'Other';
};

export function InviteToPortalButton({
  accountId,
  accountName,
  defaultEmail = '',
  defaultFirstName = '',
  defaultLastName = '',
  variant = 'outline',
  size = 'default',
}: InviteToPortalButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clusterLoading, setClusterLoading] = useState(false);
  const [clusterError, setClusterError] = useState<string | null>(null);
  const [cluster, setCluster] = useState<PortalInviteClusterRow[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(
    () => new Set([accountId]),
  );
  const [email, setEmail] = useState(defaultEmail);
  const [firstName, setFirstName] = useState(defaultFirstName);
  const [lastName, setLastName] = useState(defaultLastName);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const loadCluster = async () => {
      setClusterLoading(true);
      setClusterError(null);

      const { data, error } = await supabase.rpc('list_portal_invite_cluster', {
        p_account_id: accountId,
      });
      if (cancelled) return;

      if (error) {
        setCluster([]);
        setSelectedAccountIds(new Set([accountId]));
        setClusterError('Account access could not be loaded. Close the dialog and try again.');
      } else {
        const visibleRows = ((data ?? []) as PortalInviteClusterRow[]).filter(
          (row) => row.node_role !== 'same_as',
        );
        if (!visibleRows.some((row) => row.account_id === accountId)) {
          setCluster([]);
          setSelectedAccountIds(new Set([accountId]));
          setClusterError('Invite-from account is missing from the validated account access.');
        } else {
          setCluster(visibleRows);
          setSelectedAccountIds(
            new Set([
              accountId,
              ...visibleRows.filter((row) => row.default_selected).map((row) => row.account_id),
            ]),
          );
        }
      }
      setClusterLoading(false);
    };

    void loadCluster();
    return () => {
      cancelled = true;
    };
  }, [open, accountId, accountName]);

  const toggleAccount = (accountIdToToggle: string, checked: boolean) => {
    if (accountIdToToggle === accountId) return;
    setSelectedAccountIds((current) => {
      const next = new Set(current);
      if (checked) next.add(accountIdToToggle);
      else next.delete(accountIdToToggle);
      next.add(accountId);
      return next;
    });
  };

  const handleSendInvitation = async () => {
    if (!email) {
      toast({
        title: 'Email required',
        description: 'Please enter an email address.',
        variant: 'destructive',
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('portal-send-invitation', {
        body: {
          account_id: accountId,
          account_ids: Array.from(new Set([accountId, ...selectedAccountIds])),
          email: email.toLowerCase().trim(),
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
        },
      });

      if (error) {
        throw error;
      }

      if (data.existing_user) {
        toast({
          title: 'Already has access',
          description: data.message,
          variant: 'default',
        });
      } else if (data.success) {
        toast({
          title: 'Invitation sent',
          description: data.message,
        });
        setOpen(false);
        // Reset form
        setEmail(defaultEmail);
        setFirstName(defaultFirstName);
        setLastName(defaultLastName);
      } else {
        throw new Error(data.error || 'Failed to send invitation');
      }
    } catch (error) {
      logger.error('Invitation error:', error);
      toast({
        title: 'Failed to send invitation',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <UserPlus className="h-4 w-4 mr-2" />
          Invite to Portal
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite to Customer Portal
          </DialogTitle>
          <DialogDescription>
            Send a portal invitation to <strong>{accountName}</strong>. They'll receive an email
            with a secure link to access their policies and documents.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <fieldset className="grid gap-3" disabled={clusterLoading || loading}>
            <legend className="text-sm font-medium text-foreground">Portal account access</legend>
            <p className="text-sm text-muted-foreground">
              Choose the accounts this portal login can access.
            </p>
            {clusterLoading ? (
              <div aria-label="Loading account access" className="grid gap-2">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-11 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
                  />
                ))}
              </div>
            ) : clusterError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{clusterError}</span>
              </div>
            ) : (
              <div className="max-h-56 space-y-4 overflow-y-auto rounded-md border p-3">
                {(['Parent', 'Sites', 'Other'] as const).map((group) => {
                  const rows = cluster.filter((row) => groupForRole(row) === group);
                  if (rows.length === 0) return null;
                  return (
                    <div key={group} className="grid gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group}
                      </p>
                      {rows.map((row) => {
                        const isHome = row.account_id === accountId;
                        const checkboxId = `portal-account-${row.account_id}`;
                        return (
                          <div key={row.account_id} className="flex min-h-11 items-center gap-3">
                            <Checkbox
                              id={checkboxId}
                              checked={isHome || selectedAccountIds.has(row.account_id)}
                              disabled={isHome || loading}
                              onCheckedChange={(checked) =>
                                toggleAccount(row.account_id, checked === true)
                              }
                            />
                            <Label htmlFor={checkboxId} className="min-w-0 flex-1 leading-5">
                              {row.name}
                              {isHome ? (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                  Invite from account
                                </span>
                              ) : null}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>
          <div className="grid gap-2">
            <Label htmlFor="email">Email address *</Label>
            <Input
              id="email"
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                placeholder="Doe"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </div>

        <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p>The customer will receive a magic link email. No password is required.</p>
              <p className="mt-1">The invitation expires in 30 days.</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSendInvitation} disabled={loading || clusterLoading || !!clusterError}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Send Invitation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
