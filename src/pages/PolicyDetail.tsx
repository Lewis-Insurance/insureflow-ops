import React, { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatLocalDateDisplay } from '@/lib/date/localDate';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Calendar, DollarSign, Building, Edit, ArrowLeft, FileText, Users, Award, Hash, Briefcase, Loader2, Sparkles, Anchor, Shield as ShieldIcon, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AddNoteModal } from '@/components/customers/AddNoteModal';
import { NotesPanel } from '@/components/notes/NotesPanel';
import { AddTaskModal } from '@/components/customers/AddTaskModal';
import { EditPolicyModal } from '@/components/customers/EditPolicyModal';
import { UploadDocModal } from '@/components/customers/UploadDocModal';
import { DocumentAnalysisButton } from '@/components/ai/DocumentAnalysisButton';
import { WCPolicyDetailsView } from '@/components/policies/WCPolicyDetails';
import type { WCPolicyDetails } from '@/types/workers-comp';
import { useExtractWCPolicy } from '@/hooks/useWCExtraction';
import { useExtractCGLPolicy, isCGLPolicy } from '@/hooks/useCGLExtraction';
import { useExtractPropertyPolicy, isPropertyPolicy } from '@/hooks/usePropertyExtraction';
import { PropertyPolicyDetailsView } from '@/components/policies/PropertyPolicyDetails';
import { useCreateSubmission } from '@/hooks/useCommercialSubmissions';
import { commercialLinesForPolicy, remarketNote } from '@/lib/commercial/remarket';
import { CGLPolicyDetailsView } from '@/components/policies/CGLPolicyDetails';
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
import { CancellationHolderList } from '@/components/certificates/CancellationHolderList';
import { useCancellationHolders } from '@/hooks/useCancellationHolders';

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
  const extractCGL = useExtractCGLPolicy();
  const extractProperty = useExtractPropertyPolicy();
  const createSubmission = useCreateSubmission();
  const queryClient = useQueryClient();
  // Which line's extraction should run after the next document upload. Set by
  // the per-line "Extract details" buttons; consumed once by onUploaded.
  const pendingExtractLine = useRef<'gl' | 'wc' | 'property' | null>(null);
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

  // Policy notes now come from the unified, account-scoped NotesPanel (customer_notes).

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

  // Cancellation notice (07 §5.2): active certificate holders that reference
  // this policy. The section renders whenever there are holders; it is
  // emphasized (warning-toned header) when the policy is cancelled/non_renewed.
  // The child component shares this query by key, so this is a single fetch.
  const { holders: cancellationHolders, isLoading: cancellationHoldersLoading } = useCancellationHolders(policyId ?? null);

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
  // isCGLPolicy's fallback ("liability" and not auto/professional) is too
  // broad on its own - it matches Cyber Liability, Umbrella Liability, E&O,
  // EPLI. Exclude every line this page already types plus umbrella/excess/
  // professional so the GL extraction can never write cgl_details onto a
  // non-GL policy (review fix).
  const isCGL =
    isCGLPolicy(policy?.line_of_business) &&
    !isWorkersComp && !isInlandMarine && !isCyber && !isCrime && !isEO &&
    !lob.includes('umbrella') && !lob.includes('excess') && !lob.includes('professional') && !lob.includes('epli');
  // Property (Phase 3): the helper matches 'bop' too, so a BOP shows BOTH the
  // GL and Property sections - which is exactly the GL+Property pairing.
  const isProperty =
    isPropertyPolicy(policy?.line_of_business) &&
    !isWorkersComp && !isInlandMarine && !isCyber && !isCrime && !isEO;

  // Parse WC details from the policy's wc_details JSON field
  const wcDetails: WCPolicyDetails | null = policy?.wc_details as WCPolicyDetails | null;

  // Cancellation notice emphasis (07 §5.2): a cancelled or non-renewed policy
  // turns the certificate-holder section into a warning-toned "Notify" prompt.
  const policyStatus = (policy?.status || '').toLowerCase();
  const isCancelledOrNonRenewed =
    policyStatus === 'cancelled' || policyStatus === 'non_renewed';
  const hasCancellationHolders = cancellationHolders.length > 0;

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
                onClick={() => navigate(`/certificates?accountId=${policy.account!.id}&policyId=${policyId}`)}
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
                    <div className="flex items-center gap-1 text-lg font-semibold text-success">
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
                      onClick={() => navigate(`/certificates?accountId=${policy.account!.id}&policyId=${policyId}`)}
                    >
                      <Award className="h-4 w-4 mr-2" />
                      Generate Certificate
                    </Button>
                    {(policy as any).line_category === 'commercial' && (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        disabled={createSubmission.isPending}
                        onClick={() => {
                          // Remarket clone (SOW v3 feeder #5): open a prefilled
                          // submission targeting this policy's line and x-date.
                          const targetLines = commercialLinesForPolicy(policy as any);
                          if (targetLines.length === 0) {
                            // Unmapped commercial labels (e.g. 'commercial_policy',
                            // Inland Marine): land the user where they can pick
                            // lines manually instead of dead-ending (Codex).
                            toast({
                              title: 'Pick the coverage lines manually',
                              description: 'This policy\'s line could not be mapped automatically; opening the commercial section.',
                            });
                            navigate(`/customers/${policy.account!.id}?tab=commercial`);
                            return;
                          }
                          createSubmission.mutate(
                            {
                              accountId: policy.account!.id,
                              targetLines,
                              effectiveDate: (policy as any).expiration_date ?? null,
                              // Carrier may live only on the joined carrier_info row.
                              notes: remarketNote({
                                ...(policy as any),
                                carrier: (policy as any).carrier || (policy as any).carrier_info?.name || null,
                              }),
                              remarketOfPolicyId: policy.id,
                            },
                            {
                              onSuccess: () =>
                                navigate(`/customers/${policy.account!.id}?tab=commercial`),
                            },
                          );
                        }}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        {createSubmission.isPending ? 'Creating submission...' : 'Remarket this policy'}
                      </Button>
                    )}
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
                      // Arm the post-upload extraction (the upload alone never
                      // extracted anything before this wiring).
                      pendingExtractLine.current = 'wc';
                      toast({
                        title: 'Extract WC Details',
                        description: 'Upload the WC policy document; extraction runs automatically after upload.',
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
                {isCGL && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      pendingExtractLine.current = 'gl';
                      toast({
                        title: 'Extract GL Details',
                        description: 'Upload the GL policy or dec page; extraction runs automatically after upload.',
                      });
                      setUploadDocOpen(true);
                    }}
                    disabled={extractCGL.isPending}
                  >
                    {extractCGL.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Extract GL Details
                  </Button>
                )}
                {isProperty && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      pendingExtractLine.current = 'property';
                      toast({
                        title: 'Extract Property Details',
                        description: 'Upload the property policy or dec page; extraction runs automatically after upload.',
                      });
                      setUploadDocOpen(true);
                    }}
                    disabled={extractProperty.isPending}
                  >
                    {extractProperty.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Extract Property Details
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

        {/* General Liability details: extraction target + the blob get_master_coi
            reads (cgl_details), so a populated section here = COI-ready limits. */}
        {isCGL && policyId && (
          <CGLPolicyDetailsView
            policyId={policyId}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cglDetails={((policy as any)?.cgl_details as any) ?? null}
          />
        )}

        {/* Property details (Phase 3): the blob get_master_coi reads for the
            property line; extraction target for uploaded property policies. */}
        {isProperty && policyId && (
          <PropertyPolicyDetailsView
            policyId={policyId}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            propertyDetails={((policy as any)?.property_details as any) ?? null}
          />
        )}

        {/* Policy Notes & Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {policy?.account?.id && (
            <NotesPanel accountId={policy.account.id} policyId={policy.id} title="Notes" />
          )}

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

        {/* Certificate holders (07 §5.2): shown whenever active cert holders
            reference this policy. Emphasized (warning-toned) when the policy is
            cancelled or non-renewed, because those holders were promised notice. */}
        {/* Review fix: on a cancelled/non-renewed policy the notify prompt must
            not vanish while the holder list is still loading. */}
        {policyId && (hasCancellationHolders || (isCancelledOrNonRenewed && cancellationHoldersLoading)) && (
          <Card
            className={
              isCancelledOrNonRenewed
                ? 'border-warning/40 bg-warning/5'
                : undefined
            }
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award
                  className={
                    isCancelledOrNonRenewed ? 'h-5 w-5 text-warning' : 'h-5 w-5'
                  }
                />
                <span className={isCancelledOrNonRenewed ? 'text-warning' : undefined}>
                  {isCancelledOrNonRenewed
                    ? 'Notify certificate holders'
                    : 'Certificate holders'}
                </span>
              </CardTitle>
              {isCancelledOrNonRenewed && (
                <p className="text-sm text-muted-foreground">
                  This policy is {policyStatus === 'cancelled' ? 'cancelled' : 'non-renewed'}.
                  The holders below were promised notice. Send each a notice or mark them
                  notified once contacted.
                </p>
              )}
            </CardHeader>
            <CardContent>
              <CancellationHolderList
                policyId={policyId}
                accountId={policy?.account?.id}
              />
            </CardContent>
          </Card>
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
            onOpenChange={(open) => {
              // Closing without an upload disarms any pending extraction.
              if (!open) pendingExtractLine.current = null;
              setUploadDocOpen(open);
            }}
            accountId={policy.account.id}
            policyId={policy.id}
            onUploaded={(documentId, associatedPolicyId) => {
              // Fire the armed line extraction against the fresh document. The
              // hooks own their toasts + cgl/wc invalidations; we add the
              // Master COI readiness refresh (limits may have just landed).
              const line = pendingExtractLine.current;
              pendingExtractLine.current = null;
              if (!line || !policyId) return;
              // Review fix: the modal lets the user re-associate the upload to
              // a different policy (or none). Only extract when the document
              // is actually associated with THIS policy.
              if (associatedPolicyId !== policyId) {
                toast({
                  title: 'Extraction skipped',
                  description: 'The document was associated with a different policy, so details were not extracted here.',
                });
                return;
              }
              const invalidateMasterCoi = () => {
                if (policy?.account?.id) {
                  queryClient.invalidateQueries({ queryKey: ['master-coi', policy.account.id] });
                }
              };
              if (line === 'gl') {
                extractCGL.mutate({ documentId, policyId }, { onSuccess: invalidateMasterCoi });
              } else if (line === 'wc') {
                extractWC.mutate({ documentId, policyId }, { onSuccess: invalidateMasterCoi });
              } else if (line === 'property') {
                extractProperty.mutate({ documentId, policyId }, { onSuccess: invalidateMasterCoi });
              }
            }}
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