import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ComparisonReport } from '@/components/comparison/ComparisonReport';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { ComparisonResult } from '@/types/insurance-comparison';

export default function ComparisonReportPage() {
  const { id } = useParams<{ id: string }>();
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    async function loadComparison() {
      if (!id) return;
      
      try {
        const { data, error } = await supabase
          .from('comparison_sessions')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          toast({
            title: 'Report not found',
            description: 'The comparison report could not be found.',
            variant: 'destructive',
          });
          return;
        }

        // Build comparison object from session data
        const comparisonData: ComparisonResult = {
          option1: data.option1_data,
          option2: data.option2_data,
          differences: (data.comparison_results)?.differences || {
            coverageDifferences: [],
            premiumDifference: 0,
            premiumPercentage: 0,
            carrierComparison: '',
            termComparison: '',
          },
          recommendation: (data.comparison_results)?.recommendation || '',
          analysisDate: new Date(data.created_at),
        };

        setComparison(comparisonData);
      } catch (error) {
        console.error('Error loading comparison:', error);
        toast({
          title: 'Error',
          description: 'Failed to load comparison report',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    }

    loadComparison();
  }, [id, toast]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-cc-text-muted" aria-hidden="true" />
        </div>
      </AppLayout>
    );
  }

  if (!comparison) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-[1100px] p-6">
          <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface px-6 py-16 text-center shadow-card">
            <h1 className="text-lg font-bold text-cc-text-primary">Report not found</h1>
            <p className="mt-1 text-sm text-cc-text-muted">
              The comparison report you are looking for could not be found.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1100px] p-6">
        <ComparisonReport comparison={comparison} />
      </div>
    </AppLayout>
  );
}
