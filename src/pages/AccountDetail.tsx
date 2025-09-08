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
import { useAuth } from '@/hooks/useAuth';
import { format, isAfter, isBefore, addDays } from 'date-fns';
import { addToRecentlyAccessed, updateRecentlyAccessedAccount } from '@/components/crm/RecentlyAccessed';
import type { AccountWithDetails, Contact, Policy, Claim, CallSession, SMSMessage } from '@/types/crm-enhanced';

export default function AccountDetail() {
  const { accountId } = useParams<{ accountId: string }>();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { fetchAccountDetails, updateAccount } = useCRMData();
  
  const [account, setAccount] = useState<AccountWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    const loadAccount = async () => {
      if (!accountId) return;
      
      setLoading(true);
      try {
        const accountData = await fetchAccountDetails(accountId);
        if (accountData) {
          // Track this account as recently accessed
          addToRecentlyAccessed({
            id: accountData.id,
            name: accountData.name,
            type: 'account',
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

  const handleEditAccount = async (data: any) => {
    if (!account) return;
    
    setFormLoading(true);
    try {
      // Transform form data with proper type mapping
      const changes = {
        name: data.name,
        phone: data.phone,
        email: data.email,
        address_line1: data.address_line1,
        address_line2: data.address_line2,
        city: data.city,
        state: data.state,
        zip_code: data.zip_code,
        tin_last4: data.tin_last4,
        source: data.source,
        // Send both type fields for proper mapping
        type: data.type,
        account_type: data.account_type,
      };

      const updatedAccount = await updateAccount(account.id, changes);
      
      // Refresh the detail view with fresh data
      const refreshedAccount = await fetchAccountDetails(account.id);
      if (refreshedAccount) {
        setAccount(refreshedAccount);
        
        // Update Recently Viewed with fresh data
        updateRecentlyAccessedAccount(refreshedAccount);
      }
      
      setShowEditForm(false);
    } catch (error) {
      console.error('Failed to update account:', error);
    } finally {
      setFormLoading(false);
    }
  };

  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
        <div className="flex-1 space-y-6 p-4 md:p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-64 bg-muted rounded"></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="h-32 bg-muted rounded"></div>
              <div className="h-32 bg-muted rounded"></div>
              <div className="h-32 bg-muted rounded"></div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !account) {
    return (
      <AppLayout>
        <div className="flex-1 space-y-6 p-4 md:p-8">
          <div className="flex items-center space-x-4">
            <Button variant="outline" size="sm" asChild>
              <Link to="/crm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to CRM
              </Link>
            </Button>
          </div>
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="text-center">
                <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Account Not Found</h3>
                <p className="text-muted-foreground">
                  {error || "The account you're looking for doesn't exist or you don't have permission to view it."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // Calculate key metrics
  const activePolicies = account.policies?.filter(p => p.status === 'active') || [];
  const openClaims = account.claims?.filter(c => c.status === 'open') || [];
  const renewalsDue = activePolicies.filter(p => 
    isAfter(addDays(new Date(), 30), new Date(p.expiration_date))
  );
  const totalPremium = activePolicies.reduce((sum, p) => sum + (p.premium || 0), 0);

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="outline" size="sm" asChild>
              <Link to="/crm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to CRM
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{account.name}</h1>
              <div className="flex items-center space-x-2 mt-1">
                {account.account_type === 'business' ? (
                  <Building2 className="h-4 w-4 text-primary" />
                ) : (
                  <Users className="h-4 w-4 text-primary" />
                )}
                <Badge variant="outline" className="capitalize">
                  {account.account_type}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Customer since {format(new Date(account.created_at), 'MMM yyyy')}
                </span>
              </div>
            </div>
          </div>
          <Button onClick={() => {
            console.log('AccountDetail: Edit button clicked');
            setShowEditForm(true);
          }}>
            <Edit className="h-4 w-4 mr-2" />
            Edit Account
          </Button>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Policies</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activePolicies.length}</div>
              <p className="text-xs text-muted-foreground">
                ${totalPremium.toLocaleString()} total premium
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Claims</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{openClaims.length}</div>
              <p className="text-xs text-muted-foreground">
                Active insurance claims
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Renewals Due</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{renewalsDue.length}</div>
              <p className="text-xs text-muted-foreground">
                Next 30 days
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Contacts</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{account.contacts?.length || 0}</div>
              <p className="text-xs text-muted-foreground">
                Associated people
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                {account.phone && (
                  <div className="flex items-center space-x-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{account.phone}</span>
                  </div>
                )}
                {account.email && (
                  <div className="flex items-center space-x-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{account.email}</span>
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
    <div className="grid gap-4 md:grid-cols-2">
      {contacts.map((contact) => (
        <Card key={contact.id}>
          <CardHeader>
            <CardTitle className="text-lg">
              {contact.first_name} {contact.last_name}
            </CardTitle>
            {contact.role && (
              <Badge variant="outline" className="w-fit capitalize">
                {contact.role}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {contact.email && (
              <div className="flex items-center space-x-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{contact.email}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center space-x-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{contact.phone}</span>
              </div>
            )}
            <div className="flex space-x-2 pt-2">
              <Badge variant={contact.consent_sms ? 'default' : 'secondary'}>
                SMS: {contact.consent_sms ? 'Allowed' : 'Denied'}
              </Badge>
              <Badge variant={contact.consent_voice ? 'default' : 'secondary'}>
                Voice: {contact.consent_voice ? 'Allowed' : 'Denied'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PoliciesTab({ policies }: { policies: Policy[] }) {
  if (policies.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Policies</h3>
            <p className="text-muted-foreground mb-4">
              Add insurance policies to this account.
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
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">{policy.policy_number}</CardTitle>
                <CardDescription>{policy.line_of_business}</CardDescription>
              </div>
              <Badge variant={policy.status === 'active' ? 'default' : 'secondary'}>
                {policy.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-3">
              <div>
                <p className="text-sm font-medium">Carrier</p>
                <p className="text-sm text-muted-foreground">
                  {policy.carrier || 'Unknown'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">Premium</p>
                <p className="text-sm text-muted-foreground">
                  ${policy.premium?.toLocaleString() || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">Expires</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(policy.expiration_date), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ClaimsTab({ claims }: { claims: Claim[] }) {
  if (claims.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Claims</h3>
            <p className="text-muted-foreground">
              No insurance claims have been filed for this account.
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
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">{claim.claim_number}</CardTitle>
                <CardDescription>{claim.description}</CardDescription>
              </div>
              <Badge variant={claim.status === 'open' ? 'destructive' : 'default'}>
                {claim.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-3">
              <div>
                <p className="text-sm font-medium">Loss Date</p>
                <p className="text-sm text-muted-foreground">
                  {claim.loss_date ? format(new Date(claim.loss_date), 'MMM d, yyyy') : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">Estimate</p>
                <p className="text-sm text-muted-foreground">
                  ${claim.amount_estimate?.toLocaleString() || 'Pending'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">Filed</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(claim.created_at), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CommunicationsTab({ calls, messages }: { calls: CallSession[]; messages: SMSMessage[] }) {
  const allCommunications = [
    ...calls.map(call => ({ ...call, type: 'call' as const, timestamp: call.started_at })),
    ...messages.map(msg => ({ ...msg, type: 'sms' as const, timestamp: msg.created_at }))
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (allCommunications.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Communications</h3>
            <p className="text-muted-foreground">
              No calls or messages have been exchanged with this account.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {allCommunications.map((comm, index) => (
        <Card key={`${comm.type}-${comm.id}`}>
          <CardContent className="pt-4">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                {comm.type === 'call' ? (
                  <Phone className="h-4 w-4 text-primary" />
                ) : (
                  <MessageSquare className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">
                    {comm.type === 'call' ? 'Phone Call' : 'SMS Message'}
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(comm.timestamp), 'MMM d, h:mm a')}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {comm.type === 'call' 
                    ? `${comm.from_number} → ${comm.to_number}${(comm as CallSession).duration_seconds ? ` (${Math.round((comm as CallSession).duration_seconds / 60)}m)` : ''}`
                    : `${(comm as SMSMessage).direction === 'in' ? 'Received' : 'Sent'}: ${(comm as SMSMessage).body || 'No content'}`
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}