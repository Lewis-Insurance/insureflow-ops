import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  Download,
  EyeOff,
  Filter,
  RefreshCcw,
  Search,
  Target,
  TrendingUp,
  Upload,
  XCircle,
  ArrowUpDown,
} from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useDebounce } from "@/hooks/useDebounce";
import {
  ACTIVE_STATUSES,
  DEFAULT_HIDDEN_STATUSES,
  filterAORenewalsByQueue,
  getAORenewalOperationalMetrics,
  getAORenewalWorkQueueSummary,
  useAORenewals,
  useAORenewalsStats,
  type AORenewalFilters,
  type AORenewalPriority,
  type AORenewalQueue,
  type AORenewalStatus,
} from "@/hooks/useAORenewals";

const QUEUE_OPTIONS: { value: AORenewalQueue; label: string; description: string }[] = [
  { value: "active", label: "Active work", description: "Everything still being worked" },
  { value: "needs_first_contact", label: "Needs first contact", description: "Pending files only" },
  { value: "needs_quote", label: "Needs quote", description: "Contacted but not quoted" },
  { value: "waiting_on_insured", label: "Waiting on insured", description: "Insured owes the next answer" },
  { value: "follow_up_due", label: "Follow-up issues", description: "Due, overdue, or drifting follow-up files" },
];

const formatCurrency = (value: number | null) => {
  if (!value) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
};

const formatRenewalDate = (date: string) => {
  const parsed = new Date(date);
  return format(parsed, "MMM d, yyyy");
};

const formatFollowUpDate = (date: string | null) => {
  if (!date) return "Not set";
  return format(new Date(date), "MMM d, yyyy");
};

