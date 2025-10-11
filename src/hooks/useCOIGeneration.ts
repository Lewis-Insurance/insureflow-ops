import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { generateCOIPDF, COIPDFData, ExportOptions } from '@/lib/pdfGenerator';
import { useCOI } from './useCOI';
import { TicketCOIMetadata } from '@/types/coi';
import { useAuth } from './useAuth';

export function useCOIGeneration() {
  const { toast } = useToast();
  const { updateCOI } = useCOI();
  const { user } = useAuth();

  const generateAndAttachCOI = async (
    ticketId: string,
    coiId: string,
    coiData: COIPDFData,
    exportOptions?: Partial<ExportOptions>
  ): Promise<string | null> => {
    try {
      // Generate PDF with options
      const pdfBlob = generateCOIPDF(coiData, {
        format: 'blob',
        ...exportOptions,
      }) as Blob;

      // Upload to Supabase Storage
      const fileName = `coi_${coiData.certificate_number}_${Date.now()}.pdf`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('certificates')
        .upload(fileName, pdfBlob, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('certificates')
        .getPublicUrl(fileName);

      // Update COI record with document URL
      await updateCOI({
        id: coiId,
        updates: {
          document_url: publicUrl,
          status: 'issued',
        },
      });

      // Update ticket metadata with proper typing
      const coiMetadata: Record<string, any> = {
        coi_generated: true,
        coi_url: publicUrl,
        coi_number: coiData.certificate_number,
        coi_generated_at: new Date().toISOString(),
        coi_version: 1,
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

      toast({
        title: 'COI Generated Successfully',
        description: `Certificate ${coiData.certificate_number} has been created and attached`,
      });

      return publicUrl;
    } catch (error: any) {
      console.error('COI generation error:', error);
      toast({
        title: 'Failed to Generate COI',
        description: error.message || 'An error occurred while generating the certificate',
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
  };
}
