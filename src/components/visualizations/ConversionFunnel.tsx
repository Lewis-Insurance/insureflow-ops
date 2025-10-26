import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDown } from 'lucide-react';

interface FunnelStage {
  label: string;
  count: number;
  value?: number;
  color: string;
}

interface ConversionFunnelProps {
  stages: FunnelStage[];
  title?: string;
  description?: string;
}

export function ConversionFunnel({ stages, title = "Conversion Funnel", description }: ConversionFunnelProps) {
  const maxCount = Math.max(...stages.map(s => s.count));
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {stages.map((stage, index) => {
            const widthPercent = (stage.count / maxCount) * 100;
            const conversionRate = index > 0 
              ? ((stage.count / stages[index - 1].count) * 100).toFixed(1)
              : '100.0';
            const totalConversion = ((stage.count / stages[0].count) * 100).toFixed(1);
            
            return (
              <div key={stage.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{stage.label}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">
                      {stage.count} leads
                      {stage.value && ` • $${(stage.value / 1000).toFixed(1)}k`}
                    </span>
                    <span className="font-semibold">{totalConversion}%</span>
                  </div>
                </div>
                
                <div className="relative">
                  <div 
                    className="h-12 rounded-lg flex items-center justify-center text-white font-semibold transition-all"
                    style={{ 
                      width: `${widthPercent}%`,
                      backgroundColor: stage.color,
                      minWidth: '120px'
                    }}
                  >
                    {stage.count}
                  </div>
                </div>
                
                {index < stages.length - 1 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground pl-2">
                    <ArrowDown className="h-3 w-3" />
                    <span>
                      {conversionRate}% convert to next stage
                      ({((stages[index + 1].count / stage.count) * 100).toFixed(0)}% drop-off)
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
