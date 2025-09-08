import { useState, useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
// import { QuickActions } from '@/components/crm/QuickActions';
import { ConsentEvidence } from '@/components/crm/ConsentEvidence';
import { AccountForm } from '@/components/crm/AccountForm';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  Building2, 
  Users, 
  Phone, 
  Mail, 
  MapPin, 
  Edit,
  Plus,
  Calendar,
  DollarSign,
  AlertTriangle,
  FileText,
  MessageSquare,
  Shield
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ActivityTimeline } from '@/components/crm/ActivityTimeline';
import { MembershipManager } from '@/components/crm/MembershipManager';
import { useCRMData } from '@/hooks/useCRMData';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { updateRecentlyAccessedAccount } from '@/components/crm/RecentlyAccessed';
import type { AccountWithDetails, Contact } from '@/types/crm-enhanced';

// Type utilities
type TypePayload = {
  type?: 'business' | 'household';
  account_type?: 'business' | 'individual';
  accountCategory?: 'business' | 'household'; // form field alias
  [k: string]: any;
};

function normalizeTypeForRPC(input: TypePayload): TypePayload {
  const out = { ...input };
  
  // Map any UI aliases to canonical keys FIRST
  if (out.accountCategory && !out.type && !out.account_type) {
    out.type = out.accountCategory; // 'business' | 'household'
  }
  
  // Derive the pair (RPC will also map, but sending both is safest)
  if (out.type && !out.account_type) {
    out.account_type = out.type === 'business' ? 'business' : 'individual';
  }
  if (out.account_type && !out.type) {
    out.type = out.account_type === 'business' ? 'business' : 'household';
  }
  return out;
}

