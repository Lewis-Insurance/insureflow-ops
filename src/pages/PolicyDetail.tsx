import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Calendar, DollarSign, Building, Edit, ArrowLeft, FileText, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AddNoteModal } from '@/components/customers/AddNoteModal';
import { AddTaskModal } from '@/components/customers/AddTaskModal';
import { EditPolicyModal } from '@/components/customers/EditPolicyModal';
import { UploadDocModal } from '@/components/customers/UploadDocModal';

export default function PolicyDetail() {
  const { policyId } = useParams<{ policyId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [editPolicyOpen, setEditPolicyOpen] = useState(false);

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