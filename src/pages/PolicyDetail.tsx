import React, { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatLocalDateDisplay } from '@/lib/date/localDate';
import { humanizeAccountType } from '@/lib/format';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Calendar, DollarSign, Building, Edit, ArrowLeft, FileText, Users, Award } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { EditPolicyModal } from '@/components/customers/EditPolicyModal';
import { UploadDocModal } from '@/components/customers/UploadDocModal';
import type { WCPolicyDetails } from '@/types/workers-comp';
import { useExtractWCPolicy } from '@/hooks/useWCExtraction';
import { useExtractCGLPolicy, isCGLPolicy } from '@/hooks/useCGLExtraction';
import { useExtractPropertyPolicy, isPropertyPolicy } from '@/hooks/usePropertyExtraction';
import { useExtractUmbrellaPolicy, isUmbrellaPolicy } from '@/hooks/useUmbrellaExtraction';
import { useExtractBAPPolicy, isCommercialAutoPolicy, useBAPVehicles, useBAPDrivers, useBAPInterests } from '@/hooks/useBAPExtraction';
import { BoundTermsCard } from '@/components/policies/BoundTermsCard';
import { useCreateSubmission } from '@/hooks/useCommercialSubmissions';
import { commercialLinesForPolicy, remarketNote } from '@/lib/commercial/remarket';
import { InlandMarinePolicyDetails } from '@/components/policies/InlandMarinePolicyDetails';
import { useExtractInlandMarinePolicy, isInlandMarinePolicy } from '@/hooks/useInlandMarineExtraction';
import { CyberPolicyDetails } from '@/components/policies/CyberPolicyDetails';
import { useExtractCyberPolicy, isCyberPolicy } from '@/hooks/useCyberExtraction';
import { CrimePolicyDetails } from '@/components/policies/CrimePolicyDetails';
import { useExtractCrimePolicy, isCrimePolicy } from '@/hooks/useCrimeExtraction';
import { EOPolicyDetails } from '@/components/policies/EOPolicyDetails';
import { useExtractEOPolicy, isEOPolicy } from '@/hooks/useEOExtraction';
import { RecordPaymentModal } from '@/components/payments/RecordPaymentModal';
import { CancellationHolderList } from '@/components/certificates/CancellationHolderList';
import { useCancellationHolders } from '@/hooks/useCancellationHolders';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PolicyCoveragePanel } from '@/components/policies/PolicyCoveragePanel';

