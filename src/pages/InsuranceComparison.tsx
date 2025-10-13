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
      const { error: jobError } = await supabase.functions.invoke('submit-comparison', {
        body: {
          workspaceId,
          accountId: null,
          title: `${uploadedFiles1[0]?.name || 'Option 1'} vs ${uploadedFiles2[0]?.name || 'Option 2'}`,
          option1Paths,
          option2Paths,
        },
      });

      if (jobError) throw jobError;

      toast({ title: 'Job submitted', description: 'Processing in background' });
      navigate(`/workspace/${workspaceId}`);
    } catch (error) {
      console.error('Submission error:', error);
      toast({ title: 'Error', description: 'Failed to submit comparison job', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
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

            <div className="flex justify-center gap-4">
              {!option1 && !option2 && (uploadedFiles1.length > 0 || uploadedFiles2.length > 0) && (
                <Button
                  size="lg"
                  onClick={processAllDocuments}
                  disabled={uploadedFiles1.length === 0 || uploadedFiles2.length === 0 || isProcessing}
                  className="min-w-[200px]"
                >
                  {isProcessing ? 'Processing...' : 'Process Documents'}
                </Button>
              )}
              
              {(uploadedFiles1.length > 0 && uploadedFiles2.length > 0 && !comparison) && (
                <Button
                  size="lg"
                  onClick={handleSubmitComparison}
                  disabled={isSubmitting}
                  className="min-w-[200px]"
                >
                  <Scale className="h-4 w-4 mr-2" />
                  {isSubmitting ? 'Submitting...' : 'Run in background'}
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
