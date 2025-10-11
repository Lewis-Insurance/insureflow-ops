import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Loader2, TrendingUp, AlertCircle, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Insight {
  type: 'opportunity' | 'risk' | 'action';
  title: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

export function AIInsightsCard() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const isValidDate = (d: unknown) => d instanceof Date && !isNaN(d.getTime());

  const countExpiring = (rows: Array<{ expiration_date?: string | null }> | undefined) => {
    if (!rows?.length) return 0;
    const now = Date.now();
    const sixtyDays = 60 * 24 * 60 * 60 * 1000;
    return rows.reduce((acc, p) => {
      const exp = p?.expiration_date ? new Date(p.expiration_date) : null;
      if (!exp || !isValidDate(exp)) return acc;
      const diff = exp.getTime() - now;
      return diff > 0 && diff <= sixtyDays ? acc + 1 : acc;
    }, 0);
  };

  const safeParseJSON = (text: string): any | null => {
    try {
      const base = text.replace(/```[a-zA-Z]*\n?|```/g, '').trim();
      try { return JSON.parse(base); } catch {}
      const fenced = text.match(/```json[\s\S]*?```/gi);
      if (fenced) {
        for (const block of fenced) {
          const inner = block.replace(/```json|```/gi, '');
          try { return JSON.parse(inner); } catch {}
        }
      }
      const win = base.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      if (win) return JSON.parse(win[0]);
    } catch {}
    return null;
  };

  const mapTypeToIcon = (t: string) => {
    switch (t) {
      case 'opportunity':
        return TrendingUp;
      case 'risk':
        return AlertCircle;
      default:
        return Target;
    }
  };

  const coerceInsights = (raw: any): Insight[] => {
    const arr = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
    return arr
      .map((i) => ({
        type: i?.type === 'opportunity' || i?.type === 'risk' ? i.type : 'action',
        title: typeof i?.title === 'string' ? i.title.trim() : 'Insight',
        description: typeof i?.description === 'string' ? i.description.trim() : '',
      }))
      .filter((i) => i.title)
      .map((i) => ({ ...i, icon: mapTypeToIcon(i.type) }));
  };

  const generateInsights = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    try {
      // Fetch recent data for context
      const [policiesRes, tasksRes] = await Promise.all([
        supabase
          .from('policies')
          .select('id, line_of_business, premium, expiration_date, status, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('tasks')
          .select('id, status, priority, due_at')
          .eq('status', 'pending')
          .limit(10),
      ]);

      if (signal.aborted) return;

      if (policiesRes.error || tasksRes.error) {
        throw policiesRes.error || tasksRes.error;
      }

      const policies = policiesRes.data || [];
      const tasks = tasksRes.data || [];

      const payload = {
        type: 'business_insights',
        context: {
          policies: policies.length,
          pendingTasks: tasks.length,
          expiringPolicies: countExpiring(policies),
        },
        message:
          'Analyze the business metrics and provide 3-4 actionable insights. Return ONLY a JSON array of objects with fields: type (opportunity|risk|action), title, description. Be specific and concise. No prose outside JSON.',
        conversationHistory: [],
      } as const;

      const { data, error } = await supabase.functions.invoke('ai-document-analysis', {
        body: payload,
      });

      if (signal.aborted) return;
      if (error) throw error;

      const responseText = typeof data?.response === 'string' ? data.response.trim() : '';
      const parsed = safeParseJSON(responseText);

      const mapped = coerceInsights(parsed);
      if (mapped.length === 0) {
        setInsights([
          {
            type: 'action',
            title: 'Review pending tasks',
            description: `You have ${tasks.length} pending tasks that need attention.`,
            icon: Target,
          },
        ]);
      } else {
        setInsights(mapped);
      }

      toast({ title: 'Insights generated', description: 'AI-powered business insights ready' });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('Insights generation error:', err);
      toast({ title: 'Failed to generate insights', description: err?.message || 'Using default insights', variant: 'destructive' });
      setInsights([
        {
          type: 'action',
          title: 'Generate AI insights',
          description: 'Click the refresh button to analyze your business data',
          icon: Target,
        },
      ]);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [loading, toast]);

  useEffect(() => {
    generateInsights();
  }, [generateInsights]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" aria-hidden="true" />
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
