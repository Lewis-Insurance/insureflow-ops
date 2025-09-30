import { useEffect } from 'react';
import { useTaskTemplates } from '@/hooks/useTaskTemplates';

interface QuoteTaskGeneratorProps {
  quoteId: string;
  accountId: string;
  status: string;
}

/**
 * Component that automatically generates tasks based on quote status changes.
 * Usage: Include this component in your quote detail/edit pages to enable automatic task generation.
 */
export function QuoteTaskGenerator({ quoteId, accountId, status }: QuoteTaskGeneratorProps) {
  const { generateTasksFromEvent } = useTaskTemplates();

  useEffect(() => {
    if (status === 'accepted') {
      // Generate tasks when quote is accepted
      generateTasksFromEvent('quote_accepted', accountId, 'quote', quoteId);
    }
  }, [status, quoteId, accountId, generateTasksFromEvent]);

  // This component doesn't render anything
  return null;
}
