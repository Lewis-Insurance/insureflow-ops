import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Loader2, TrendingUp, AlertCircle, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Insight {
  type: 'opportunity' | 'risk' | 'action';
  title: string;
  description: string;
  icon: typeof TrendingUp;
}

export function AIInsightsCard() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generateInsights = async () => {
    setLoading(true);
    try {
      // Fetch recent data for context
      const { data: policies } = await supabase
        .from('policies')
        .select('id, line_of_business, premium, expiration_date, status')
        .order('created_at', { ascending: false })
        .limit(10);

      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, status, priority, due_at')
        .eq('status', 'pending')
        .limit(10);

      // Call AI for insights
      const { data, error } = await supabase.functions.invoke('ai-document-analysis', {
        body: {
          type: 'business_insights',
          context: {
            policies: policies?.length || 0,
            pendingTasks: tasks?.length || 0,
            expiringPolicies: policies?.filter(p => {
              const expDate = new Date(p.expiration_date || '');
              const daysUntil = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return daysUntil <= 60 && daysUntil > 0;
            }).length || 0,
          },
          message: 'Analyze the business metrics and provide 3-4 actionable insights. Return JSON array with: type (opportunity/risk/action), title, description. Be specific and concise.',
          conversationHistory: [],
        },
      });

      if (error) throw error;

      // Parse AI response
      const response = data?.response || '';
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ type: string; title: string; description: string }>;
        const mappedInsights: Insight[] = parsed.map(i => ({
          type: i.type === 'opportunity' ? 'opportunity' : i.type === 'risk' ? 'risk' : 'action',
          title: i.title,
          description: i.description,
          icon: i.type === 'opportunity' ? TrendingUp : i.type === 'risk' ? AlertCircle : Target,
        }));
        setInsights(mappedInsights);
      } else {
        // Fallback insights
        setInsights([
          {
            type: 'action',
            title: 'Review pending tasks',
            description: `You have ${tasks?.length || 0} pending tasks that need attention.`,
            icon: Target,
          },
        ]);
      }

      toast({ title: 'Insights generated', description: 'AI-powered business insights ready' });
    } catch (error) {
      console.error('Insights generation error:', error);
      toast({
        title: 'Failed to generate insights',
        description: 'Using default insights',
        variant: 'destructive',
      });
      // Show fallback insight
      setInsights([
        {
          type: 'action',
          title: 'Generate AI insights',
          description: 'Click the refresh button to analyze your business data',
          icon: Target,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateInsights();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle>AI Business Insights</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={generateInsights}
            disabled={loading}
            aria-label="Refresh insights"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          </Button>
        </div>
        <CardDescription>AI-powered recommendations for your business</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && insights.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {insights.map((insight, idx) => {
              const Icon = insight.icon;
              return (
                <div
                  key={idx}
                  className={`flex gap-3 p-3 rounded-lg border ${
                    insight.type === 'opportunity'
                      ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                      : insight.type === 'risk'
                      ? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
                      : 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800'
                  }`}
                >
                  <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-sm">{insight.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
