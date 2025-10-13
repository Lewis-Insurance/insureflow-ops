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
          .single();

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
          option1: data.option1_data as any,
          option2: data.option2_data as any,
          differences: (data.comparison_results as any)?.differences || {
            coverageDifferences: [],
            premiumDifference: 0,
            premiumPercentage: 0,
            carrierComparison: '',
            termComparison: '',
          },
          recommendation: (data.comparison_results as any)?.recommendation || '',
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
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!comparison) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Report Not Found</h1>
            <p className="text-muted-foreground mt-2">
              The comparison report you're looking for could not be found.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-8">
        <ComparisonReport comparison={comparison} />
      </div>
    </AppLayout>
  );
}
