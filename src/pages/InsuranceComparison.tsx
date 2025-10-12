import { AppLayout } from '@/components/layout/AppLayout';
import { DocumentDropZone } from '@/components/comparison/DocumentDropZone';
import { ComparisonReport } from '@/components/comparison/ComparisonReport';
import { Button } from '@/components/ui/button';
import { useInsuranceComparison } from '@/hooks/useInsuranceComparison';
import { Scale, RotateCcw } from 'lucide-react';

export default function InsuranceComparison() {
  const {
    isProcessing,
    option1,
    option2,
    comparison,
    error,
    processDocuments,
    compareOptions,
    reset
  } = useInsuranceComparison();

  const handleOption1Upload = async (files: File[]) => {
    await processDocuments(files, 1);
  };

  const handleOption2Upload = async (files: File[]) => {
    await processDocuments(files, 2);
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Scale className="h-8 w-8" />
              Insurance Comparison Tool
            </h1>
            <p className="text-muted-foreground mt-2">
              Upload insurance documents to generate a detailed comparison analysis
            </p>
          </div>
          
          {(option1 || option2) && (
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Start Over
            </Button>
          )}
        </div>

        {!comparison ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DocumentDropZone
                title="Option 1"
                description="Upload quotes or policies for the first option"
                onFilesDropped={handleOption1Upload}
                isProcessing={isProcessing}
                processedFile={option1 ? `${option1.carrier} - ${option1.policyNumber || 'Quote'}` : undefined}
                error={error || undefined}
              />
              
              <DocumentDropZone
                title="Option 2"
                description="Upload quotes or policies for the second option"
                onFilesDropped={handleOption2Upload}
                isProcessing={isProcessing}
                processedFile={option2 ? `${option2.carrier} - ${option2.policyNumber || 'Quote'}` : undefined}
                error={error || undefined}
              />
            </div>

            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={compareOptions}
                disabled={!option1 || !option2 || isProcessing}
                className="min-w-[200px]"
              >
                <Scale className="h-4 w-4 mr-2" />
                {isProcessing ? 'Processing...' : 'Compare Options'}
              </Button>
            </div>
          </>
        ) : (
          <ComparisonReport comparison={comparison} />
        )}
      </div>
    </AppLayout>
  );
}
