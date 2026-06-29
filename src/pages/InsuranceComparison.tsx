import { AppLayout } from '@/components/layout/AppLayout';
import { DocumentDropZone } from '@/components/comparison/DocumentDropZone';
import { ComparisonReport } from '@/components/comparison/ComparisonReport';
import { Button } from '@/components/ui/button';
import { useInsuranceComparison } from '@/hooks/useInsuranceComparison';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Scale, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function InsuranceComparison() {
  const {
    isProcessing,
    uploadedFiles1,
    uploadedFiles2,
    option1,
    option2,
    comparison,
    error,
    uploadFiles,
    processAllDocuments,
    reset
  } = useInsuranceComparison();
  
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOption1Upload = async (files: File[]) => {
    uploadFiles(files, 1);
  };

  const handleOption2Upload = async (files: File[]) => {
    uploadFiles(files, 2);
  };
  
  // Upload to Supabase Storage and return object paths
  const uploadFilesToStorage = async (files: File[]): Promise<string[]> => {
    const uploadPromises = files.map(async (file, index) => {
      const uniqueId = crypto.randomUUID();
      const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `insurance-comparison/${Date.now()}-${index}-${uniqueId}-${sanitized}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          contentType: file.type || 'application/pdf',
          cacheControl: '3600',
          upsert: false,
        });
      if (uploadError) throw uploadError;
      return filePath;
    });
    return Promise.all(uploadPromises);
  };
  
  const handleSubmitComparison = async () => {
    if (uploadedFiles1.length === 0 || uploadedFiles2.length === 0) {
      toast({ title: 'Missing documents', description: 'Upload files for both options', variant: 'destructive' });
      return;
    }
    
    setIsSubmitting(true);
    try {
      // Get or create default workspace (allow anonymous)
      let { data: workspaces } = await supabase
        .from('workspaces')
        .select('id')
        .limit(1)
        .maybeSingle();
      
      let workspaceId = workspaces?.id;
      
      if (!workspaceId) {
        const { data: { user } } = await supabase.auth.getUser();
        
        const { data: newWorkspace, error: wsError } = await supabase
          .from('workspaces')
          .insert({
            name: 'Default Workspace',
            description: 'Insurance comparison workspace',
            created_by: user?.id || null, // Allow null for anonymous users
          })
          .select()
          .single();
        
        if (wsError) throw wsError;
        workspaceId = newWorkspace.id;
      }

      // Ensure files are uploaded to storage and collect paths
      const [option1Paths, option2Paths] = await Promise.all([
        uploadFilesToStorage(uploadedFiles1),
        uploadFilesToStorage(uploadedFiles2),
      ]);

      // Submit comparison job to background worker
      const { data: submitData, error: jobError } = await supabase.functions.invoke<{ job: { id: string } }>('submit-comparison', {
        body: {
          workspaceId,
          accountId: null,
          title: `${uploadedFiles1[0]?.name || 'Option 1'} vs ${uploadedFiles2[0]?.name || 'Option 2'}`,
          option1Paths,
          option2Paths,
        },
      });

      if (jobError) throw jobError;

      const jobId = submitData?.job?.id;
      if (!jobId) throw new Error('Failed to get job id');

      // Trigger the worker to process immediately, then poll until done
      await supabase.functions.invoke('worker-comparison');

      toast({ title: 'Processing…', description: 'Analyzing both options. This may take ~30-60s.' });

      // Poll job status and navigate to report when ready
      let attempts = 0;
      let sessionId: string | null = null;
      while (attempts < 40 && !sessionId) {
        const { data: jobRow, error: jobFetchError } = await supabase
          .from('jobs')
          .select('status, result_session_id, error_message')
          .eq('id', jobId)
          .maybeSingle();
        if (jobFetchError) throw jobFetchError;
        if (jobRow?.result_session_id) {
          sessionId = jobRow.result_session_id;
          break;
        }
        if (jobRow?.status === 'failed') {
          throw new Error(jobRow.error_message || 'Background job failed');
        }
        await new Promise((r) => setTimeout(r, 2000));
        attempts++;
      }

      if (!sessionId) {
        toast({ title: 'Still processing', description: 'You will see the report in Workspace when ready.' });
        navigate(`/workspace/${workspaceId}`);
        return;
      }

      navigate(`/comparison-report/${sessionId}`);
      return;
    } catch (error) {
      console.error('Submission error:', error);
      toast({ title: 'Error', description: 'Failed to submit comparison job', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1100px] space-y-6 p-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold uppercase tracking-tight text-cc-text-primary">
              <Scale className="h-6 w-6 text-cc-text-secondary" aria-hidden="true" />
              Comparison analysis
            </h1>
            <p className="mt-1 text-sm text-cc-text-muted">
              Upload two options to generate a detailed coverage and premium analysis.
            </p>
          </div>

          {(option1 || option2) && (
            <Button
              variant="outline"
              onClick={reset}
              className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
            >
              <RotateCcw className="h-4 w-4" />
              Start over
            </Button>
          )}
        </header>

        {!comparison ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <DocumentDropZone
                title="Option 1"
                description="Upload quotes or policies for the first option"
                onFilesDropped={handleOption1Upload}
                isProcessing={isProcessing}
                processedFile={
                  option1
                    ? `${option1.carrier} - ${option1.policyNumber || 'Quote'}`
                    : uploadedFiles1.length > 0
                    ? `${uploadedFiles1.length} file(s) uploaded`
                    : undefined
                }
                error={error || undefined}
              />

              <DocumentDropZone
                title="Option 2"
                description="Upload quotes or policies for the second option"
                onFilesDropped={handleOption2Upload}
                isProcessing={isProcessing}
                processedFile={
                  option2
                    ? `${option2.carrier} - ${option2.policyNumber || 'Quote'}`
                    : uploadedFiles2.length > 0
                    ? `${uploadedFiles2.length} file(s) uploaded`
                    : undefined
                }
                error={error || undefined}
              />
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              {!option1 && !option2 && (uploadedFiles1.length > 0 || uploadedFiles2.length > 0) && (
                <Button
                  data-primary
                  size="lg"
                  onClick={processAllDocuments}
                  disabled={uploadedFiles1.length === 0 || uploadedFiles2.length === 0 || isProcessing}
                  className="min-w-[200px] gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
                >
                  {isProcessing ? 'Processing' : 'Process documents'}
                </Button>
              )}

              {uploadedFiles1.length > 0 && uploadedFiles2.length > 0 && !comparison && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleSubmitComparison}
                  disabled={isSubmitting}
                  className="min-w-[200px] gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                >
                  <Scale className="h-4 w-4" />
                  {isSubmitting ? 'Submitting' : 'Run in background'}
                </Button>
              )}
            </div>
          </>
        ) : (
          <ComparisonReport comparison={comparison} />
        )}
      </div>
    </AppLayout>
  );
}