export default function PolicyDetail() {
  const { policyId } = useParams<{ policyId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [editPolicyOpen, setEditPolicyOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  // Extraction hooks
  const extractWC = useExtractWCPolicy();
  const extractCGL = useExtractCGLPolicy();
  const extractProperty = useExtractPropertyPolicy();
  const extractUmbrella = useExtractUmbrellaPolicy();
  const extractBAP = useExtractBAPPolicy();
  const createSubmission = useCreateSubmission();
  const queryClient = useQueryClient();
  // Which line's extraction should run after the next document upload. Set by
  // the per-line "Extract details" buttons; consumed once by onUploaded.
  const pendingExtractLine = useRef<'gl' | 'wc' | 'property' | 'umbrella' | 'auto' | null>(null);
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

  // Notes, tasks, payments, and documents for this policy now live on the
  // customer record; the policy page no longer duplicates those surfaces.

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

  // Remarket clone (SOW v3 feeder #5): open a prefilled submission targeting
  // this policy's line and x-date. Relocated from the removed Quick Actions
  // panel to the page header; commercial policies only.
  const handleRemarket = () => {
    if (!policy?.account) return;
    const targetLines = commercialLinesForPolicy(policy as any);
    if (targetLines.length === 0) {
      // Unmapped commercial labels (e.g. 'commercial_policy', Inland Marine):
      // land the user where they can pick lines manually instead of dead-ending.
      toast({
        title: 'Pick the coverage lines manually',
        description: "This policy's line could not be mapped automatically; opening the commercial section.",
      });
      navigate(`/customers/${policy.account.id}?tab=commercial`);
      return;
    }
    createSubmission.mutate(
      {
        accountId: policy.account.id,
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
        onSuccess: () => navigate(`/customers/${policy.account!.id}?tab=commercial`),
      },
    );
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
  // BOP is the GL+Property pairing: it must light up BOTH sections.
  const isBOP = lob.includes('bop') || lob.includes('business owner');
  const isCGL =
    (isCGLPolicy(policy?.line_of_business) || isBOP) &&
    !isWorkersComp && !isInlandMarine && !isCyber && !isCrime && !isEO &&
    !lob.includes('umbrella') && !lob.includes('excess') && !lob.includes('professional') && !lob.includes('epli');
  // Property (Phase 3): the helper matches 'bop' too, so a BOP shows BOTH the
  // GL and Property sections - which is exactly the GL+Property pairing.
  const isProperty =
    isPropertyPolicy(policy?.line_of_business) &&
    !isWorkersComp && !isInlandMarine && !isCyber && !isCrime && !isEO;
  const isUmbrella =
    isUmbrellaPolicy(policy?.line_of_business) &&
    !isWorkersComp && !isInlandMarine && !isCyber && !isCrime && !isEO;
  // Commercial/business auto only (Phase 6): the helper requires a
  // commercial/business qualifier, so the personal-auto book (bare "Auto")
  // never lights this section up.
  const isAuto =
    isCommercialAutoPolicy(policy?.line_of_business) &&
    !isWorkersComp && !isInlandMarine && !isCyber && !isCrime && !isEO;
  // BAP schedules live in policy_bap_* tables written by extraction; the
  // details view is presentational and needs them passed (review fix). The
  // undefined arg keeps these queries off for the personal-auto book.
  const { data: bapVehicles = [] } = useBAPVehicles(isAuto && policyId ? policyId : undefined);
  const { data: bapDrivers = [] } = useBAPDrivers(isAuto && policyId ? policyId : undefined);
  const { data: bapInterests = [] } = useBAPInterests(isAuto && policyId ? policyId : undefined);

  const coiAccountId = policy?.account?.id ?? null;
  // Arm the per-line document extraction, then open the upload modal. The coverage
  // panel's "Fill from document" button routes through here, reusing the existing
  // post-upload extraction wiring (pendingExtractLine).
  const armCoverageExtract = (
    line: 'gl' | 'auto' | 'umbrella' | 'wc' | 'property',
  ) => {
    pendingExtractLine.current = line;
    setUploadDocOpen(true);
  };

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
            {policy.account && (policy as any).line_category === 'commercial' && (
              <Button
                variant="outline"
                disabled={createSubmission.isPending}
                onClick={handleRemarket}
              >
                <FileText className="h-4 w-4 mr-2" />
                {createSubmission.isPending ? 'Creating...' : 'Remarket'}
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

        {/* Policy + Account: one compact panel. Was a 2-col grid (policy card +
            a tall Account/Quick Actions sidebar); merged and densified to cut
            vertical space. */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Policy Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Named Insured (when the policy carries its own insured identity) */}
            {(policy.named_insured || policy.dba || policy.fein) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
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
            )}

            {/* All core policy fields in one dense grid (no per-group separators,
                which is where most of the old height went). */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
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
              <div>
                <label className="text-sm font-medium text-muted-foreground">Issue Date</label>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{policy.issue_date ? new Date(policy.issue_date).toLocaleDateString() : 'N/A'}</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Effective Date</label>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{policy.effective_date ? formatLocalDateDisplay(policy.effective_date) : 'N/A'}</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Expiration Date</label>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{policy.expiration_date ? formatLocalDateDisplay(policy.expiration_date) : 'N/A'}</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Policy Term</label>
                <p>{policy.policy_term ? `${policy.policy_term} months` : 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Premium</label>
                <div className="flex items-center gap-1 font-semibold">
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
                  <div className="flex items-center gap-1 font-semibold text-success">
                    <DollarSign className="h-4 w-4" />
                    <span>{formatCurrency(policy.total_premium)}</span>
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Billing Method</label>
                <p className="capitalize">{policy.billing_method?.replace('_', ' ') || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Billing Frequency</label>
                <p className="capitalize">{policy.billing_frequency || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Status</label>
                <div>
                  <Badge variant={getStatusColor(policy.status || 'active')}>
                    {policy.status || 'Active'}
                  </Badge>
                </div>
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

            {/* Account (customer) folded in - was the separate sidebar Account
                card; now a single dense row inside this panel. */}
            {policy.account && (
              <>
                <Separator />
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 flex-1 min-w-0">
                    <div className="min-w-0">
                      <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" /> Customer
                      </label>
                      <p className="font-semibold truncate">{policy.account.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Type</label>
                      <p>{humanizeAccountType(policy.account.type)}</p>
                    </div>
                    {policy.account.email && (
                      <div className="min-w-0">
                        <label className="text-sm font-medium text-muted-foreground">Email</label>
                        <p className="truncate">{policy.account.email}</p>
                      </div>
                    )}
                    {policy.account.phone && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Phone</label>
                        <p>{policy.account.phone}</p>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    className="shrink-0"
                    onClick={() => navigate(`/customers/${policy.account!.id}`)}
                  >
                    View Customer
                  </Button>
                </div>
              </>
            )}
            </CardContent>
          </Card>

        {/* Bound terms check (closing rigor): renders only when this policy
            has a 'bound' submission event; diffs what was bound against the
            live blob values so issued-policy drift gets caught. */}
        {policyId && (
          <BoundTermsCard
            policyId={policyId}
            policy={(policy as unknown as Record<string, unknown>) ?? null}
          />
        )}

        {/* Workers' Comp Details Section */}
        {isWorkersComp && policyId && coiAccountId && (
          <ErrorBoundary level="component" resetOnPropsChange>
            <PolicyCoveragePanel
              accountId={coiAccountId}
              policyId={policyId}
              lineKey="wc"
              onFillFromDocument={() => armCoverageExtract('wc')}
            />
          </ErrorBoundary>
        )}

        {/* General Liability details: extraction target + the blob get_master_coi
            reads (cgl_details), so a populated section here = COI-ready limits. */}
        {isCGL && policyId && coiAccountId && (
          <ErrorBoundary level="component" resetOnPropsChange>
            <PolicyCoveragePanel
              accountId={coiAccountId}
              policyId={policyId}
              lineKey="gl"
              onFillFromDocument={() => armCoverageExtract('gl')}
            />
          </ErrorBoundary>
        )}

        {/* Property details (Phase 3): the blob get_master_coi reads for the
            property line; extraction target for uploaded property policies. */}
        {isProperty && policyId && coiAccountId && (
          <ErrorBoundary level="component" resetOnPropsChange>
            <PolicyCoveragePanel
              accountId={coiAccountId}
              policyId={policyId}
              lineKey="property"
              onFillFromDocument={() => armCoverageExtract('property')}
            />
          </ErrorBoundary>
        )}

        {/* Umbrella details (Phase 5): the blob get_master_coi reads for the
            umbrella line; extraction target for uploaded umbrella policies. */}
        {isUmbrella && policyId && coiAccountId && (
          <ErrorBoundary level="component" resetOnPropsChange>
            <PolicyCoveragePanel
              accountId={coiAccountId}
              policyId={policyId}
              lineKey="umbrella"
              onFillFromDocument={() => armCoverageExtract('umbrella')}
            />
          </ErrorBoundary>
        )}

        {/* Commercial Auto details (Phase 6): the blob get_master_coi reads
            for the auto line; extraction target for uploaded BAP policies. */}
        {isAuto && policyId && coiAccountId && (
          <ErrorBoundary level="component" resetOnPropsChange>
            <PolicyCoveragePanel
              accountId={coiAccountId}
              policyId={policyId}
              lineKey="auto"
              onFillFromDocument={() => armCoverageExtract('auto')}
            />
          </ErrorBoundary>
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

      </div>

      {/* Modals */}
      {policy?.account && (
        <>
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
              } else if (line === 'umbrella') {
                extractUmbrella.mutate({ documentId, policyId }, { onSuccess: invalidateMasterCoi });
              } else if (line === 'auto') {
                extractBAP.mutate({ documentId, policyId }, { onSuccess: invalidateMasterCoi });
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