import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatLocalDateDisplay } from '@/lib/date/localDate';
import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Calendar, DollarSign, Building, Edit, ArrowLeft, FileText, Users, Award, Hash, Briefcase, Loader2, Sparkles, Anchor, Shield as ShieldIcon, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AddNoteModal } from '@/components/customers/AddNoteModal';
import { AddTaskModal } from '@/components/customers/AddTaskModal';
import { EditPolicyModal } from '@/components/customers/EditPolicyModal';
import { UploadDocModal } from '@/components/customers/UploadDocModal';
import { DocumentAnalysisButton } from '@/components/ai/DocumentAnalysisButton';
import { WCPolicyDetailsView } from '@/components/policies/WCPolicyDetails';
import type { WCPolicyDetails } from '@/types/workers-comp';
import { useExtractWCPolicy } from '@/hooks/useWCExtraction';
import { InlandMarinePolicyDetails } from '@/components/policies/InlandMarinePolicyDetails';
import { useExtractInlandMarinePolicy, isInlandMarinePolicy } from '@/hooks/useInlandMarineExtraction';
import { CyberPolicyDetails } from '@/components/policies/CyberPolicyDetails';
import { useExtractCyberPolicy, isCyberPolicy } from '@/hooks/useCyberExtraction';
import { CrimePolicyDetails } from '@/components/policies/CrimePolicyDetails';
import { useExtractCrimePolicy, isCrimePolicy } from '@/hooks/useCrimeExtraction';
import { EOPolicyDetails } from '@/components/policies/EOPolicyDetails';
import { useExtractEOPolicy, isEOPolicy } from '@/hooks/useEOExtraction';
import { PolicyManualDetailsModal } from '@/components/policies/PolicyManualDetailsModal';
import { DocumentsList } from '@/components/documents/DocumentsList';
import { RecordPaymentModal } from '@/components/payments/RecordPaymentModal';
import { PaymentHistoryWidget } from '@/components/payments/PaymentHistoryWidget';

