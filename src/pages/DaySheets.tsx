import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, subDays, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CalendarDays,
  Clock,
  CheckCircle2,
  Archive,
  ArrowRight,
  DollarSign,
  Receipt,
  Filter,
  Printer,
  CalendarSearch,
} from 'lucide-react';
import { useDaySheets, useCurrentDaySheet } from '@/hooks/useDaySheets';
import { DaySheetSummary } from '@/components/payments/DaySheetSummary';
import { RecordPaymentModal } from '@/components/payments/RecordPaymentModal';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type DateRange = {
  from: Date;
  to: Date;
};

const statusIcons = {
  open: Clock,
  closed: CheckCircle2,
  deposited: Archive,
};

const statusColors = {
  open: 'bg-blue-100 text-blue-800',
  closed: 'bg-amber-100 text-amber-800',
  deposited: 'bg-green-100 text-green-800',
};

export default function DaySheets() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [goToDateOpen, setGoToDateOpen] = useState(false);
  const [selectedGoToDate, setSelectedGoToDate] = useState<Date | undefined>(undefined);
  const [searchingForDate, setSearchingForDate] = useState<string | null>(null);

  const { data: daySheets = [], isLoading } = useDaySheets({
    startDate: format(dateRange.from, 'yyyy-MM-dd'),
    endDate: format(dateRange.to, 'yyyy-MM-dd'),
    status: statusFilter === 'all' ? undefined : (statusFilter as 'open' | 'closed' | 'deposited'),
  });

  const { data: currentDaySheet } = useCurrentDaySheet();

  // Handler for "Go to Date" - finds and navigates to a day sheet by date
  const handleGoToDate = (date: Date | undefined) => {
    if (!date) return;

    const dateStr = format(date, 'yyyy-MM-dd');
    // Find the day sheet for this date in our existing data or query
    const existingSheet = daySheets.find(ds => ds.sheet_date === dateStr);

    if (existingSheet) {
      setGoToDateOpen(false);
      setSelectedGoToDate(undefined);
      setSearchingForDate(null);
      navigate(`/day-sheets/${existingSheet.id}`);
    } else {
      // Sheet might exist but not be in the current date range filter
      // Set the date range to this specific date to search for it
      setGoToDateOpen(false);
      setSelectedGoToDate(undefined);
      setSearchingForDate(dateStr);
      setDateRange({
        from: date,
        to: date,
      });
    }
  };

  // Auto-navigate when searching for a specific date and data loads
  useEffect(() => {
    if (searchingForDate && !isLoading && daySheets.length > 0) {
      const targetSheet = daySheets.find(ds => ds.sheet_date === searchingForDate);
      if (targetSheet) {
        setSearchingForDate(null);
        navigate(`/day-sheets/${targetSheet.id}`);
      }
    }
    // If no sheet found after loading, clear the search state
    if (searchingForDate && !isLoading && daySheets.length === 0) {
      toast({
        title: 'No Day Sheet Found',
        description: `No day sheet exists for ${format(parseISO(searchingForDate), 'MMMM d, yyyy')}. This day may have had no payments recorded.`,
      });
      setSearchingForDate(null);
    }
  }, [searchingForDate, isLoading, daySheets, navigate, toast]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Calculate summary stats
  const stats = {
    totalCollected: daySheets.reduce((sum, ds) => sum + (ds.grand_total || 0), 0),
    totalPayments: daySheets.reduce((sum, ds) => sum + (ds.payment_count || 0), 0),
    openSheets: daySheets.filter((ds) => ds.status === 'open').length,
    closedSheets: daySheets.filter((ds) => ds.status === 'closed').length,
    depositedSheets: daySheets.filter((ds) => ds.status === 'deposited').length,
  };

  const quickDateRanges = [
    { label: 'Last 7 Days', from: subDays(new Date(), 7), to: new Date() },
    { label: 'Last 30 Days', from: subDays(new Date(), 30), to: new Date() },
    { label: 'This Month', from: startOfMonth(new Date()), to: endOfMonth(new Date()) },
    {
      label: 'Last Month',
      from: startOfMonth(subDays(startOfMonth(new Date()), 1)),
      to: endOfMonth(subDays(startOfMonth(new Date()), 1)),
    },
  ];

  return (
    <AppLayout>
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Day Sheets</h1>
          <p className="text-muted-foreground">
            Daily payment batches and deposit preparation
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            className="bg-emerald-800 hover:bg-emerald-900 text-white"
            onClick={() => navigate('/payments')}
          >
            <Receipt className="h-4 w-4 mr-2" />
            View Payments
          </Button>
          {/* Go to Date - Select a specific date to view/print that day's sheet */}
          <Popover open={goToDateOpen} onOpenChange={setGoToDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <CalendarSearch className="h-4 w-4 mr-2" />
                Go to Date
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-3 border-b">
                <p className="text-sm font-medium">View Day Sheet by Date</p>
                <p className="text-xs text-muted-foreground">Select a date to view or print that day's sheet</p>
              </div>
              <Calendar
                mode="single"
                selected={selectedGoToDate}
                onSelect={(date) => {
                  setSelectedGoToDate(date);
                  handleGoToDate(date);
                }}
                disabled={(date) => date > new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Current Day Sheet */}
      {currentDaySheet && (
        <div className="grid md:grid-cols-2 gap-6">
          <DaySheetSummary daySheet={currentDaySheet} showDetailed />
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Manage today&apos;s day sheet</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white"
                onClick={() => setShowRecordPayment(true)}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Record Payment
              </Button>
              <Button
                className="w-full bg-emerald-800 hover:bg-emerald-900 text-white"
                onClick={() => navigate(`/day-sheets/${currentDaySheet.id}?action=print`)}
              >
                <Printer className="h-4 w-4 mr-2" />
                Print Today&apos;s Day Sheet
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate(`/day-sheets/${currentDaySheet.id}`)}
              >
                View Today&apos;s Day Sheet
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalCollected)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalPayments} payments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Day Sheets</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{daySheets.length}</div>
            <p className="text-xs text-muted-foreground">in selected period</p>
          </CardContent>
        </Card>
      </div>

      {/* Day Sheet History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Day Sheet History</CardTitle>
            <div className="flex items-center gap-2">
              {quickDateRanges.map((range) => (
                <Button
                  key={range.label}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'text-sm hidden md:inline-flex',
                    format(dateRange.from, 'yyyy-MM-dd') === format(range.from, 'yyyy-MM-dd') &&
                      format(dateRange.to, 'yyyy-MM-dd') === format(range.to, 'yyyy-MM-dd')
                      ? 'bg-muted'
                      : ''
                  )}
                  onClick={() => setDateRange({ from: range.from, to: range.to })}
                >
                  {range.label}
                </Button>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <CalendarDays className="h-4 w-4 mr-2" />
                    {format(dateRange.from, 'MMM d')} - {format(dateRange.to, 'MMM d')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => {
                      if (range?.from && range?.to) {
                        setDateRange({ from: range.from, to: range.to });
                      }
                    }}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : daySheets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No day sheets found for the selected period
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Sheet #</TableHead>
                  <TableHead className="text-right">Payments</TableHead>
                  <TableHead className="text-right">Cash</TableHead>
                  <TableHead className="text-right">Checks</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {daySheets.map((sheet) => {
                  return (
                    <TableRow
                      key={sheet.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/day-sheets/${sheet.id}`)}
                    >
                      <TableCell className="font-medium">
                        {format(parseISO(sheet.sheet_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {sheet.sheet_number || '-'}
                      </TableCell>
                      <TableCell className="text-right">{sheet.payment_count || 0}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(sheet.total_cash || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(sheet.total_checks || 0)}
                        {(sheet.check_count || 0) > 0 && (
                          <span className="text-muted-foreground text-xs ml-1">
                            ({sheet.check_count})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(sheet.grand_total || 0)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Record Payment popup */}
      <RecordPaymentModal
        open={showRecordPayment}
        onOpenChange={setShowRecordPayment}
      />
    </div>
    </AppLayout>
  );
}
