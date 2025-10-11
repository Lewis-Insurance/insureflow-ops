import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { generateCOIPDF, COIPDFData, ExportOptions } from '@/lib/pdfGenerator';
import { useCOI } from './useCOI';
import { TicketCOIMetadata, GenerationProgress, COIVersion } from '@/types/coi';
import { useAuth } from './useAuth';
import { retry } from '@/lib/utils/retry';

export function useCOIGeneration() {
  const { toast } = useToast();
  const { updateCOI } = useCOI();
  const { user } = useAuth();
  const [progress, setProgress] = useState<GenerationProgress | null>(null);

  /**
   * Upload PDF with retry logic
   */
  const uploadWithRetry = async (
    fileName: string,
    pdfBlob: Blob,
    maxAttempts: number = 3
  ) => {
    return retry(
      async () => {
        const { data, error } = await supabase.storage
          .from('certificates')
          .upload(fileName, pdfBlob, {
            contentType: 'application/pdf',
            upsert: false,
          });

        if (error) throw error;
        return data;
      },
      {
        maxAttempts,
        delay: 1000,
        backoffMultiplier: 2,
        onRetry: (attempt, error) => {
          console.log(`Upload retry attempt ${attempt}/${maxAttempts}:`, error.message);
          toast({
            title: 'Retrying upload...',
            description: `Attempt ${attempt} of ${maxAttempts}`,
          });
        },
      }
    );
  };

  /**
   * Cleanup failed uploads
   */
  const cleanupFailedUpload = async (fileName: string) => {
    try {
      const { error } = await supabase.storage
        .from('certificates')
        .remove([fileName]);

      if (error) {
        console.error('Failed to cleanup file:', fileName, error);
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  };

  const generateAndAttachCOI = async (
    ticketId: string,
    coiId: string,
    coiData: COIPDFData,
    exportOptions?: Partial<ExportOptions>,
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<string | null> => {
    const updateProgress = (progressData: GenerationProgress) => {
      setProgress(progressData);
      onProgress?.(progressData);
    };

    try {
      // Check for existing versions if this is a revision
      let version = 1;
      if (exportOptions?.isRevision) {
        const { data: existingCOI } = await supabase
          .from('certificates_of_insurance')
          .select('versions, current_version')
          .eq('id', coiId)
          .maybeSingle();

        if (existingCOI?.versions && Array.isArray(existingCOI.versions)) {
          version = existingCOI.versions.length + 1;
        } else if (existingCOI?.current_version) {
          version = existingCOI.current_version + 1;
        }
      }

      // Generate filename with version
      const fileName = `coi_${coiData.certificate_number}_v${version}_${Date.now()}.pdf`;

      // Step 1: Generate PDF
      updateProgress({
        step: 'generating',
        percentage: 25,
        message: 'Generating PDF document...'
      });

      const pdfBlob = generateCOIPDF(coiData, {
        format: 'blob',
        ...exportOptions,
      }) as Blob;

      // Step 2: Upload
      updateProgress({
        step: 'uploading',
        percentage: 50,
        message: 'Uploading certificate...'
      });

      const uploadData = await uploadWithRetry(fileName, pdfBlob);

      if (!uploadData) {
        throw new Error('Upload failed - no data returned');
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('certificates')
        .getPublicUrl(fileName);

      // Step 3: Update records with version tracking
      updateProgress({
        step: 'updating',
        percentage: 75,
        message: 'Updating records...'
      });

      // Create version data
      const versionData: COIVersion = {
        version,
        url: publicUrl,
        created_at: new Date().toISOString(),
        created_by: user?.id || 'system',
        changes: exportOptions?.revisionNote,
      };

      // Append version to history
      await supabase.rpc('append_coi_version', {
        p_coi_id: coiId,
        p_version_data: versionData as any,
      });

      // Update COI record with document URL and current version
      await updateCOI({
        id: coiId,
        updates: {
          document_url: publicUrl,
          status: 'issued',
          current_version: version,
        },
      });

      // Update ticket metadata with proper typing and version info
      const coiMetadata: Record<string, any> = {
        coi_generated: true,
        coi_url: publicUrl,
        coi_number: coiData.certificate_number,
        coi_generated_at: new Date().toISOString(),
        coi_version: version,
        coi_generated_by: user?.id || null,
      };

      const { error: ticketError } = await supabase
        .from('tickets')
        .update({
          metadata: coiMetadata,
        })
        .eq('id', ticketId);

      if (ticketError) {
        console.error('Ticket update error:', ticketError);
        // Don't throw - COI was created successfully, ticket metadata is optional
      }

      // Step 4: Completed
      updateProgress({
        step: 'completed',
        percentage: 100,
        message: 'Certificate generated successfully!'
      });

      toast({
        title: 'COI Generated Successfully',
        description: `Certificate ${coiData.certificate_number} has been created and attached`,
      });

      return publicUrl;
    } catch (error: any) {
      console.error('COI generation error:', error);

      // Reset progress on error
      setProgress(null);

      // Cleanup failed upload if it exists (use try-catch since fileName might not be defined in early errors)
      try {
        const fileName = `coi_${coiData.certificate_number}_${Date.now()}.pdf`;
        await cleanupFailedUpload(fileName);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }

      toast({
        title: 'Failed to Generate COI',
        description: error.message || 'An error occurred while generating the certificate',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const previewCOI = async (
    coiData: COIPDFData,
    exportOptions?: Partial<ExportOptions>
  ): Promise<string> => {
    try {
      // Generate as base64 for preview
      const pdfBase64 = generateCOIPDF(coiData, {
        ...exportOptions,
        format: 'base64',
      }) as string;

      // Open in new tab for preview
      const previewWindow = window.open('', '_blank');
      if (previewWindow) {
        previewWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>COI Preview - ${coiData.certificate_number}</title>
              <style>
                body { margin: 0; padding: 0; overflow: hidden; }
                iframe { width: 100%; height: 100vh; border: none; }
              </style>
            </head>
            <body>
              <iframe src="${pdfBase64}" type="application/pdf"></iframe>
            </body>
          </html>
        `);
        previewWindow.document.close();
      } else {
        throw new Error('Failed to open preview window. Please check your popup blocker settings.');
      }

      toast({
        title: 'Preview Opened',
        description: 'COI preview opened in new tab',
      });

      return pdfBase64;
    } catch (error: any) {
      console.error('Preview error:', error);
      toast({
        title: 'Preview Failed',
        description: error.message || 'Failed to generate preview',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const downloadCOI = async (documentUrl: string, certificateNumber: string) => {
    try {
      const response = await fetch(documentUrl);
      const blob = await response.blob();
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `COI-${certificateNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Download Started',
        description: 'Your certificate is being downloaded',
      });
    } catch (error: any) {
      console.error('Download error:', error);
      toast({
        title: 'Download Failed',
        description: error.message || 'Failed to download certificate',
        variant: 'destructive',
      });
    }
  };

  return {
    generateAndAttachCOI,
    downloadCOI,
    previewCOI,
    progress,
  };
}