const getStatusBadge = (status: AORenewalStatus) => {
  const config = {
    pending: { label: "Pending", className: "bg-slate-100 text-slate-700 border-slate-200" },
    contacted: { label: "Contacted", className: "bg-blue-100 text-blue-700 border-blue-200" },
    quoted: { label: "Quoted", className: "bg-amber-100 text-amber-800 border-amber-200" },
    waiting_on_insured: {
      label: "Waiting on insured",
      className: "bg-violet-100 text-violet-700 border-violet-200",
    },
    renewed: { label: "Retained", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    moved: { label: "Moved", className: "bg-cyan-100 text-cyan-700 border-cyan-200" },
    lost: { label: "Lost", className: "bg-rose-100 text-rose-700 border-rose-200" },
    cancelled: { label: "Cancelled", className: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  } as const;

  return <Badge variant="outline" className={config[status].className}>{config[status].label}</Badge>;
};

const getPriorityBadge = (priority: AORenewalPriority) => {
  const className = {
    low: "bg-slate-100 text-slate-700 border-slate-200",
    normal: "bg-slate-100 text-slate-800 border-slate-300",
    high: "bg-orange-100 text-orange-700 border-orange-200",
    urgent: "bg-red-100 text-red-700 border-red-200",
  }[priority];

  return <Badge variant="outline" className={className}>{priority}</Badge>;
};

export default function AORenewalsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<AORenewalFilters>({});
  const [searchInput, setSearchInput] = useState("");
  const [selectedQueue, setSelectedQueue] = useState<AORenewalQueue>("active");
  const [sortField, setSortField] = useState<"renewal_date" | "current_premium" | "days_since_contact" | "follow_up_date">("renewal_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [showClosedStatuses, setShowClosedStatuses] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 250);

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      search: debouncedSearch.trim() || undefined,
      status: showClosedStatuses ? undefined : [...ACTIVE_STATUSES, "renewed"],
    }));
  }, [debouncedSearch, showClosedStatuses]);

  const { data: renewals = [], isLoading } = useAORenewals(filters);
  const { data: stats } = useAORenewalsStats();

  const visibleRenewals = useMemo(() => {
    const base = showClosedStatuses
      ? renewals
      : renewals.filter((renewal) => !DEFAULT_HIDDEN_STATUSES.includes(renewal.status));

    return filterAORenewalsByQueue(base, selectedQueue)
      .map((renewal) => ({ renewal, metrics: getAORenewalOperationalMetrics(renewal) }))
      .sort((a, b) => {
        const dir = sortDirection === "asc" ? 1 : -1;
        const getTime = (value?: string | null) => (value ? new Date(value).getTime() : Number.POSITIVE_INFINITY);

        let comparison = 0;
        if (sortField === "renewal_date") {
          comparison = getTime(a.renewal.renewal_date) - getTime(b.renewal.renewal_date);
        } else if (sortField === "current_premium") {
          comparison = (a.renewal.current_premium || 0) - (b.renewal.current_premium || 0);
        } else if (sortField === "days_since_contact") {
          comparison = (a.metrics.daysSinceContact ?? Number.POSITIVE_INFINITY) - (b.metrics.daysSinceContact ?? Number.POSITIVE_INFINITY);
        } else if (sortField === "follow_up_date") {
          comparison = getTime(a.renewal.follow_up_date) - getTime(b.renewal.follow_up_date);
        }

        if (comparison === 0) {
          comparison = getTime(a.renewal.renewal_date) - getTime(b.renewal.renewal_date);
        }

        return comparison * dir;
      });
  }, [renewals, selectedQueue, showClosedStatuses, sortDirection, sortField]);

  const queueSummary = useMemo(() => getAORenewalWorkQueueSummary(renewals), [renewals]);

  const toggleSort = (
    field: "renewal_date" | "current_premium" | "days_since_contact" | "follow_up_date",
  ) => {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection(field === "renewal_date" ? "asc" : "desc");
  };

  const renderSortButton = (
    label: string,
    field: "renewal_date" | "current_premium" | "days_since_contact" | "follow_up_date",
  ) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
      onClick={() => toggleSort(field)}
    >
      {label}
      <ArrowUpDown className="h-3.5 w-3.5" />
    </button>
  );

  const exportVisibleRows = () => {
    const headers = [
      "Customer",
      "Policy Number",
      "Renewal Date",
      "Status",
      "Premium",
      "Days Since Contact",
      "Follow Up Due",
      "Priority",
      "Urgency",
    ];

    const rows = visibleRenewals.map(({ renewal, metrics }) => [
      renewal.customer_name,
      renewal.policy_number,
      renewal.renewal_date,
      renewal.status,
      renewal.current_premium ?? "",
      metrics.daysSinceContact ?? "",
      renewal.follow_up_date ?? "",
      renewal.priority,
      metrics.staleReason || (metrics.isFollowUpOverdue ? "Overdue follow-up" : ""),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ao-renewals-${selectedQueue}-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "NAMED INSURED",
      "POLICY TYPE",
      "POLICY NUMBER",
      "CURRENT CARRIER",
      "RENEWAL DATE",
      "CURRENT PREMIUM",
      "TERM MONTHS",
      "PRIORITY",
      "STATUS",
      "NOTES",
      "3 YR # of LOSSES",
      "OLDEST IN HOUSEHOLD",
    ];

    const sampleRow = [
      "John Doe",
      "Personal Automobile",
      "POL-123456",
      "Auto-Owners",
      "2026-05-16",
      "1500",
      "12",
      "high",
      "pending",
      "Call before quoting",
      "0",
      "45",
    ];

    const csvContent = [headers.join(","), sampleRow.join(",")].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ao-renewals-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const selectedQueueMeta = QUEUE_OPTIONS.find((queue) => queue.value === selectedQueue)!;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Auto-Owners Renewals</h1>
            <p className="text-muted-foreground">
              Built for the team to move volume, enforce follow-up discipline, and stay a month ahead.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/ao-renewals/rate-watch")}>
              <Target className="mr-2 h-4 w-4" />
              Rate Watch
            </Button>
            <Button variant="outline" onClick={() => navigate("/ao-renewals/analytics")}>
              <TrendingUp className="mr-2 h-4 w-4" />
              Analytics
            </Button>
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
            <Button variant="outline" onClick={exportVisibleRows}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => navigate("/ao-renewals/import")}>
              <Upload className="mr-2 h-4 w-4" />
              Import Data
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active workload</CardTitle>
              <CardDescription>Files still in play</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{queueSummary.activeCount}</div>
              <p className="mt-2 text-xs text-muted-foreground">
                {queueSummary.needsFirstContact} pending, {queueSummary.needsQuote} contacted, {queueSummary.waitingOnInsured} waiting on insured
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Follow-up pressure</CardTitle>
              <CardDescription>Due today or drifting</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{queueSummary.followUpDue + queueSummary.staleFollowUp}</div>
              <p className="mt-2 text-xs text-muted-foreground">
                {queueSummary.staleFollowUp} stale, {queueSummary.followUpDue} due or overdue
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">30-day window</CardTitle>
              <CardDescription>How far ahead the team is</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{queueSummary.expiringIn30Days}</div>
              <p className="mt-2 text-xs text-muted-foreground">
                {queueSummary.criticalWindow} are inside 5 days and still active
              </p>
            </CardContent>
          </Card>

          <Card className={queueSummary.onPace ? "border-emerald-200" : "border-amber-200"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pace check</CardTitle>
              <CardDescription>30-day discipline</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-3xl font-semibold">
                {queueSummary.onPace ? <CheckCircle className="h-7 w-7 text-emerald-600" /> : <AlertTriangle className="h-7 w-7 text-amber-600" />}
                {queueSummary.onPace ? "On pace" : "Behind"}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{queueSummary.onPaceReason}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Work filters
            </CardTitle>
            <CardDescription>Keep the page focused on who needs action now.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_220px_220px_220px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search insured or policy number"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </div>

              <Select value={selectedQueue} onValueChange={(value) => setSelectedQueue(value as AORenewalQueue)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select queue" />
                </SelectTrigger>
                <SelectContent>
                  {QUEUE_OPTIONS.map((queue) => (
                    <SelectItem key={queue.value} value={queue.value}>
                      {queue.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.priority?.[0] || "all"}
                onValueChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    priority: value === "all" ? undefined : [value as AORenewalPriority],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={showClosedStatuses ? "all_statuses" : "active_statuses"}
                onValueChange={(value) => setShowClosedStatuses(value === "all_statuses")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active_statuses">Hide moved, cancelled, lost</SelectItem>
                  <SelectItem value="all_statuses">Show all statuses</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="font-normal">Queue: {selectedQueueMeta.label}</Badge>
              <span>{selectedQueueMeta.description}</span>
              <Button variant="ghost" size="sm" onClick={() => {
                setSearchInput("");
                setSelectedQueue("active");
                setShowClosedStatuses(false);
                setSortField("renewal_date");
                setSortDirection("asc");
                setFilters({});
              }}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Reset view
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowClosedStatuses((prev) => !prev)}>
                <EyeOff className="mr-2 h-4 w-4" />
                {showClosedStatuses ? "Hide closed outcomes" : "Show closed outcomes"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Renewal work queue</CardTitle>
            <CardDescription>
              {visibleRenewals.length} visible file{visibleRenewals.length === 1 ? "" : "s"}. Click a customer to work the file.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 w-full" />
                ))}
              </div>
            ) : visibleRenewals.length === 0 ? (
              <div className="py-12 text-center">
                <Calendar className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-medium">No renewals match this queue</h3>
                <p className="mt-2 text-muted-foreground">
                  Try a broader queue or show closed outcomes if you need historical files.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Insured</TableHead>
                      <TableHead>{renderSortButton("Renewal", "renewal_date")}</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>{renderSortButton("Premium", "current_premium")}</TableHead>
                      <TableHead>{renderSortButton("Days Since Contact", "days_since_contact")}</TableHead>
                      <TableHead>{renderSortButton("Follow-Up Due", "follow_up_date")}</TableHead>
                      <TableHead>Attention</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRenewals.map(({ renewal, metrics }) => (
                      <TableRow
                        key={renewal.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/ao-renewals/${renewal.id}/edit`)}
                      >
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{renewal.customer_name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{renewal.policy_number}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div>{formatRenewalDate(renewal.renewal_date)}</div>
                            <div className="text-xs text-muted-foreground">
                              {metrics.daysUntilRenewal < 0
                                ? `${Math.abs(metrics.daysUntilRenewal)} days late`
                                : `${metrics.daysUntilRenewal} days out`}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(renewal.status)}
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(renewal.current_premium)}</TableCell>
                        <TableCell>
                          {metrics.daysSinceContact === null ? (
                            <span className="text-muted-foreground">No contact logged</span>
                          ) : (
                            <div className="space-y-1">
                              <div>{metrics.daysSinceContact} day{metrics.daysSinceContact === 1 ? "" : "s"}</div>
                              <div className="text-xs text-muted-foreground">
                                Last contact {formatFollowUpDate(renewal.last_contact_date)}
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div>{formatFollowUpDate(renewal.follow_up_date)}</div>
                            <div className="text-xs text-muted-foreground">
                              {metrics.daysUntilFollowUp === null
                                ? renewal.status === "quoted" || renewal.status === "waiting_on_insured"
                                  ? "Required"
                                  : "No follow-up set"
                                : metrics.daysUntilFollowUp < 0
                                  ? `${Math.abs(metrics.daysUntilFollowUp)} day${Math.abs(metrics.daysUntilFollowUp) === 1 ? "" : "s"} overdue`
                                  : metrics.daysUntilFollowUp === 0
                                    ? "Due today"
                                    : `Due in ${metrics.daysUntilFollowUp} day${metrics.daysUntilFollowUp === 1 ? "" : "s"}`}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            {renewal.status === "pending" ? (
                              <Badge className="bg-slate-700 hover:bg-slate-700">No contact yet</Badge>
                            ) : renewal.status === "contacted" ? (
                              <Badge className="bg-blue-600 hover:bg-blue-600">Quote needed</Badge>
                            ) : metrics.isFollowUpOverdue || metrics.staleReason ? (
                              <Badge variant="destructive">Follow up overdue</Badge>
                            ) : renewal.status === "waiting_on_insured" ? (
                              <Badge className="bg-violet-600 hover:bg-violet-600">Waiting on insured</Badge>
                            ) : metrics.isCriticalWindow ? (
                              <Badge className="bg-orange-600 hover:bg-orange-600">Inside 5 days</Badge>
                            ) : (
                              <Badge variant="outline">On track</Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {stats && (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Clock className="h-8 w-8 text-slate-500" />
                <div>
                  <div className="text-2xl font-semibold">{stats.by_status.pending}</div>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Calendar className="h-8 w-8 text-blue-500" />
                <div>
                  <div className="text-2xl font-semibold">{stats.by_status.contacted}</div>
                  <p className="text-xs text-muted-foreground">Contacted</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <DollarSign className="h-8 w-8 text-amber-500" />
                <div>
                  <div className="text-2xl font-semibold">{stats.by_status.quoted}</div>
                  <p className="text-xs text-muted-foreground">Quoted</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <AlertTriangle className="h-8 w-8 text-violet-500" />
                <div>
                  <div className="text-2xl font-semibold">{stats.by_status.waiting_on_insured}</div>
                  <p className="text-xs text-muted-foreground">Waiting on insured</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <CheckCircle className="h-8 w-8 text-emerald-500" />
                <div>
                  <div className="text-2xl font-semibold">{stats.by_status.renewed + stats.by_status.moved}</div>
                  <p className="text-xs text-muted-foreground">Kept</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <XCircle className="h-8 w-8 text-rose-500" />
                <div>
                  <div className="text-2xl font-semibold">{stats.by_status.lost + stats.by_status.cancelled}</div>
                  <p className="text-xs text-muted-foreground">Lost/Cancelled</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

    </AppLayout>
  );
}