export default function PolicyDetail() {
  const { policyId } = useParams<{ policyId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [editPolicyOpen, setEditPolicyOpen] = useState(false);
  const [manualDetailsOpen, setManualDetailsOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  // Extraction hooks
  const extractWC = useExtractWCPolicy();
  const extractIM = useExtractInlandMarinePolicy();
  const extractCyber = useExtractCyberPolicy();
  const extractCrime = useExtractCrimePolicy();
  const extractEO = useExtractEOPolicy();

  // Fetch policy with account and carrier info
  const { data: policy, isLoading, error, refetch } = useQuery({
    queryKey: ['policy', policyId],
    queryFn: async () => {
      if (!policyId) throw new Error('Policy ID is required');
      
      try {
        const { data, error } = await supabase
          .from('policies')
          .select(`
            *,
            account:accounts!policies_account_id_fkey(
              id,
              name,
              type,
              email,
              phone
            ),
            carrier_info:carriers!policies_carrier_id_fkey(
              id,
              name
            )
          `)
          .eq('id', policyId)
          .maybeSingle();

        if (error) {
          console.error('Policy fetch error:', error);
          throw new Error(`Failed to fetch policy: ${error.message}`);
        }

        return data;
      } catch (err) {
        console.error('Policy query exception:', err);
        throw err;
      }
    },
    enabled: !!policyId,
    retry: 1,
  });

  const { data: policyNotes = [] } = useQuery({
    queryKey: ['policy-notes', policyId],
    queryFn: async () => {
      if (!policyId) return [];
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!policyId,
  });

  const { data: policyTasks = [] } = useQuery({
    queryKey: ['policy-tasks', policyId],
    queryFn: async () => {
      if (!policyId) return [];
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('policy_id', policyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!policyId,
  });

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'bound':
        return 'default';
      case 'pending':
      case 'quoted':
        return 'secondary';
      case 'expired':
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const handleEdit = () => {
    setEditPolicyOpen(true);
  };

  // Check policy line of business
  const lob = (policy?.line_of_business || '').toLowerCase();
  const isWorkersComp = lob.includes('work') && lob.includes('comp');
  const isInlandMarine = isInlandMarinePolicy(policy?.line_of_business);
  const isCyber = isCyberPolicy(policy?.line_of_business);
  const isCrime = isCrimePolicy(policy?.line_of_business);
  const isEO = isEOPolicy(policy?.line_of_business);

  // Parse WC details from the policy's wc_details JSON field
  const wcDetails: WCPolicyDetails | null = policy?.wc_details as WCPolicyDetails | null;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto p-6">
          <div className="text-center py-8">Loading policy details...</div>
        </div>
      </AppLayout>
    );
  }

  if (error || !policy) {
    return (
      <AppLayout>
        <div className="container mx-auto p-6">
          <Card>
            <CardContent className="text-center py-8">
              <h3 className="text-lg font-semibold mb-2">Policy Not Found</h3>
              <p className="text-muted-foreground mb-4">
                The requested policy could not be found.
              </p>
              <Button onClick={() => navigate(-1)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-6 w-6" />
                <h1 className="text-3xl font-bold tracking-tight">
                  {policy.line_of_business || 'Policy'}
                </h1>
                <Badge variant={getStatusColor(policy.status || 'active')}>
                  {policy.status || 'Active'}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                Policy #{policy.policy_number}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {policy.account && (
              <Button
                variant="outline"
                onClick={() => navigate(`/coi-generator?accountId=${policy.account!.id}&policyId=${policyId}`)}
              >
                <Award className="h-4 w-4 mr-2" />
                New Certificate
              </Button>
            )}
            <Button
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={() => setPaymentModalOpen(true)}
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
            <Button variant="outline" onClick={handleEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Policy
            </Button>
          </div>
        </div>

        {/* Policy Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Policy Info */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Policy Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Named Insured Info */}
              {(policy.named_insured || policy.dba || policy.fein) && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    {policy.named_insured && (
                      <div className="col-span-2">
                        <label className="text-sm font-medium text-muted-foreground">Named Insured</label>
                        <p className="font-semibold">{policy.named_insured}</p>
                      </div>
                    )}
                    {policy.dba && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">DBA</label>
                        <p>{policy.dba}</p>
                      </div>
                    )}
                    {policy.fein && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">FEIN</label>
                        <p className="font-mono">{policy.fein}</p>
                      </div>
                    )}
                  </div>
                  <Separator />
                </>
              )}

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Policy Number</label>
                  <p className="font-mono">{policy.policy_number}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Line of Business</label>
                  <p>{policy.line_of_business || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Carrier</label>
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    {policy.carrier_info?.id ? (
                      <Button
                        variant="link"
                        className="p-0 h-auto font-normal"
                        onClick={() => navigate(`/carriers?carrier=${policy.carrier_info!.id}`)}
                      >
                        {policy.carrier || policy.carrier_info.name}
                      </Button>
                    ) : (
                      <span>{policy.carrier || policy.carrier_info?.name || 'N/A'}</span>
                    )}
                  </div>
                  {policy.carrier_naic && (
                    <p className="text-xs text-muted-foreground mt-1">NAIC: {policy.carrier_naic}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">MGA</label>
                  <p>{policy.mga || 'N/A'}</p>
                </div>
              </div>

              <Separator />

              {/* Dates */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Issue Date</label>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {policy.issue_date
                        ? new Date(policy.issue_date).toLocaleDateString()
                        : 'N/A'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Effective Date</label>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {policy.effective_date
                        ? formatLocalDateDisplay(policy.effective_date)
                        : 'N/A'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Expiration Date</label>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {policy.expiration_date
                        ? formatLocalDateDisplay(policy.expiration_date)
                        : 'N/A'}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Policy Term</label>
                  <p>{policy.policy_term ? `${policy.policy_term} months` : 'N/A'}</p>
                </div>
              </div>

              <Separator />

              {/* Premium & Fees */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Premium</label>
                  <div className="flex items-center gap-1 text-lg font-semibold">
                    <DollarSign className="h-4 w-4" />
                    <span>{formatCurrency(policy.premium)}</span>
                  </div>
                </div>
                {policy.agency_fee && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Agency Fee</label>
                    <p>{formatCurrency(policy.agency_fee)}</p>
                  </div>
                )}
                {policy.taxes_fees && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Taxes & Fees</label>
                    <p>{formatCurrency(policy.taxes_fees)}</p>
                  </div>
                )}
                {policy.total_premium && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Total Premium</label>
                    <div className="flex items-center gap-1 text-lg font-semibold text-green-600">
                      <DollarSign className="h-4 w-4" />
                      <span>{formatCurrency(policy.total_premium)}</span>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Billing Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Billing Method</label>
                  <p className="capitalize">{policy.billing_method?.replace('_', ' ') || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Billing Frequency</label>
                  <p className="capitalize">{policy.billing_frequency || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Payment Type</label>
                  <p className="capitalize">{policy.payment_type?.replace('_', ' ') || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <Badge variant={getStatusColor(policy.status || 'active')}>
                    {policy.status || 'Active'}
                  </Badge>
                </div>
              </div>

              {/* Coverage Summary */}
              {policy.coverage && typeof policy.coverage === 'object' && Object.keys(policy.coverage).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">Coverage Summary</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {Object.entries(policy.coverage).map(([key, value]) => (
                        <div key={key} className="bg-muted/50 p-2 rounded">
                          <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
                          <p className="font-medium">{typeof value === 'number' ? formatCurrency(value) : String(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Insured Items */}
              {policy.insured_items && Array.isArray(policy.insured_items) && policy.insured_items.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">Insured Items</label>
                    <div className="space-y-2">
                      {policy.insured_items.map((item: any, idx: number) => (
                        <div key={idx} className="bg-muted/50 p-3 rounded flex justify-between items-center">
                          <div>
                            <p className="font-medium">{item.description || item.name || `Item ${idx + 1}`}</p>
                            {item.vin && <p className="text-xs text-muted-foreground">VIN: {item.vin}</p>}
                            {item.year && item.make && item.model && (
                              <p className="text-xs text-muted-foreground">{item.year} {item.make} {item.model}</p>
                            )}
                          </div>
                          {item.value && <p className="font-semibold">{formatCurrency(item.value)}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Account Info & Actions */}
          <div className="space-y-6">
            {/* Account Information */}
            {policy.account && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Account
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Name</label>
                      <p className="font-semibold">{policy.account.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Type</label>
                      <p>{policy.account.type}</p>
                    </div>
                    {policy.account.email && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Email</label>
                        <p>{policy.account.email}</p>
                      </div>
                    )}
                    {policy.account.phone && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Phone</label>
                        <p>{policy.account.phone}</p>
                      </div>
                    )}
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => navigate(`/customers/${policy.account!.id}`)}
                    >
                      View Customer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {policy.account && (
                  <>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => navigate(`/coi-generator?accountId=${policy.account!.id}&policyId=${policyId}`)}
                    >
                      <Award className="h-4 w-4 mr-2" />
                      Generate Certificate
                    </Button>
                    <DocumentAnalysisButton
                      accountId={policy.account.id}
                      variant="outline"
                      size="default"
                    />
                  </>
                )}
                {isWorkersComp && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      toast({
                        title: 'Extract WC Details',
                        description: 'Upload a WC document to extract details automatically.',
                      });
                      setUploadDocOpen(true);
                    }}
                    disabled={extractWC.isPending}
                  >
                    {extractWC.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Extract WC Details
                  </Button>
                )}
                {isInlandMarine && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      toast({
                        title: 'Extract Inland Marine Details',
                        description: 'Upload an IM document to extract scheduled items and coverages.',
                      });
                      setUploadDocOpen(true);
                    }}
                    disabled={extractIM.isPending}
                  >
                    {extractIM.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Anchor className="h-4 w-4 mr-2" />
                    )}
                    Extract IM Details
                  </Button>
                )}
                {isCyber && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      toast({
                        title: 'Extract Cyber Details',
                        description: 'Upload a cyber policy to extract coverages and provisions.',
                      });
                      setUploadDocOpen(true);
                    }}
                    disabled={extractCyber.isPending}
                  >
                    {extractCyber.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Lock className="h-4 w-4 mr-2" />
                    )}
                    Extract Cyber Details
                  </Button>
                )}
                {isCrime && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      toast({
                        title: 'Extract Crime Details',
                        description: 'Upload a crime policy to extract insuring agreements.',
                      });
                      setUploadDocOpen(true);
                    }}
                    disabled={extractCrime.isPending}
                  >
                    {extractCrime.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ShieldIcon className="h-4 w-4 mr-2" />
                    )}
                    Extract Crime Details
                  </Button>
                )}
                {isEO && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      toast({
                        title: 'Extract E&O Details',
                        description: 'Upload an E&O policy to extract claims-made details, ERP, and limits.',
                      });
                      setUploadDocOpen(true);
                    }}
                    disabled={extractEO.isPending}
                  >
                    {extractEO.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Briefcase className="h-4 w-4 mr-2" />
                    )}
                    Extract E&O Details
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setAddNoteOpen(true)}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Add Note
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => setAddTaskOpen(true)}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Add Task
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => setUploadDocOpen(true)}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setManualDetailsOpen(true)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Manual Details
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Workers' Comp Details Section */}
        {isWorkersComp && (
          <WCPolicyDetailsView
            policyId={policyId!}
            wcDetails={wcDetails}
          />
        )}

        {/* Policy Notes & Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Policy Notes ({policyNotes.length})
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => setAddNoteOpen(true)}>
                Add Note
              </Button>
            </CardHeader>
            <CardContent>
              {policyNotes.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">No policy notes yet.</div>
              ) : (
                <div className="space-y-3">
                  {policyNotes.slice(0, 6).map((note: any) => (
                    <div key={note.id} className="border-l-2 border-primary/20 pl-3">
                      <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(note.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                  {policyNotes.length > 6 && (
                    <p className="text-xs text-muted-foreground">+{policyNotes.length - 6} more notes</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Policy Tasks ({policyTasks.length})
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => setAddTaskOpen(true)}>
                Add Task
              </Button>
            </CardHeader>
            <CardContent>
              {policyTasks.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">No policy tasks yet.</div>
              ) : (
                <div className="space-y-3">
                  {policyTasks.slice(0, 6).map((task: any) => (
                    <div key={task.id} className="flex items-start justify-between gap-3 p-3 border rounded-lg">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{task.title}</div>
                        {task.description && (
                          <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {task.description}
                          </div>
                        )}
                        {task.due_at && (
                          <div className="text-xs text-muted-foreground mt-2">
                            Due: {new Date(task.due_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                      {task.status && (
                        <Badge variant="secondary" className="shrink-0">
                          {String(task.status)}
                        </Badge>
                      )}
                    </div>
                  ))}
                  {policyTasks.length > 6 && (
                    <p className="text-xs text-muted-foreground">+{policyTasks.length - 6} more tasks</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Payment History Section */}
        {policyId && (
          <PaymentHistoryWidget
            policyId={policyId}
            title="Payment History"
            maxItems={5}
            showPolicyColumn={false}
          />
        )}

        {/* Inland Marine Details Section */}
        {isInlandMarine && policyId && (
          <InlandMarinePolicyDetails policyId={policyId} />
        )}

        {/* Cyber Liability Details Section */}
        {isCyber && policyId && (
          <CyberPolicyDetails policyId={policyId} />
        )}

        {/* Commercial Crime Details Section */}
        {isCrime && policyId && (
          <CrimePolicyDetails policyId={policyId} />
        )}

        {/* Professional Liability / E&O Details Section */}
        {isEO && policyId && (
          <EOPolicyDetails policyId={policyId} />
        )}

        {/* Documents Section */}
        {policyId && (
          <DocumentsList
            policyId={policyId}
            title="Policy Documents"
            onUploadClick={() => setUploadDocOpen(true)}
            onAskAI={(doc) => {
              toast({
                title: 'AI Analysis',
                description: `Opening AI analysis for ${doc.filename}...`,
              });
              // Navigate to AI analysis or open modal
            }}
          />
        )}
      </div>

      {/* Modals */}
      {policy?.account && (
        <>
          <AddNoteModal
            open={addNoteOpen}
            onOpenChange={setAddNoteOpen}
            accountId={policy.account.id}
            policyId={policy.id}
          />
          <AddTaskModal
            open={addTaskOpen}
            onOpenChange={setAddTaskOpen}
            accountId={policy.account.id}
            policyId={policy.id}
          />
          <UploadDocModal
            open={uploadDocOpen}
            onOpenChange={setUploadDocOpen}
            accountId={policy.account.id}
            policyId={policy.id}
            onSuccess={() => {
              toast({
                title: "Document Uploaded",
                description: "Document has been successfully uploaded to this policy.",
              });
            }}
          />
          <EditPolicyModal
            open={editPolicyOpen}
            onOpenChange={setEditPolicyOpen}
            policy={policy ? {
              id: policy.id,
              policy_number: policy.policy_number,
              carrier: policy.carrier,
              line_of_business: policy.line_of_business,
              premium: policy.premium,
              effective_date: policy.effective_date,
              expiration_date: policy.expiration_date,
              billing_frequency: policy.billing_frequency,
              billing_method: policy.billing_method,
              policy_term: policy.policy_term,
              status: policy.status,
              payment_type: policy.payment_type
            } : null}
            onSuccess={refetch}
          />
          <PolicyManualDetailsModal
            open={manualDetailsOpen}
            onOpenChange={setManualDetailsOpen}
            policyId={policy.id}
            isWorkersComp={isWorkersComp}
            lineOfBusiness={policy.line_of_business || ''}
            initialCoverage={policy.coverage}
            initialCustom={policy.custom}
            initialInsuredItems={policy.insured_items}
            initialWcDetails={(policy as any).wc_details}
            onSaved={refetch}
          />
          <RecordPaymentModal
            open={paymentModalOpen}
            onOpenChange={setPaymentModalOpen}
            policyId={policy.id}
            accountId={policy.account?.id}
            customerName={policy.account?.name}
            onSuccess={() => {
              toast({
                title: "Payment Recorded",
                description: "Payment has been successfully recorded.",
              });
            }}
          />
        </>
      )}
    </AppLayout>
  );
}