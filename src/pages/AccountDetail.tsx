import { useMemo, useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { updateRecentlyAccessedAccount } from '@/components/crm/RecentlyAccessed';
import { AccountForm } from '@/components/crm/AccountForm';
import { AppLayout } from '@/components/layout/AppLayout';
import { QuoteRankingDashboard } from '@/components/quotes/QuoteRankingDashboard';
import { ClientIntelligencePanel } from '@/components/client/ClientIntelligencePanel';
import { DocumentsList } from '@/components/documents/DocumentsList';
import { DocumentCollectionBoard } from '@/components/documents/DocumentCollectionBoard';
import { UploadDocModal } from '@/components/customers/UploadDocModal';
import { Brain, FileText, Inbox } from 'lucide-react';
import { FloorIdCardRequestButton } from '@/components/floor/FloorIdCardRequestButton';

function normalizeTypeForRPC(v: any) {
  const out: any = { ...v };
  if (out.accountCategory && !out.type && !out.account_type) out.type = out.accountCategory; // alias
  if (out.type && !out.account_type) out.account_type = out.type === 'business' ? 'business' : 'individual';
  if (out.account_type && !out.type) out.type = out.account_type === 'business' ? 'business' : 'household';
  return out;
}

export default function AccountDetail() {
  const params = useParams();
  const rawId = String(params.id ?? params.accountId ?? '').trim();
  const accountId = useMemo(() => rawId.split(/[?#]/)[0], [rawId]);
  const { toast } = useToast();
  const navigate = useNavigate();

  const [account, setAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [uploadDocOpen, setUploadDocOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Authentication required');
      if (!accountId) throw new Error('Missing account id');

      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Account not found');
      setAccount(data);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message ?? String(e), variant: 'destructive' });
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [accountId, toast]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave(formValues: any) {
    try {
      if (!accountId) throw new Error('Missing account id');
      setSaving(true);

      const account_data = normalizeTypeForRPC(formValues);
      const { data, error } = await supabase.rpc('update_account_secure', {
        account_id: accountId,
        account_data,
      });
      if (error) throw error;

      setAccount(data);
      const accountData = data;
      updateRecentlyAccessedAccount({
        id: accountData.id,
        name: accountData.name,
        email: accountData.email || undefined,
        phone: accountData.phone || undefined,
        account_type: accountData.account_type,
        type: accountData.type,
        updated_at: accountData.updated_at
      });
      toast({ title: 'Saved', description: 'Account updated.' });
      setShowEditForm(false);
    } catch (e: any) {
      toast({ title: 'Error saving', description: e.message ?? String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Card className="p-6"><CardHeader><CardTitle>Loading…</CardTitle></CardHeader></Card>;
  if (!account) return <Card className="p-6"><CardHeader><CardTitle>Account not found</CardTitle></CardHeader><CardContent><Button asChild variant="outline"><Link to="/crm/accounts">Back</Link></Button></CardContent></Card>;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">{account.name}</h1>
            <p className="text-muted-foreground">{account.account_type} account</p>
          </div>
          <Button onClick={() => setShowEditForm(true)}>Edit Account</Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="collection" className="gap-1.5">
              <Inbox className="h-4 w-4" />
              Doc Collection
            </TabsTrigger>
            <TabsTrigger value="ai-insights" className="gap-1.5">
              <Brain className="h-4 w-4" />
              AI Insights
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5">
              <FileText className="h-4 w-4" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="quotes">Quote Rankings</TabsTrigger>
            <TabsTrigger value="policies">Policies</TabsTrigger>
            <TabsTrigger value="claims">Claims</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>Account Information</CardTitle>
                {account.agency_workspace_id ? (
                  <FloorIdCardRequestButton
                    accountId={accountId}
                    agencyWorkspaceId={account.agency_workspace_id}
                  />
                ) : null}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><strong>Type:</strong> {account.account_type}</div>
                  <div><strong>Email:</strong> {account.email || 'Not provided'}</div>
                  <div><strong>Phone:</strong> {account.phone || 'Not provided'}</div>
                  <div><strong>Address:</strong> {account.address_line1 || 'Not provided'}</div>
                  <div><strong>City:</strong> {account.city || 'Not provided'}</div>
                  <div><strong>State:</strong> {account.state || 'Not provided'}</div>
                  <div><strong>ZIP:</strong> {account.zip_code || 'Not provided'}</div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="collection">
            <DocumentCollectionBoard accountId={accountId} />
          </TabsContent>

          <TabsContent value="ai-insights">
            <ClientIntelligencePanel
              accountId={accountId}
              accountName={account.name}
            />
          </TabsContent>

          <TabsContent value="documents">
            <DocumentsList
              accountId={accountId}
              title="All Documents"
              showPolicyColumn={true}
              onUploadClick={() => setUploadDocOpen(true)}
              onAskAI={(doc) => {
                toast({
                  title: 'AI Analysis',
                  description: `Opening AI analysis for ${doc.filename}...`,
                });
              }}
            />
          </TabsContent>

          <TabsContent value="quotes">
            <QuoteRankingDashboard
              accountId={accountId}
              onQuoteClick={(quoteId) => navigate(`/quote/${quoteId}`)}
            />
          </TabsContent>

          <TabsContent value="policies">
            <Card>
              <CardHeader>
                <CardTitle>Policies</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Policy management coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="claims">
            <Card>
              <CardHeader>
                <CardTitle>Claims</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Claims management coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <AccountForm
          open={showEditForm}
          onOpenChange={setShowEditForm}
          onSubmit={handleSave}
          account={account}
          loading={saving}
        />

        <UploadDocModal
          open={uploadDocOpen}
          onOpenChange={setUploadDocOpen}
          accountId={accountId}
          onSuccess={() => {
            toast({ title: 'Document uploaded', description: 'Document has been added.' });
          }}
        />
      </div>
    </AppLayout>
  );
}