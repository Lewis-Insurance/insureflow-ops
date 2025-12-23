/**
 * Renewal Rate Watch Page
 * 
 * Multi-carrier quote comparison for renewal premium shock.
 * Integrated with Auto-Owners renewals.
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { ClientSelector } from '@/components/client/ClientSelector';
import {
  ArrowLeft,
  Upload,
  FileText,
  Calculator,
  Mail,
  Download,
  Play,
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Minus,
  Loader2,
  Eye,
  Edit3,
  Send,
  RefreshCw,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  useRateWatchWorkspace,
  useRateWatchDocuments,
  useBundleSnapshots,
  useComparisonResult,
  useRateWatchReport,
  useRateWatchEmail,
  useCreateRateWatchWorkspace,
  useAddRateWatchDocument,
  useRunRateWatchPipeline,
  useUpdateEmailDraft,
} from '@/hooks/useRenewalRateWatch';

export default function RenewalRateWatchPage() {
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const aoRenewalId = searchParams.get('ao_renewal_id');
  const [activeTab, setActiveTab] = useState('documents');

  // Queries
  const { data: workspace, isLoading: workspaceLoading, error: workspaceError } = useRateWatchWorkspace(workspaceId || null);
  const { data: documents = [] } = useRateWatchDocuments(workspaceId || null);
  const { data: bundles = [] } = useBundleSnapshots(workspaceId || null);
  const { data: comparison } = useComparisonResult(workspaceId || null);
  const { data: report } = useRateWatchReport(workspaceId || null);
  const { data: emailDraft } = useRateWatchEmail(workspaceId || null);

  // Mutations
  const createWorkspace = useCreateRateWatchWorkspace();
  const addDocument = useAddRateWatchDocument();
  const runPipeline = useRunRateWatchPipeline();
  const updateEmail = useUpdateEmailDraft();

  // Create workspace if not exists and we have ao_renewal_id
  useEffect(() => {
    if (!workspaceId && aoRenewalId && !createWorkspace.isPending) {
      // For now, just show the create form
    }
  }, [workspaceId, aoRenewalId]);

  // Document upload handlers
  const [uploadRole, setUploadRole] = useState<'CURRENT' | 'RENEWAL' | 'QUOTE'>('CURRENT');
  const [uploadCarrier, setUploadCarrier] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workspaceId) return;

    await addDocument.mutateAsync({
      workspace_id: workspaceId,
      doc_role: uploadRole,
      carrier_name: uploadRole === 'QUOTE' ? uploadCarrier : undefined,
      file,
    });

    e.target.value = '';
  };

  // Group documents by role
  const currentDocs = documents.filter(d => d.doc_role === 'CURRENT');
  const renewalDocs = documents.filter(d => d.doc_role === 'RENEWAL');
  const quoteDocs = documents.filter(d => d.doc_role === 'QUOTE');
  const quotesByCarrier = quoteDocs.reduce((acc, doc) => {
    const carrier = doc.carrier_name || 'Unknown';
    if (!acc[carrier]) acc[carrier] = [];
    acc[carrier].push(doc);
    return acc;
  }, {} as Record<string, typeof quoteDocs>);

  // Email editing
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  useEffect(() => {
    if (emailDraft) {
      setEmailSubject(emailDraft.subject);
      setEmailBody(emailDraft.body_html);
    }
  }, [emailDraft]);

  const handleSaveEmail = async () => {
    if (!emailDraft) return;
    await updateEmail.mutateAsync({
      email_id: emailDraft.id,
      subject: emailSubject,
      body_html: emailBody,
      status: 'edited',
    });
    setEditingEmail(false);
  };

  // Creation form state
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const selectedAccountId = selectedClient?.id || '';
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [jobName, setJobName] = useState('');
  const [selectedLob, setSelectedLob] = useState('personal_auto');

  // Fetch policies for selected account (lightweight + safe)
  const { data: policies = [] } = useQuery({
    queryKey: ['rate-watch-policies', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const { data, error } = await supabase
        .from('policies')
        .select('id, policy_number, line_of_business')
        .eq('account_id', selectedAccountId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(`Failed to load policies: ${error.message}`);
      return data || [];
    },
    enabled: !!selectedAccountId,
    staleTime: 30 * 1000,
  });

  // Auto-generate job name when client selected
  useEffect(() => {
    if (selectedClient?.name && !jobName) {
      const date = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      setJobName(`${selectedClient.name} - Renewal ${date}`);
    }
  }, [selectedClient, jobName]);

  const handleCreateWorkspace = async () => {
    if (!selectedAccountId) {
      toast({ title: 'Select a customer', description: 'Please select a customer to start Rate Watch.', variant: 'destructive' });
      return;
    }
    const ws = await createWorkspace.mutateAsync({
      name: jobName.trim() || `${selectedClient?.name || 'New'} - Rate Watch`,
      account_id: selectedAccountId,
      policy_id: selectedPolicyId || undefined,
      ao_renewal_id: aoRenewalId || undefined,
      lob: selectedLob,
    });
    navigate(`/ao-renewals/rate-watch/${ws.id}`);
  };

  // If no workspace, show creation form
  if (!workspaceId) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold">New Rate Watch</h1>
              <p className="text-muted-foreground">
                Compare renewal with alternative carrier quotes
              </p>
            </div>
          </div>

          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Create Rate Watch Job</CardTitle>
              <CardDescription>
                Select a customer and policy to compare renewal options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Customer Selection */}
              <div className="space-y-2">
                <Label>Customer *</Label>
                <ClientSelector
                  selectedClient={selectedClient}
                  onSelect={(c) => {
                    setSelectedClient(c);
                    setSelectedPolicyId(''); // Reset policy when customer changes
                  }}
                  placeholder="Select a customer..."
                />
              </div>

              {/* Policy Selection */}
              {selectedAccountId && (
                <div className="space-y-2">
                  <Label>Policy (Optional)</Label>
                  <Select value={selectedPolicyId} onValueChange={setSelectedPolicyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a policy..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No specific policy</SelectItem>
                      {policies.map((policy) => (
                        <SelectItem key={policy.id} value={policy.id}>
                          {policy.policy_number} - {policy.line_of_business || 'Unknown LOB'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Job Name */}
              <div className="space-y-2">
                <Label>Job Name</Label>
                <Input
                  placeholder="e.g., Smith Auto Renewal - Jan 2025"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                />
              </div>

              {/* Line of Business */}
              <div className="space-y-2">
                <Label>Line of Business</Label>
                <Select value={selectedLob} onValueChange={setSelectedLob}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal_auto">Personal Auto</SelectItem>
                    <SelectItem value="home">Homeowners</SelectItem>
                    <SelectItem value="package">Home + Auto Package</SelectItem>
                    <SelectItem value="commercial_auto">Commercial Auto</SelectItem>
                    <SelectItem value="commercial_property">Commercial Property</SelectItem>
                    <SelectItem value="general_liability">General Liability</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <Button
                className="w-full"
                onClick={handleCreateWorkspace}
                disabled={createWorkspace.isPending || !selectedAccountId}
              >
                {createWorkspace.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Create Rate Watch
              </Button>
              <p className="text-xs text-muted-foreground">
                After creating the job, you’ll upload the current policy, renewal docs, and any alternative quotes.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (workspaceLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (workspaceError) {
    return (
      <AppLayout>
        <div className="p-6 max-w-3xl mx-auto space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Rate Watch load failed
              </CardTitle>
              <CardDescription>
                This Rate Watch job may not exist or you may not have access to it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {(workspaceError as any)?.message || 'Unknown error'}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate('/ao-renewals')}>
                  Back to AO Renewals
                </Button>
                <Button onClick={() => navigate('/ao-renewals/rate-watch')}>
                  Start New Rate Watch
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/ao-renewals')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{workspace?.name || 'Rate Watch'}</h1>
              <p className="text-muted-foreground">
                {workspace?.accounts?.name || 'Multi-carrier quote comparison'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={
              workspace?.status === 'ready' ? 'default' :
              workspace?.status === 'processing' ? 'secondary' :
              'outline'
            }>
              {workspace?.status || 'draft'}
            </Badge>
            <Button
              onClick={() => runPipeline.mutate({ workspace_id: workspaceId!, action: 'full_pipeline' })}
              disabled={runPipeline.isPending || documents.length === 0}
            >
              {runPipeline.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run Analysis
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {comparison && (
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Current Premium</div>
                <div className="text-2xl font-bold">
                  ${(comparison.current_term_premium || 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Renewal Premium</div>
                <div className="text-2xl font-bold">
                  ${(comparison.renewal_term_premium || 0).toLocaleString()}
                </div>
                {comparison.renewal_increase_amount !== null && (
                  <div className={`text-sm flex items-center gap-1 ${
                    comparison.renewal_increase_amount > 0 ? 'text-red-500' : 'text-green-500'
                  }`}>
                    {comparison.renewal_increase_amount > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {comparison.renewal_increase_amount > 0 ? '+' : ''}
                    ${comparison.renewal_increase_amount.toLocaleString()}
                    ({comparison.renewal_increase_percent?.toFixed(1)}%)
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Best Alternative</div>
                <div className="text-2xl font-bold">
                  {comparison.best_alternative_carrier || 'N/A'}
                </div>
                {comparison.best_alternative_savings && (
                  <div className="text-sm text-green-500">
                    Save ${comparison.best_alternative_savings.toLocaleString()}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className={
              comparison.recommendation_type === 'switch' ? 'border-green-500 bg-green-50' :
              comparison.recommendation_type === 'stay' ? 'border-blue-500 bg-blue-50' :
              ''
            }>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Recommendation</div>
                <div className="text-lg font-semibold capitalize">
                  {comparison.recommendation_type?.replace('_', ' ') || 'Pending'}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="documents" className="gap-2">
              <FileText className="h-4 w-4" />
              Documents ({documents.length})
            </TabsTrigger>
            <TabsTrigger value="comparison" className="gap-2" disabled={!comparison}>
              <Calculator className="h-4 w-4" />
              Comparison
            </TabsTrigger>
            <TabsTrigger value="report" className="gap-2" disabled={!report}>
              <Download className="h-4 w-4" />
              Report
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2" disabled={!emailDraft}>
              <Mail className="h-4 w-4" />
              Email Draft
            </TabsTrigger>
          </TabsList>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-6">
            {/* Upload Section */}
            <Card>
              <CardHeader>
                <CardTitle>Upload Documents</CardTitle>
                <CardDescription>
                  Add current policy, renewal, and alternative quotes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label>Document Role</Label>
                    <Select value={uploadRole} onValueChange={(v) => setUploadRole(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CURRENT">Current Policy</SelectItem>
                        <SelectItem value="RENEWAL">Renewal Docs</SelectItem>
                        <SelectItem value="QUOTE">Alternative Quote</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {uploadRole === 'QUOTE' && (
                    <div className="flex-1">
                      <Label>Carrier Name</Label>
                      <Input
                        placeholder="e.g., GEICO, Progressive"
                        value={uploadCarrier}
                        onChange={(e) => setUploadCarrier(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="flex items-end">
                    <Label htmlFor="file-upload" className="cursor-pointer">
                      <Button asChild disabled={addDocument.isPending}>
                        <span>
                          {addDocument.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-2" />
                          )}
                          Upload
                        </span>
                      </Button>
                    </Label>
                    <input
                      id="file-upload"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Document List */}
            <div className="grid grid-cols-3 gap-4">
              {/* Current Policy */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Badge variant="outline">Current</Badge>
                    In-Force Policy
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {currentDocs.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No current policy docs uploaded
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {currentDocs.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-2 p-2 rounded bg-muted">
                          <FileText className="h-4 w-4" />
                          <span className="flex-1 truncate text-sm">{doc.filename}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Renewal */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Badge variant="secondary">Renewal</Badge>
                    Renewal Offer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {renewalDocs.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No renewal docs uploaded
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {renewalDocs.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-2 p-2 rounded bg-muted">
                          <FileText className="h-4 w-4" />
                          <span className="flex-1 truncate text-sm">{doc.filename}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quotes */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Badge variant="default">Quotes</Badge>
                    Alternative Carriers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {quoteDocs.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No quotes uploaded
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(quotesByCarrier).map(([carrier, docs]) => (
                        <div key={carrier}>
                          <div className="font-medium text-sm mb-2">{carrier}</div>
                          <div className="space-y-1">
                            {docs.map((doc) => (
                              <div key={doc.id} className="flex items-center gap-2 p-2 rounded bg-muted">
                                <FileText className="h-4 w-4" />
                                <span className="flex-1 truncate text-sm">{doc.filename}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Comparison Tab */}
          <TabsContent value="comparison" className="space-y-6">
            {comparison && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Premium Comparison</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Option</th>
                          <th className="text-right py-2">Term Premium</th>
                          <th className="text-right py-2">vs Renewal</th>
                          <th className="text-center py-2">Coverage Match</th>
                          <th className="text-center py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="py-3 font-medium">Current Policy</td>
                          <td className="py-3 text-right">${(comparison.current_term_premium || 0).toLocaleString()}</td>
                          <td className="py-3 text-right">-</td>
                          <td className="py-3 text-center">-</td>
                          <td className="py-3 text-center">
                            <Badge variant="outline">Baseline</Badge>
                          </td>
                        </tr>
                        <tr className="border-b bg-amber-50">
                          <td className="py-3 font-medium">Renewal Offer</td>
                          <td className="py-3 text-right">${(comparison.renewal_term_premium || 0).toLocaleString()}</td>
                          <td className="py-3 text-right text-red-500">
                            +${(comparison.renewal_increase_amount || 0).toLocaleString()}
                          </td>
                          <td className="py-3 text-center">100%</td>
                          <td className="py-3 text-center">
                            <Badge variant="secondary">Under Review</Badge>
                          </td>
                        </tr>
                        {comparison.quote_comparisons?.map((quote, i) => (
                          <tr key={i} className={`border-b ${
                            quote.carrier === comparison.best_alternative_carrier ? 'bg-green-50' : ''
                          }`}>
                            <td className="py-3 font-medium">{quote.carrier}</td>
                            <td className="py-3 text-right">${(quote.term_premium || 0).toLocaleString()}</td>
                            <td className={`py-3 text-right ${
                              (quote.savings_vs_renewal || 0) > 0 ? 'text-green-600' : 'text-red-500'
                            }`}>
                              {(quote.savings_vs_renewal || 0) > 0 ? '-' : '+'}
                              ${Math.abs(quote.savings_vs_renewal || 0).toLocaleString()}
                            </td>
                            <td className="py-3 text-center">{Math.round((quote.parity_score || 0) * 100)}%</td>
                            <td className="py-3 text-center">
                              {quote.carrier === comparison.best_alternative_carrier && (
                                <Badge className="bg-green-600">Best Option</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recommendation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Alert className={
                      comparison.recommendation_type === 'switch' ? 'border-green-500' :
                      comparison.recommendation_type === 'stay' ? 'border-blue-500' :
                      ''
                    }>
                      <AlertDescription className="text-base">
                        {comparison.recommendation_reason}
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Report Tab */}
          <TabsContent value="report" className="space-y-4">
            {report?.content_html && (
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Renewal Options Summary</CardTitle>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[600px] w-full border rounded-lg p-4 bg-white">
                    <div dangerouslySetInnerHTML={{ __html: report.content_html }} />
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Email Tab */}
          <TabsContent value="email" className="space-y-4">
            {emailDraft && (
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle>Client Email Draft</CardTitle>
                    <CardDescription>
                      To: {emailDraft.to_name} ({emailDraft.to_email})
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {editingEmail ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setEditingEmail(false)}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={handleSaveEmail} disabled={updateEmail.isPending}>
                          {updateEmail.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Save Changes
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setEditingEmail(true)}>
                          <Edit3 className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                        <Button size="sm">
                          <Send className="h-4 w-4 mr-2" />
                          Approve & Send
                        </Button>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {editingEmail ? (
                    <>
                      <div className="space-y-2">
                        <Label>Subject</Label>
                        <Input
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Body</Label>
                        <Textarea
                          className="min-h-[400px] font-mono text-sm"
                          value={emailBody}
                          onChange={(e) => setEmailBody(e.target.value)}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="border rounded-lg p-6 bg-white">
                      <div className="mb-4 pb-4 border-b">
                        <div className="text-sm text-muted-foreground">Subject:</div>
                        <div className="font-medium">{emailDraft.subject}</div>
                      </div>
                      <div dangerouslySetInnerHTML={{ __html: emailDraft.body_html }} />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

