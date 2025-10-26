import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Download, Filter } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

interface HeatmapCell {
  day: string;
  hour: number;
  count: number;
  activityType?: string;
}

interface ActivityHeatmapProps {
  data: HeatmapCell[];
  title?: string;
  description?: string;
  enableFiltering?: boolean;
  enableExport?: boolean;
  enableDateRange?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_ZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
];

const DATE_RANGES = [
  { value: '7', label: 'Last 7 Days' },
  { value: '14', label: 'Last 14 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' },
];

export function ActivityHeatmap({ 
  data, 
  title = "Activity Heatmap", 
  description,
  enableFiltering = false,
  enableExport = false,
  enableDateRange = false,
}: ActivityHeatmapProps) {
  const [timeZone, setTimeZone] = useState('America/New_York');
  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState('30');
  
  // Filter data based on selections
  const filteredData = data.filter(cell => {
    if (activityFilter !== 'all' && cell.activityType !== activityFilter) {
      return false;
    }
    return true;
  });
  
  const maxCount = Math.max(...filteredData.map(d => d.count), 1);
  
  const getIntensity = (count: number) => {
    const ratio = count / maxCount;
    if (ratio === 0) return 'bg-muted';
    if (ratio < 0.25) return 'bg-primary/20';
    if (ratio < 0.5) return 'bg-primary/40';
    if (ratio < 0.75) return 'bg-primary/60';
    return 'bg-primary';
  };
  
  const getCellData = (day: string, hour: number) => {
    return filteredData.find(d => d.day === day && d.hour === hour);
  };
  
  const exportToCSV = () => {
    const csvHeader = 'Day,Hour,Activity Count,Activity Type\n';
    const csvRows = filteredData.map(cell => 
      `${cell.day},${cell.hour},${cell.count},${cell.activityType || 'N/A'}`
    ).join('\n');
    
    const csvContent = csvHeader + csvRows;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-heatmap-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };
  
  // Get unique activity types from data
  const activityTypes = ['all', ...Array.from(new Set(data.map(d => d.activityType).filter(Boolean)))];
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Time Zone Selector */}
            <Select value={timeZone} onValueChange={setTimeZone}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Time Zone" />
              </SelectTrigger>
              <SelectContent>
                {TIME_ZONES.map(tz => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Date Range Selector */}
            {enableDateRange && (
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_RANGES.map(range => (
                    <SelectItem key={range.value} value={range.value}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {/* Activity Type Filter */}
            {enableFiltering && activityTypes.length > 1 && (
              <Select value={activityFilter} onValueChange={setActivityFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  {activityTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type === 'all' ? 'All Activities' : type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {/* Export Button */}
            {enableExport && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportToCSV}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Stats Summary */}
          <div className="flex items-center gap-4 text-sm">
            <Badge variant="secondary">
              Total Activities: {filteredData.reduce((sum, d) => sum + d.count, 0)}
            </Badge>
            <Badge variant="secondary">
              Peak Hour: {filteredData.sort((a, b) => b.count - a.count)[0]?.hour || 0}:00
            </Badge>
            <Badge variant="secondary">
              Most Active Day: {filteredData.sort((a, b) => b.count - a.count)[0]?.day || 'N/A'}
            </Badge>
          </div>
          
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
            <span className="ml-4">Viewing in {TIME_ZONES.find(tz => tz.value === timeZone)?.label}</span>
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
                          title={`${day} ${hour}:00 - ${count} activities${cell?.activityType ? ` (${cell.activityType})` : ''}`}
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
