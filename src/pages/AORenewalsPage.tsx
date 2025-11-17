import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Upload, 
  Download, 
  Filter, 
  MoreVertical, 
  Calendar,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  Search,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  useAORenewals,
  useAORenewalsStats,
  useUpdateAORenewalStatus,
  useDeleteAORenewal,
  useBulkDeleteAllAORenewals,
  type AORenewalStatus,
  type AORenewalPriority,
  type AORenewalFilters,
  type AORenewal,
} from "@/hooks/useAORenewals";
import { Skeleton } from "@/components/ui/skeleton";
import { AddAORenewalTaskModal } from "@/components/renewals/AddAORenewalTaskModal";

export default function AORenewalsPage() {
  const navigate = useNavigate();
  
  // Filters
  const [filters, setFilters] = useState<AORenewalFilters>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [taskRenewal, setTaskRenewal] = useState<AORenewal | null>(null);

  // Queries
  const { data: renewals = [], isLoading } = useAORenewals(filters);
  const { data: stats } = useAORenewalsStats();
  const updateStatusMutation = useUpdateAORenewalStatus();
  const deleteMutation = useDeleteAORenewal();
  const deleteAllMutation = useBulkDeleteAllAORenewals();

  const formatCurrency = (value: number | null) => {
    if (!value) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (date: string) => {
    try {
      const d = new Date(date);
      const today = new Date();
      const daysUntil = Math.floor(
        (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      const formatted = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      if (daysUntil < 0) {
        return `${formatted} (${Math.abs(daysUntil)}d ago)`;
      } else if (daysUntil === 0) {
        return `${formatted} (Today)`;
      } else if (daysUntil <= 7) {
        return `${formatted} (${daysUntil}d)`;
      }
      
      return formatted;
    } catch {
      return date;
    }
  };

  const getStatusBadge = (status: AORenewalStatus) => {
    const variants = {
      pending: "secondary",
      contacted: "default",
      quoted: "default",
      renewed: "default",
      lost: "destructive",
      cancelled: "destructive",
    } as const;

    const icons = {
      pending: Clock,
      contacted: Users,
      quoted: DollarSign,
      renewed: CheckCircle,
      lost: XCircle,
      cancelled: XCircle,
    };

    const Icon = icons[status];

    return (
      <Badge variant={variants[status]} className="gap-1">
        <Icon className="h-3 w-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: AORenewalPriority) => {
    const variants = {
      low: "secondary",
      normal: "default",
      high: "default",
      urgent: "destructive",
    } as const;

    return (
      <Badge variant={variants[priority]}>
        {priority.toUpperCase()}
      </Badge>
    );
  };

  const handleStatusChange = (id: string, status: AORenewalStatus) => {
    updateStatusMutation.mutate({ id, status });
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
      setDeleteId(null);
    }
  };

  const handleSearch = () => {
    setFilters({ ...filters, search: searchQuery });
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'NAMED INSURED',
      'POLICY NUMBER',
      'POLICY TYPE',
      'CURRENT CARRIER',
      'RENEWAL DATE',
      'CURRENT PREMIUM',
      'TERM MONTHS',
      'PRIORITY',
      'STATUS',
      'NOTES'
    ];

    const sampleRow = [
      'John Doe',
      'POL-123456',
      'Auto',
      'Auto-Owners',
      '2024-12-31',
      '1500',
      '12',
      'high',
      'pending',
      'Sample notes'
    ];

    const csvContent = [
      headers.join(','),
      sampleRow.join(',')
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ao-renewals-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleClearAllData = () => {
    if (window.confirm('Are you sure you want to delete ALL renewal data? This action cannot be undone.')) {
      deleteAllMutation.mutate();
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Auto-Owners Renewals</h1>
            <p className="text-muted-foreground">
              Manage and track Auto-Owners policy renewals
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/ao-renewals/analytics")}>
              <TrendingUp className="h-4 w-4 mr-2" />
              Analytics
            </Button>
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
            <Button variant="destructive" onClick={handleClearAllData}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All Data
            </Button>
            <Button variant="outline" onClick={() => {}}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button onClick={() => navigate("/ao-renewals/import")}>
              <Upload className="h-4 w-4 mr-2" />
              Import Data
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Total Renewals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_count}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Active renewal opportunities
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Total Premium
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(stats.total_premium)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Avg: {formatCurrency(stats.avg_premium)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Next 30 Days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.upcoming_30_days}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Upcoming renewals
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  High Priority
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.by_priority.urgent + stats.by_priority.high}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Require attention
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search customer or policy..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button size="icon" onClick={handleSearch}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>

              <Select
                value={filters.status?.[0] || "all"}
                onValueChange={(value) =>
                  setFilters({
                    ...filters,
                    status: value === "all" ? undefined : [value as AORenewalStatus],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="quoted">Quoted</SelectItem>
                  <SelectItem value="renewed">Renewed</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.priority?.[0] || "all"}
                onValueChange={(value) =>
                  setFilters({
                    ...filters,
                    priority: value === "all" ? undefined : [value as AORenewalPriority],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={() => {
                  setFilters({});
                  setSearchQuery("");
                }}
              >
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Renewals Table */}
        <Card>
          <CardHeader>
            <CardTitle>Renewals List</CardTitle>
            <CardDescription>
              {renewals.length} renewal{renewals.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : renewals.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No renewals found</h3>
                <p className="text-muted-foreground mb-4">
                  Get started by importing your Auto-Owners renewal data
                </p>
                <Button onClick={() => navigate("/ao-renewals/import")}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Data
                </Button>
              </div>
            ) : (
              <div className="border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Policy #</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Renewal Date</TableHead>
                      <TableHead>Premium</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {renewals.map((renewal) => (
                      <TableRow 
                        key={renewal.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/ao-renewals/${renewal.id}/edit`)}
                      >
                        <TableCell className="font-medium">
                          {renewal.customer_name}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {renewal.policy_number}
                        </TableCell>
                        <TableCell className="text-sm">
                          {renewal.policy_type}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(renewal.renewal_date)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(renewal.current_premium)}
                        </TableCell>
                        <TableCell>{getStatusBadge(renewal.status)}</TableCell>
                        <TableCell>{getPriorityBadge(renewal.priority)}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setTaskRenewal(renewal)}
                              >
                                Create Task
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(renewal.id, "contacted")
                                }
                              >
                                Mark as Contacted
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(renewal.id, "quoted")
                                }
                              >
                                Mark as Quoted
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(renewal.id, "renewed")
                                }
                              >
                                Mark as Renewed
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteId(renewal.id)}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the renewal
              record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Task Modal */}
      {taskRenewal && (
        <AddAORenewalTaskModal
          open={!!taskRenewal}
          onOpenChange={(open) => !open && setTaskRenewal(null)}
          renewal={taskRenewal}
        />
      )}
    </AppLayout>
  );
}
