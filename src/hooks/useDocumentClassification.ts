import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ClassificationRequest {
  document_id?: string;
  document_url?: string;
  file_name?: string;
  extracted_text?: string;
}

interface ClassificationResult {
  document_type: string;
  line_of_business?: string;
  urgency_level: 'immediate' | 'high' | 'normal' | 'low';
  required_actions: string[];
  confidence_score: number;
  suggested_tags: string[];
  related_entity_type?: 'account' | 'policy' | 'quote' | 'claim';
  metadata: Record<string, any>;
}

interface ClassificationResponse {
  success: boolean;
  classification: ClassificationResult;
}

/**
 * Hook to classify a document using AI
 */
export function useClassifyDocument() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: ClassificationRequest) => {
      const { data, error } = await supabase.functions.invoke('classify-document', {
        body: request,
      });

      if (error) throw error;
      return data as ClassificationResponse;
    },
    onSuccess: (data, variables) => {
      const { classification } = data;

      toast({
        title: 'Document Classified',
        description: `Type: ${classification.document_type} | Confidence: ${classification.confidence_score.toFixed(0)}%`,
      });

      // Invalidate document queries
      if (variables.document_id) {
        queryClient.invalidateQueries({ queryKey: ['document', variables.document_id] });
        queryClient.invalidateQueries({ queryKey: ['documents'] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Classification Failed',
        description: error.message || 'Failed to classify document',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to automatically classify document on upload
 * Use this hook silently without toast notifications
 */
export function useAutoClassifyDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: ClassificationRequest) => {
      const { data, error } = await supabase.functions.invoke('classify-document', {
        body: request,
      });

      if (error) throw error;
      return data as ClassificationResponse;
    },
    onSuccess: (data, variables) => {
      // Silent success - invalidate queries but no toast
      if (variables.document_id) {
        queryClient.invalidateQueries({ queryKey: ['document', variables.document_id] });
        queryClient.invalidateQueries({ queryKey: ['documents'] });
      }
    },
    onError: (error: Error) => {
      // Silent error - just log to console
      console.error('Auto-classification error:', error);
    },
  });
}

/**
 * Hook to get document type badge variant
 */
export function useDocumentTypeBadge(documentType?: string) {
  const getBadgeVariant = (type?: string) => {
    switch (type) {
      case 'policy':
      case 'dec_page':
        return 'default';
      case 'quote':
        return 'secondary';
      case 'claim_form':
      case 'cancellation':
        return 'destructive';
      case 'coi':
      case 'certificate':
        return 'outline';
      case 'bill':
        return 'secondary';
      case 'renewal':
        return 'default';
      default:
        return 'outline';
    }
  };

  const getDisplayName = (type?: string) => {
    if (!type) return 'Unknown';

    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getIcon = (type?: string) => {
    switch (type) {
      case 'policy':
      case 'dec_page':
        return '📋';
      case 'quote':
        return '💰';
      case 'claim_form':
        return '🚨';
      case 'coi':
      case 'certificate':
        return '✅';
      case 'bill':
        return '💵';
      case 'renewal':
        return '🔄';
      case 'cancellation':
        return '❌';
      case 'application':
        return '📝';
      default:
        return '📄';
    }
  };

  return {
    variant: getBadgeVariant(documentType),
    displayName: getDisplayName(documentType),
    icon: getIcon(documentType),
  };
}

/**
 * Hook to get urgency level display properties
 */
export function useUrgencyLevelDisplay(urgencyLevel?: string) {
  const getBadgeVariant = (level?: string) => {
    switch (level) {
      case 'immediate':
        return 'destructive';
      case 'high':
        return 'default';
      case 'normal':
        return 'secondary';
      case 'low':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getColor = (level?: string) => {
    switch (level) {
      case 'immediate':
        return 'text-red-600';
      case 'high':
        return 'text-orange-600';
      case 'normal':
        return 'text-blue-600';
      case 'low':
        return 'text-gray-600';
      default:
        return 'text-gray-600';
    }
  };

  const getIcon = (level?: string) => {
    switch (level) {
      case 'immediate':
        return '🚨';
      case 'high':
        return '⚡';
      case 'normal':
        return '📌';
      case 'low':
        return '⏳';
      default:
        return '📌';
    }
  };

  return {
    variant: getBadgeVariant(urgencyLevel),
    color: getColor(urgencyLevel),
    icon: getIcon(urgencyLevel),
    displayName: urgencyLevel?.charAt(0).toUpperCase() + (urgencyLevel?.slice(1) || ''),
  };
}

/**
 * Hook to get line of business display properties
 */
export function useLineOfBusinessDisplay(lob?: string) {
  const getDisplayName = (lob?: string) => {
    if (!lob || lob === 'unknown') return 'Unknown';

    const displayNames: Record<string, string> = {
      auto: 'Auto',
      home: 'Homeowners',
      commercial: 'Commercial',
      workers_comp: "Workers' Comp",
      general_liability: 'General Liability',
      professional_liability: 'Professional Liability (E&O)',
      cyber: 'Cyber Liability',
      umbrella: 'Umbrella',
      property: 'Property',
    };

    return displayNames[lob] || lob;
  };

  const getIcon = (lob?: string) => {
    const icons: Record<string, string> = {
      auto: '🚗',
      home: '🏠',
      commercial: '🏢',
      workers_comp: '👷',
      general_liability: '🛡️',
      professional_liability: '💼',
      cyber: '🔐',
      umbrella: '☂️',
      property: '🏗️',
    };

    return icons[lob || ''] || '📋';
  };

  return {
    displayName: getDisplayName(lob),
    icon: getIcon(lob),
  };
}

/**
 * Utility to determine if document needs immediate attention
 */
export function useDocumentNeedsAttention(
  urgencyLevel?: string,
  documentType?: string
): boolean {
  if (urgencyLevel === 'immediate') return true;

  const attentionTypes = ['claim_form', 'cancellation', 'renewal'];
  if (documentType && attentionTypes.includes(documentType)) return true;

  return false;
}

/**
 * Hook to auto-route a document to appropriate queue
 */
export function useAutoRouteDocument() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId }: { documentId: string }) => {
      const { data, error } = await supabase.rpc('auto_route_document', {
        p_document_id: documentId,
      });

      if (error) throw error;
      return { documentId, queueName: data as string | null };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['document-queues'] });

      if (data.queueName) {
        toast({
          title: 'Document Routed',
          description: `Sent to: ${data.queueName}`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Auto-routing Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
