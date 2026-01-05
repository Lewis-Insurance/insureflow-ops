import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, GitMerge, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CustomerMergeSelector } from '@/components/customers/CustomerMergeSelector';
import { MergePreview, MergeSummary } from '@/components/customers/MergePreview';
import { MergeConfirmDialog } from '@/components/customers/MergeConfirmDialog';
import { useCustomerMerge } from '@/hooks/useCustomerMerge';
import { AppLayout } from '@/components/layout/AppLayout';

export default function MergeCustomersPage() {
  const navigate = useNavigate();
  const { mergeCustomers, isMerging } = useCustomerMerge();

  const [selectedId1, setSelectedId1] = useState<string | null>(null);
  const [selectedId2, setSelectedId2] = useState<string | null>(null);
  const [masterId, setMasterId] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const bothSelected = selectedId1 && selectedId2 && selectedId1 !== selectedId2;
  const canMerge = bothSelected && masterId;

  const mergedId = masterId === selectedId1 ? selectedId2 : selectedId1;

  const handleMerge = async () => {
    if (!masterId || !mergedId) return;

    try {
      const result = await mergeCustomers({ masterId, mergedId });
      setShowConfirmDialog(false);

      // Navigate to the master account
      navigate(`/customers/${result.masterId}`);
    } catch (error) {
      // Error handled by the hook
    }
  };

  const handleSelectMaster = (accountId: string) => {
    setMasterId(accountId);
  };

  const handleReset = () => {
    setSelectedId1(null);
    setSelectedId2(null);
    setMasterId(null);
  };

  return (
    <AppLayout>
      <div className="container max-w-5xl py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitMerge className="h-6 w-6" />
              Merge Customers
            </h1>
            <p className="text-muted-foreground">
              Combine duplicate customer records into a single account
            </p>
          </div>
        </div>

        {/* Step 1: Select Customers */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Step 1: Select Customers</CardTitle>
            <CardDescription>
              Search and select two customer records to merge
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerMergeSelector
              selectedId1={selectedId1}
              selectedId2={selectedId2}
              onSelect1={setSelectedId1}
              onSelect2={setSelectedId2}
            />
          </CardContent>
        </Card>

        {/* Step 2: Compare & Select Master */}
        {bothSelected && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Step 2: Compare & Select Master</CardTitle>
              <CardDescription>
                Review the details and click on the customer that should be kept as the master record
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MergePreview
                accountId1={selectedId1}
                accountId2={selectedId2}
                masterId={masterId}
                onSelectMaster={handleSelectMaster}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 3: Review & Confirm */}
        {canMerge && mergedId && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Step 3: Review & Confirm</CardTitle>
              <CardDescription>
                Review what will happen when you merge these customers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <MergeSummary masterId={masterId} mergedId={mergedId} />

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Please double-check that you have selected the correct master account.
                  The merged account will be archived and cannot be easily restored.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={handleReset}>
            Reset
          </Button>
          <Button
            onClick={() => setShowConfirmDialog(true)}
            disabled={!canMerge || isMerging}
            className="bg-amber-600 hover:bg-amber-700"
          >
            <GitMerge className="mr-2 h-4 w-4" />
            Merge Customers
          </Button>
        </div>

        {/* Confirmation Dialog */}
        <MergeConfirmDialog
          open={showConfirmDialog}
          onOpenChange={setShowConfirmDialog}
          masterId={masterId}
          mergedId={mergedId}
          onConfirm={handleMerge}
          isLoading={isMerging}
        />
      </div>
    </AppLayout>
  );
}
