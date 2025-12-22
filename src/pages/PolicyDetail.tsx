import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Calendar, DollarSign, Building, Edit, ArrowLeft, FileText, Users, Award } from 'lucide-react';
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
import { Loader2, Sparkles, Anchor, Shield as ShieldIcon, Lock, Briefcase } from 'lucide-react';

export default function PolicyDetail() {
  const { policyId } = useParams<{ policyId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [editPolicyOpen, setEditPolicyOpen] = useState(false);

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
        throw new Error(`Failed to fetch policy: ${error.message}`);
      }

      return data;
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
              <Button onClick={() => navigate('/policies')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Policies
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
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Premium</label>
                  <div className="flex items-center gap-1 text-lg font-semibold">
                    <DollarSign className="h-4 w-4" />
                    <span>{formatCurrency(policy.premium)}</span>
                  </div>
                  {policy.billing_frequency && (
                    <p className="text-sm text-muted-foreground">
                      / {policy.billing_frequency}
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Effective Date</label>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {policy.effective_date 
                        ? new Date(policy.effective_date).toLocaleDateString()
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
                        ? new Date(policy.expiration_date).toLocaleDateString()
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Billing Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Billing Method</label>
                  <p>{policy.billing_method || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Payment Type</label>
                  <p>{policy.payment_type || 'N/A'}</p>
                </div>
              </div>
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
          <AddNoteModal
            open={addNoteOpen}
            onOpenChange={setAddNoteOpen}
            accountId={policy.account.id}
          />
          <AddTaskModal
            open={addTaskOpen}
            onOpenChange={setAddTaskOpen}
            accountId={policy.account.id}
          />
          <UploadDocModal
            open={uploadDocOpen}
            onOpenChange={setUploadDocOpen}
            accountId={policy.account.id}
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
              policy_term: policy.policy_term,
              status: policy.status,
              payment_type: policy.payment_type
            } : null}
            onSuccess={refetch}
          />
        </>
      )}
    </AppLayout>
  );
}