export function AccountDetail() {
  const { toast } = useToast();
  const params = useParams();
  
  // Accept either :id or :accountId (works with both route shapes)
  const rawId = String(params.id ?? params.accountId ?? '').trim();
  // Strip ?query or #hash if present
  const accountId = rawId.split(/[?#]/)[0];
  
  // Only soft-check; don't block the page if it doesn't "look" like a UUID
  const hasCandidateId = accountId.length > 0;

  const { isAuthenticated, loading: authLoading } = useAuth();
  const { fetchAccountDetails, fetchAccounts } = useCRMData();
  
  const [account, setAccount] = useState<AccountWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  // Show soft warning if no candidate ID, but don't block the page
  if (!hasCandidateId) {
    return (
      <AppLayout>
        <Card className="p-6">
          <CardContent>
            <p className="text-muted-foreground">No account ID provided in URL</p>
            <Button asChild className="mt-4">
              <Link to="/crm">Back to CRM</Link>
            </Button>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  useEffect(() => {
    const loadAccount = async () => {
      if (!accountId || !isAuthenticated) return;
      
      try {
        setLoading(true);
        setError(null);
        
        const accountData = await fetchAccountDetails(accountId);
        if (accountData) {
          // Update Recently Accessed when viewing
          updateRecentlyAccessedAccount({
            id: accountData.id,
            accountType: accountData.account_type || accountData.type,
            email: accountData.email || undefined,
            phone: accountData.phone || undefined
          });
          setAccount(accountData);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated && accountId) {
      loadAccount();
    }
  }, [accountId, isAuthenticated, fetchAccountDetails]);

  const handleEditAccount = async (formValues: any) => {
    setFormLoading(true);
    try {
      if (!hasCandidateId) throw new Error('No account id');

      const account_data = normalizeTypeForRPC(formValues);

      // Debug logging
      console.debug('Saving account', { accountId, account_data });

      const { data, error } = await supabase.rpc('update_account_secure', {
        account_id: accountId,
        account_data,
      });

      if (error) throw error;

      // Update local state
      setAccount(data as AccountWithDetails);

      // Refresh accounts list to ensure consistency
      await fetchAccounts();

      // Keep Recently Viewed in sync
      updateRecentlyAccessedAccount({
        id: (data as any).id,
        name: (data as any).name,
        email: (data as any).email,
        phone: (data as any).phone,
        account_type: (data as any).account_type,
        type: (data as any).type,
        updated_at: (data as any).updated_at
      });

      setShowEditForm(false);
      
      toast({ 
        title: 'Saved', 
        description: 'Account updated successfully.' 
      });
    } catch (e: any) {
      toast({ 
        title: 'Error saving', 
        description: e.message ?? String(e), 
        variant: 'destructive' 
      });
    } finally {
      setFormLoading(false);
    }
  };

  // Realtime subscription to keep UI in sync
  useEffect(() => {
    const ch = supabase
      .channel('realtime:accounts')
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'accounts' },
        (payload) => {
          const row = payload.new as any;
          if (row.id === accountId) {
            setAccount(row);
          }
          updateRecentlyAccessedAccount(row);
        }
      ).subscribe();
    
    return () => { 
      supabase.removeChannel(ch); 
    };
  }, [accountId]);

  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading account...</div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <Card className="p-6">
          <CardContent>
            <p className="text-destructive">{error}</p>
            <Button asChild className="mt-4">
              <Link to="/crm">Back to CRM</Link>
            </Button>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  if (!account) {
    return (
      <AppLayout>
        <Card className="p-6">
          <CardContent>
            <p>Account not found</p>
            <Button asChild className="mt-4">
              <Link to="/crm">Back to CRM</Link>
            </Button>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  // Calculate active policies for display
  const activePolicies = account.policies?.filter(p => p.status === 'active') || [];

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/crm" className="flex items-center">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to CRM
              </Link>
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div>
              <h1 className="text-3xl font-bold">{account.name}</h1>
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant={account.type === 'business' ? 'default' : 'secondary'}>
                  {account.type === 'business' ? (
                    <>
                      <Building2 className="h-3 w-3 mr-1" />
                      Business
                    </>
                  ) : (
                    <>
                      <Users className="h-3 w-3 mr-1" />
                      Household
                    </>
                  )}
                </Badge>
                <Badge variant="outline">
                  {activePolicies.length} Active Policies
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditForm(true)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit Account
            </Button>
          </div>
        </div>

        {/* Quick Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>Account Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                {account.phone && (
                  <div className="flex items-center space-x-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{account.phone}</span>
                  </div>
                )}
              </div>
              <div>
                {account.email && (
                  <div className="flex items-center space-x-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{account.email}</span>
                  </div>
                )}
              </div>
              <div>
                {(account.address_line1 || account.city || account.state) && (
                  <div className="flex items-start space-x-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="text-sm">
                      {account.address_line1 && <div>{account.address_line1}</div>}
                      {account.address_line2 && <div>{account.address_line2}</div>}
                      {(account.city || account.state || account.zip_code) && (
                        <div>
                          {[account.city, account.state, account.zip_code].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Information Tabs */}
        <Tabs defaultValue="timeline" className="space-y-4">
          <TabsList>
            <TabsTrigger value="timeline">Activity Timeline</TabsTrigger>
            <TabsTrigger value="contacts">Contacts ({account.contacts?.length || 0})</TabsTrigger>
            <TabsTrigger value="policies">Policies ({activePolicies.length})</TabsTrigger>
            <TabsTrigger value="claims">Claims ({account.claims?.length || 0})</TabsTrigger>
            <TabsTrigger value="communications">Communications</TabsTrigger>
            <TabsTrigger value="access">Access Management</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="space-y-4">
            <div className="space-y-6">
              <ActivityTimeline
                events={account.events}
                calls={account.calls}
                messages={account.messages}
                tasks={account.tasks}
              />
            </div>
          </TabsContent>

          <TabsContent value="contacts" className="space-y-4">
            <ContactsTab contacts={account.contacts || []} accountId={account.id} />
          </TabsContent>

          <TabsContent value="policies" className="space-y-4">
            <PoliciesTab policies={account.policies || []} />
          </TabsContent>

          <TabsContent value="claims" className="space-y-4">
            <ClaimsTab claims={account.claims || []} />
          </TabsContent>

          <TabsContent value="communications" className="space-y-4">
            <CommunicationsTab 
              calls={account.calls || []}
              messages={account.messages || []}
            />
          </TabsContent>

          <TabsContent value="access" className="space-y-4">
            <MembershipManager 
              accountId={account.id}
              accountName={account.name}
            />
          </TabsContent>
        </Tabs>

        {/* Account Edit Form Dialog */}
        <AccountForm
          open={showEditForm}
          onOpenChange={setShowEditForm}
          onSubmit={handleEditAccount}
          account={account as any}
          loading={formLoading}
        />
      </div>
    </AppLayout>
  );
}

// Sub-components for tabs
function ContactsTab({ contacts, accountId }: { contacts: Contact[]; accountId: string }) {
  if (contacts.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Contacts</h3>
            <p className="text-muted-foreground mb-4">
              Add contacts to this account to manage relationships.
            </p>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {contacts.map((contact) => (
        <Card key={contact.id}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">
                  {contact.first_name} {contact.last_name}
                </h3>
                {contact.role && (
                  <p className="text-sm text-muted-foreground">{contact.role}</p>
                )}
                <div className="mt-2 space-y-1">
                  {contact.email && (
                    <div className="flex items-center space-x-2 text-sm">
                      <Mail className="h-3 w-3" />
                      <span>{contact.email}</span>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center space-x-2 text-sm">
                      <Phone className="h-3 w-3" />
                      <span>{contact.phone}</span>
                    </div>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm">
                <Edit className="h-3 w-3 mr-1" />
                Edit
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PoliciesTab({ policies }: { policies: any[] }) {
  if (policies.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Policies</h3>
            <p className="text-muted-foreground mb-4">
              This account doesn't have any policies yet.
            </p>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Policy
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {policies.map((policy) => (
        <Card key={policy.id}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{policy.policy_number}</h3>
                <p className="text-sm text-muted-foreground">{policy.line_of_business}</p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center space-x-2 text-sm">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {new Date(policy.effective_date).toLocaleDateString()} - {new Date(policy.expiration_date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm">
                    <DollarSign className="h-3 w-3" />
                    <span>${policy.premium}</span>
                  </div>
                </div>
              </div>
              <Badge variant={policy.status === 'active' ? 'default' : 'secondary'}>
                {policy.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ClaimsTab({ claims }: { claims: any[] }) {
  if (claims.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Claims</h3>
            <p className="text-muted-foreground mb-4">
              This account doesn't have any claims.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {claims.map((claim) => (
        <Card key={claim.id}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{claim.claim_number}</h3>
                <p className="text-sm text-muted-foreground">{claim.description}</p>
                <div className="mt-2 space-y-1">
                  {claim.loss_date && (
                    <div className="flex items-center space-x-2 text-sm">
                      <Calendar className="h-3 w-3" />
                      <span>Loss Date: {new Date(claim.loss_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  {claim.amount_estimate && (
                    <div className="flex items-center space-x-2 text-sm">
                      <DollarSign className="h-3 w-3" />
                      <span>Estimate: ${claim.amount_estimate}</span>
                    </div>
                  )}
                </div>
              </div>
              <Badge variant={claim.status === 'open' ? 'destructive' : 'default'}>
                {claim.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CommunicationsTab({ calls, messages }: { calls: any[]; messages: any[] }) {
  const allCommunications = [
    ...calls.map(call => ({ ...call, type: 'call' })),
    ...messages.map(msg => ({ ...msg, type: 'sms' }))
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (allCommunications.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Communications</h3>
            <p className="text-muted-foreground mb-4">
              No calls or messages recorded for this account.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {allCommunications.map((comm) => (
        <Card key={comm.id}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  {comm.type === 'call' ? (
                    <Phone className="h-4 w-4" />
                  ) : (
                    <MessageSquare className="h-4 w-4" />
                  )}
                  <h3 className="font-semibold">
                    {comm.type === 'call' ? 'Phone Call' : 'SMS Message'}
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {comm.type === 'call' 
                    ? `${comm.from_number} → ${comm.to_number}`
                    : comm.message_body || 'SMS message'
                  }
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(comm.created_at).toLocaleString()}
                </p>
              </div>
              <Badge variant="outline">
                {comm.type === 'call' ? comm.disposition || 'Call' : 'SMS'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
