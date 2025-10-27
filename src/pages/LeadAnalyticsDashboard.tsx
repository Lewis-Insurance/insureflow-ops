import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format, subDays } from 'date-fns';
import { CalendarIcon, Download, BarChart3 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';

// Import all analytics components
import { InsuranceTypePerformance } from '@/components/leads/analytics/InsuranceTypePerformance';
import { LeadSourcePerformanceCard } from '@/components/leads/analytics/LeadSourcePerformanceCard';
import { ProducerPerformanceCard } from '@/components/leads/analytics/ProducerPerformanceCard';
import { useAuth } from '@/hooks/useAuth';

type DateRange = {
  start: string;
  end: string;
} | undefined;

export default function LeadAnalyticsDashboard() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange>({
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());

  const handleDateRangeChange = () => {
    if (startDate && endDate) {
      setDateRange({
        start: format(startDate, 'yyyy-MM-dd'),
        end: format(endDate, 'yyyy-MM-dd'),
      });
    }
  };

  const quickRanges = [
    { label: 'Last 7 Days', days: 7 },
    { label: 'Last 30 Days', days: 30 },
    { label: 'Last 90 Days', days: 90 },
    { label: 'This Year', days: 365 },
  ];

  const handleQuickRange = (days: number) => {
    const end = new Date();
    const start = subDays(end, days);
    setStartDate(start);
    setEndDate(end);
    setDateRange({
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    });
  };

  if (!user) {
    return (
      <AppLayout>
        <div className="p-8">
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                Loading account information...
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Lead Analytics Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Comprehensive performance metrics and insights
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Quick Range Buttons */}
          {quickRanges.map((range) => (
            <Button
              key={range.days}
              variant="outline"
              size="sm"
              onClick={() => handleQuickRange(range.days)}
            >
              {range.label}
            </Button>
          ))}

          {/* Custom Date Range */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {startDate && endDate ? (
                  <>
                    {format(startDate, 'MMM dd')} - {format(endDate, 'MMM dd, yyyy')}
                  </>
                ) : (
                  'Select dates'
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-sm font-medium">Start Date</label>
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">End Date</label>
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    disabled={(date) => startDate ? date < startDate : false}
                  />
                </div>
                <Button onClick={handleDateRangeChange} className="w-full">
                  Apply Range
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Tabs for Different Views */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sources">Lead Sources</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="producers">Producers</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <LeadSourcePerformanceCard dateRange={dateRange} />
            <InsuranceTypePerformance dateRange={dateRange} />
          </div>
          <ProducerPerformanceCard dateRange={dateRange} />
        </TabsContent>

        {/* Lead Sources Tab */}
        <TabsContent value="sources" className="space-y-6">
          <LeadSourcePerformanceCard dateRange={dateRange} />
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-6">
          <InsuranceTypePerformance dateRange={dateRange} />
        </TabsContent>

        {/* Producers Tab */}
        <TabsContent value="producers" className="space-y-6">
          <ProducerPerformanceCard dateRange={dateRange} />
        </TabsContent>
      </Tabs>
    </div>
    </AppLayout>
  );
}
