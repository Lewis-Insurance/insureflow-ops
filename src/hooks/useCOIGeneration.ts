import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { generateCOIPDF, COIPDFData, ExportOptions } from '@/lib/pdfGenerator';
import { useCOI } from './useCOI';
import { TicketCOIMetadata, GenerationProgress, COIVersion, BatchCOIItem, BatchCOIResult, COITemplate } from '@/types/coi';
import { useAuth } from './useAuth';
import { retry } from '@/lib/utils/retry';
import { COIQueue } from '@/lib/utils/queue';
import { validateCOIData, validateRecipientEmail } from '@/lib/validators/coi';

enum COIErrorType {
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK',
  STORAGE = 'STORAGE',
  PERMISSION = 'PERMISSION',
  CANCELLED = 'CANCELLED',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Type guard for COI version data from database
 */
const isCOIVersion = (data: any): data is COIVersion => {
  return (
    typeof data === 'object' &&
    typeof data.version === 'number' &&
    typeof data.url === 'string' &&
    typeof data.created_at === 'string'
  );
};

/**
 * Categorize error for better user messaging
 */
const categorizeError = (error: any): COIErrorType => {
  if (error.message?.includes('cancelled') || error.name === 'AbortError') return COIErrorType.CANCELLED;
  if (error.message?.includes('validation') || error.message?.includes('Validation')) return COIErrorType.VALIDATION;
  if (error.code === 'storage-unauthorized' || error.code === '42501') return COIErrorType.PERMISSION;
  if (error.code === 'PGRST301') return COIErrorType.PERMISSION;
  if (error.message?.includes('fetch') || error.message?.includes('network')) return COIErrorType.NETWORK;
  if (error.message?.includes('upload') || error.message?.includes('storage')) return COIErrorType.STORAGE;
  return COIErrorType.UNKNOWN;
};

/**
 * Get user-friendly error message
 */
const getErrorMessage = (errorType: COIErrorType): string => {
  const messages = {
    [COIErrorType.VALIDATION]: 'Please check the form and try again',
    [COIErrorType.NETWORK]: 'Connection issue. Please check your internet',
    [COIErrorType.STORAGE]: 'Storage issue. Please try again later',
    [COIErrorType.PERMISSION]: "You don't have permission for this action",
    [COIErrorType.CANCELLED]: 'Operation was cancelled',
    [COIErrorType.UNKNOWN]: 'An unexpected error occurred',
  };
  return messages[errorType];
};

export function useCOIGeneration() {
  const { toast } = useToast();
  const { updateCOI } = useCOI();
  const { user } = useAuth();
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingGenerations = useRef<Map<string, Promise<string | null>>>(new Map());

  /**
   * Cleanup on unmount to prevent memory leaks
   */
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setProgress(null);
      setIsGenerating(false);
      pendingGenerations.current.clear();
    };
  }, []);

  /**
   * Upload PDF with retry logic and abort signal support
   */
  const uploadWithRetry = async (
    fileName: string,
    pdfBlob: Blob,
    maxAttempts: number = 3,
    signal?: AbortSignal
  ) => {
    return retry(
      async () => {
        if (signal?.aborted) {
          throw new Error('Generation cancelled');
        }

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

  /**
   * Log COI activity for audit trail
   */
  const logCOIActivity = async (
    action: 'generated' | 'downloaded' | 'emailed' | 'previewed' | 'revised' | 'cancelled',
    coiId: string,
    metadata?: Record<string, any>
  ) => {
    try {
      await supabase.from('coi_audit_log').insert({
        coi_id: coiId,
        action,
        user_id: user?.id,
        metadata: metadata || {},
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to log COI activity:', error);
      // Don't throw - logging is non-critical
    }
  };

  const performGeneration = async (
    ticketId: string,
    coiId: string,
    coiData: COIPDFData,
    exportOptions?: Partial<ExportOptions>,
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<string | null> => {
    // Validate data before generation
    const validationErrors = validateCOIData(coiData);
    if (validationErrors.length > 0) {
      toast({
        title: 'Validation Failed',
        description: validationErrors.join(', '),
        variant: 'destructive',
      });
      throw new Error('Validation failed: ' + validationErrors.join(', '));
    }

    // Create new abort controller for this generation
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const updateProgress = (progressData: GenerationProgress) => {
      setProgress(progressData);
      onProgress?.(progressData);
    };

    setIsGenerating(true);

    try {
      // Check for cancellation
      if (signal.aborted) {
        throw new Error('Generation cancelled');
      }

      // Check for existing versions if this is a revision
      let version = 1;
      if (exportOptions?.isRevision) {
        const { data: existingCOI } = await supabase
          .from('certificates_of_insurance')
          .select('versions, current_version')
          .eq('id', coiId)
          .maybeSingle();

        if (existingCOI?.versions && Array.isArray(existingCOI.versions)) {
          const validVersions = existingCOI.versions.filter(isCOIVersion);
          version = validVersions.length + 1;
        } else if (existingCOI?.current_version) {
          version = existingCOI.current_version + 1;
        }
      }

      // Generate filename with version
      const fileName = `coi_${coiData.certificate_number}_v${version}_${Date.now()}.pdf`;

      // Step 1: Generate PDF
      if (signal.aborted) {
        throw new Error('Generation cancelled');
      }

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
      if (signal.aborted) {
        throw new Error('Generation cancelled');
      }

      updateProgress({
        step: 'uploading',
        percentage: 50,
        message: 'Uploading certificate...'
      });

      const uploadData = await uploadWithRetry(fileName, pdfBlob, 3, signal);

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

      // Log activity
      await logCOIActivity('generated', coiId, {
        version,
        certificate_number: coiData.certificate_number,
      });

      toast({
        title: 'COI Generated Successfully',
        description: `Certificate ${coiData.certificate_number} has been created and attached`,
      });

      return publicUrl;
    } catch (error: any) {
      console.error('COI generation error:', error);

      const errorType = categorizeError(error);

      // Check if cancelled
      if (errorType === COIErrorType.CANCELLED) {
        await logCOIActivity('cancelled', coiId);
        toast({
          title: 'Generation Cancelled',
          description: 'COI generation was cancelled',
        });
        return null;
      }

      // Reset progress and generating state on error
      setProgress(null);
      setIsGenerating(false);

      // Cleanup failed upload if it exists (use try-catch since fileName might not be defined in early errors)
      try {
        const fileName = `coi_${coiData.certificate_number}_${Date.now()}.pdf`;
        await cleanupFailedUpload(fileName);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }

      toast({
        title: 'Failed to Generate COI',
        description: getErrorMessage(errorType),
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  const generateAndAttachCOI = async (
    ticketId: string,
    coiId: string,
    coiData: COIPDFData,
    exportOptions?: Partial<ExportOptions>,
    onProgress?: (progress: GenerationProgress) => void
  ): Promise<string | null> => {
    const key = `${coiId}-${coiData.certificate_number}`;

    // Check if already generating to prevent duplicate requests
    if (pendingGenerations.current.has(key)) {
      console.log('Generation already in progress for', key);
      return pendingGenerations.current.get(key)!;
    }

    // Start new generation
    const generationPromise = performGeneration(
      ticketId,
      coiId,
      coiData,
      exportOptions,
      onProgress
    ).finally(() => {
      pendingGenerations.current.delete(key);
    });

    pendingGenerations.current.set(key, generationPromise);
    return generationPromise;
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

      // Log preview activity
      const coiExists = await checkCOIExists(coiData.certificate_number);
      if (coiExists?.id) {
        await logCOIActivity('previewed', coiExists.id);
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

  const cancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
      setProgress(null);
      toast({
        title: 'Cancelling...',
        description: 'COI generation is being cancelled',
      });
    }
  };

  const batchGenerateCOIs = async (
    coiDataList: BatchCOIItem[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<BatchCOIResult[]> => {
    const results: BatchCOIResult[] = [];
    const total = coiDataList.length;

    for (let i = 0; i < coiDataList.length; i++) {
      const item = coiDataList[i];

      try {
        const url = await generateAndAttachCOI(
          item.ticketId,
          item.coiId,
          item.data
        );

        results.push({ id: item.coiId, url });
        
        // Update progress
        onProgress?.(i + 1, total);
      } catch (error: any) {
        console.error(`Failed to generate COI for ${item.coiId}:`, error);
        results.push({
          id: item.coiId,
          url: null,
          error: error.message || 'Generation failed',
        });
        
        // Update progress even on error
        onProgress?.(i + 1, total);
      }
    }

    // Summary toast
    const successful = results.filter(r => r.url).length;
    const failed = results.length - successful;

    toast({
      title: 'Batch Generation Complete',
      description: `${successful} succeeded${failed > 0 ? `, ${failed} failed` : ''}`,
      variant: failed > 0 ? 'destructive' : 'default',
    });

    return results;
  };

  const checkStorageQuota = async (): Promise<{
    used: number;
    limit: number;
    percentage: number;
  }> => {
    try {
      const { data, error } = await supabase
        .storage
        .from('certificates')
        .list('', { limit: 1000 });

      if (error) throw error;

      // Calculate total size
      const totalSize = data.reduce((sum, file) => sum + (file.metadata?.size || 0), 0);
      const limit = 1024 * 1024 * 1024; // 1GB limit example

      return {
        used: totalSize,
        limit,
        percentage: (totalSize / limit) * 100,
      };
    } catch (error) {
      console.error('Error checking storage quota:', error);
      return { used: 0, limit: 0, percentage: 0 };
    }
  };

  const applyTemplate = async (
    templateId: string,
    overrides: Record<string, any> = {}
  ): Promise<Record<string, any>> => {
    const { data: template, error } = await supabase
      .from('coi_templates')
      .select('*')
      .eq('id', templateId)
      .maybeSingle();

    if (error || !template) {
      throw new Error('Template not found');
    }

    const coverageDefaults = (template.coverage_defaults as Record<string, any>) || {};
    const overrideCoverage = (overrides.coverage_details as Record<string, any>) || {};

    const result: Record<string, any> = {
      ...coverageDefaults,
      ...overrides,
      coverage_details: {
        ...coverageDefaults,
        ...overrideCoverage,
      },
    };

    return result;
  };

  const useCOICache = (certificateNumber?: string) => {
    return useQuery({
      queryKey: ['coi-cache', certificateNumber],
      queryFn: () => checkCOIExists(certificateNumber!),
      enabled: !!certificateNumber,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    });
  };

  const generateAndEmailCOI = async (
    ticketId: string,
    coiId: string,
    coiData: COIPDFData,
    recipientEmail: string,
    exportOptions?: Partial<ExportOptions>
  ): Promise<void> => {
    // Validate and sanitize email
    const emailValidation = validateRecipientEmail(recipientEmail);
    if (!emailValidation.valid) {
      toast({
        title: 'Invalid Email',
        description: emailValidation.error || 'Invalid email address',
        variant: 'destructive',
      });
      throw new Error(emailValidation.error || 'Invalid email address');
    }

    try {
      // Step 1: Generate and upload COI
      const publicUrl = await generateAndAttachCOI(
        ticketId,
        coiId,
        coiData,
        exportOptions
      );

      if (!publicUrl) {
        throw new Error('Failed to generate COI');
      }

      // Step 2: Send email via edge function
      const { data, error } = await supabase.functions.invoke('send-coi-email', {
        body: {
          to: emailValidation.sanitized,
          certificateNumber: coiData.certificate_number,
          certificateUrl: publicUrl,
          holderName: coiData.certificate_holder_name,
        },
      });

      if (error) throw error;

      // Step 3: Update ticket metadata with email status
      const { error: updateError } = await supabase
        .from('tickets')
        .update({
          metadata: {
            coi_emailed_to: recipientEmail,
            coi_emailed_at: new Date().toISOString(),
          } as any,
        })
        .eq('id', ticketId);

      if (updateError) {
        console.error('Failed to update ticket metadata:', updateError);
        // Don't throw - email was sent successfully
      }

      // Log email activity
      await logCOIActivity('emailed', coiId, {
        recipient: emailValidation.sanitized,
      });

      toast({
        title: 'COI Sent Successfully',
        description: `Certificate emailed to ${emailValidation.sanitized}`,
      });
    } catch (error: any) {
      console.error('Email delivery error:', error);
      toast({
        title: 'Email Failed',
        description: error.message || 'Failed to email certificate',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const batchGenerateCOIsWithConcurrency = async (
    coiDataList: BatchCOIItem[],
    options?: {
      concurrency?: number;
      onProgress?: (completed: number, total: number) => void;
      onItemComplete?: (result: BatchCOIResult) => void;
    }
  ): Promise<BatchCOIResult[]> => {
    const { concurrency = 3, onProgress, onItemComplete } = options || {};
    const results: BatchCOIResult[] = new Array(coiDataList.length);
    const queue = new COIQueue(concurrency);

    // Listen to queue events
    queue.addEventListener('task:complete', (e: any) => {
      console.log(`COI ${e.detail.metadata.certificateNumber} completed in ${e.detail.duration}ms`);
    });

    queue.addEventListener('queue:empty', (e: any) => {
      console.log('All COIs processed:', e.detail);
    });

    const tasks = coiDataList.map((item, index) => async () => {
      try {
        const url = await generateAndAttachCOI(
          item.ticketId,
          item.coiId,
          item.data
        );

        const result: BatchCOIResult = { id: item.coiId, url };
        results[index] = result;
        onItemComplete?.(result);
        onProgress?.(results.filter(Boolean).length, coiDataList.length);

        return result;
      } catch (error: any) {
        const result: BatchCOIResult = {
          id: item.coiId,
          url: null,
          error: error.message || 'Generation failed',
        };
        results[index] = result;
        onItemComplete?.(result);
        onProgress?.(results.filter(Boolean).length, coiDataList.length);

        return result;
      }
    });

    // Add all tasks to queue with proper COI tracking
    await Promise.all(
      tasks.map((task, index) => 
        queue.addCOI(task, {
          certificateNumber: coiDataList[index].data.certificate_number || `unknown-${index}`,
          priority: 0,
          maxRetries: 2,
          timeout: 60000, // 60 seconds per COI
        })
      )
    );

    // Summary toast
    const successful = results.filter(r => r.url).length;
    const failed = results.length - successful;

    toast({
      title: 'Batch Generation Complete',
      description: `${successful} succeeded${failed > 0 ? `, ${failed} failed` : ''}`,
      variant: failed > 0 ? 'destructive' : 'default',
    });

    return results;
  };

  const checkCOIExists = async (certificateNumber: string) => {
    try {
      const { data, error } = await supabase
        .from('certificates_of_insurance')
        .select('id, document_url, status, current_version')
        .eq('certificate_number', certificateNumber)
        .maybeSingle();

      if (error) {
        console.error('Error checking COI existence:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error checking COI existence:', error);
      return null;
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

      // Log download activity
      const coiData = await checkCOIExists(certificateNumber);
      if (coiData?.id) {
        await logCOIActivity('downloaded', coiData.id);
      }

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
    // Generation
    generateAndAttachCOI,
    batchGenerateCOIs,
    batchGenerateCOIsWithConcurrency,
    cancelGeneration,

    // Delivery
    downloadCOI,
    previewCOI,
    generateAndEmailCOI,

    // Utilities
    checkCOIExists,
    validateCOIData,
    checkStorageQuota,
    applyTemplate,
    useCOICache,

    // State
    progress,
    isGenerating,
  };
}
