import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface HeatmapCell {
  day: string;
  hour: number;
  count: number;
}

interface ActivityHeatmapProps {
  data: HeatmapCell[];
  title?: string;
  description?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ActivityHeatmap({ data, title = "Activity Heatmap", description }: ActivityHeatmapProps) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  
  const getIntensity = (count: number) => {
    const ratio = count / maxCount;
    if (ratio === 0) return 'bg-muted';
    if (ratio < 0.25) return 'bg-primary/20';
    if (ratio < 0.5) return 'bg-primary/40';
    if (ratio < 0.75) return 'bg-primary/60';
    return 'bg-primary';
  };
  
  const getCellData = (day: string, hour: number) => {
    return data.find(d => d.day === day && d.hour === hour);
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Less</span>
            <div className="flex gap-1">
              <div className="w-4 h-4 rounded bg-muted" />
              <div className="w-4 h-4 rounded bg-primary/20" />
              <div className="w-4 h-4 rounded bg-primary/40" />
              <div className="w-4 h-4 rounded bg-primary/60" />
              <div className="w-4 h-4 rounded bg-primary" />
            </div>
            <span>More</span>
          </div>
          
          {/* Heatmap */}
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              {/* Hour labels */}
              <div className="flex pl-12">
                {HOURS.filter(h => h % 3 === 0).map(hour => (
                  <div key={hour} className="w-6 text-xs text-center text-muted-foreground" style={{ marginLeft: hour === 0 ? 0 : '36px' }}>
                    {hour}
                  </div>
                ))}
              </div>
              
              {/* Days and cells */}
              {DAYS.map(day => (
                <div key={day} className="flex items-center gap-1 mt-1">
                  <div className="w-10 text-xs text-muted-foreground">{day}</div>
                  <div className="flex gap-1">
                    {HOURS.map(hour => {
                      const cell = getCellData(day, hour);
                      const count = cell?.count || 0;
                      return (
                        <div
                          key={hour}
                          className={cn(
                            'w-6 h-6 rounded transition-colors cursor-pointer hover:ring-2 hover:ring-primary',
                            getIntensity(count)
                          )}
                          title={`${day} ${hour}:00 - ${count} activities`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
