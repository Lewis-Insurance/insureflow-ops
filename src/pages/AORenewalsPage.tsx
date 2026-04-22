import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { formatLocalDateDisplay, extractLocalDate, todayLocalDate } from "@/lib/date/localDate";
import {
  AlertTriangle,
  ArrowUpDown,
  Calendar,
  CalendarClock,
  CheckCircle,
  DollarSign,
  Download,
  MoreVertical,
  RefreshCcw,
  Search,
  Target,
  TrendingUp,
  Upload,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { MovedStatusModal } from "@/components/renewals/MovedStatusModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { useDebounce } from "@/hooks/useDebounce";
import {
  getAORenewalOperationalMetrics,
  getAORenewalWorkQueueSummary,
  useAORenewals,
  useAORenewalsStats,
  useDeleteAORenewal,
  useBulkDeleteAllAORenewals,
  useUpdateAORenewal,
  useUpdateAORenewalStatus,
  useSetAORenewalFollowUp,
  type AORenewal,
  type AORenewalStatus,
  type AORenewalTerm,
} from "@/hooks/useAORenewals";
import { supabase } from "@/integrations/supabase/client";
import { AddAORenewalTaskModal } from "@/components/renewals/AddAORenewalTaskModal";

type SortField = "renewal_date" | "current_premium" | "days_since_contact" | "follow_up_date";

const formatCurrency = (value: number | null) => {
  if (!value) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
};

const formatRenewalDate = (date: string) => formatLocalDateDisplay(date);
const formatFollowUpDate = (date: string | null) => (!date ? "Not set" : formatLocalDateDisplay(date));

const getStatusBadge = (status: AORenewalStatus) => {
  const config: Record<AORenewalStatus, { label: string; className: string }> = {
    pending:   { label: "Pending",   className: "bg-slate-100 text-slate-700 border-slate-200" },
    contacted: { label: "Contacted", className: "bg-blue-100 text-blue-700 border-blue-200" },
    quoted:    { label: "Quoted",    className: "bg-amber-100 text-amber-800 border-amber-200" },
    renewed:   { label: "Retained",  className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    moved:     { label: "Moved",     className: "bg-cyan-100 text-cyan-700 border-cyan-200" },
    lost:      { label: "Lost",      className: "bg-rose-100 text-rose-700 border-rose-200" },
    cancelled: { label: "Cancelled", className: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  };
  return <Badge variant="outline" className={config[status].className}>{config[status].label}</Badge>;
};

const QUEUE_STATE_KEY = (uid: string) => `ao-renewals-queue-state-v1-${uid}`;

export default function AORenewalsPage() {
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState("");
  const [sortField, setSortField] = useState<SortField>("renewal_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [taskRenewal, setTaskRenewal] = useState<AORenewal | null>(null);
  const [followUpDraft, setFollowUpDraft] = useState<Record<string, { date: string; reason: string }>>({});
  const [savingFollowUp, setSavingFollowUp] = useState<string | null>(null);
  const [movedModalRenewal, setMovedModalRenewal] = useState<AORenewal | null>(null);

  const debouncedSearch = useDebounce(searchInput, 250);

  // Restore persisted queue state after we know the user
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const uid = user?.id || null;
      setCurrentUserId(uid);
      if (uid) {
        try {
          const raw = localStorage.getItem(QUEUE_STATE_KEY(uid));
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved.searchInput !== undefined) setSearchInput(saved.searchInput);
            if (saved.sortField !== undefined) setSortField(saved.sortField as SortField);
            if (saved.sortDirection !== undefined) setSortDirection(saved.sortDirection);
          }
        } catch {}
      }
    });
  }, []);

  // Persist queue state on every change
  useEffect(() => {
    if (!currentUserId) return;
    try {
      localStorage.setItem(QUEUE_STATE_KEY(currentUserId), JSON.stringify({ searchInput, sortField, sortDirection }));
    } catch {}
  }, [currentUserId, searchInput, sortField, sortDirection]);

  const { data: renewals = [], isLoading } = useAORenewals(
    debouncedSearch.trim() ? { search: debouncedSearch.trim() } : undefined
  );
  const { data: stats } = useAORenewalsStats();
  const updateStatusMutation = useUpdateAORenewalStatus();
  const updateRenewalMutation = useUpdateAORenewal();
  const followUpMutation = useSetAORenewalFollowUp();
  const deleteMutation = useDeleteAORenewal();
  const deleteAllMutation = useBulkDeleteAllAORenewals();

  const visibleRenewals = useMemo(() => {
    return renewals
      .map((renewal) => ({ renewal, metrics: getAORenewalOperationalMetrics(renewal) }))
      .sort((a, b) => {
        const dir = sortDirection === "asc" ? 1 : -1;
        const getTime = (v?: string | null) => (v ? new Date(v).getTime() : Number.POSITIVE_INFINITY);
        let cmp = 0;
        if (sortField === "renewal_date") cmp = getTime(a.renewal.renewal_date) - getTime(b.renewal.renewal_date);
        else if (sortField === "current_premium") cmp = (a.renewal.current_premium || 0) - (b.renewal.current_premium || 0);
        else if (sortField === "days_since_contact") cmp = (a.metrics.daysSinceContact ?? Infinity) - (b.metrics.daysSinceContact ?? Infinity);
        else if (sortField === "follow_up_date") cmp = getTime(a.renewal.follow_up_date) - getTime(b.renewal.follow_up_date);
        if (cmp === 0) cmp = getTime(a.renewal.renewal_date) - getTime(b.renewal.renewal_date);
        return cmp * dir;
      });
  }, [renewals, sortField, sortDirection]);

  const queueSummary = useMemo(() => getAORenewalWorkQueueSummary(renewals), [renewals]);

  const followUpsTodayCount = useMemo(() => {
    const today = todayLocalDate();
    return renewals.filter((r) => extractLocalDate(r.follow_up_date) === today).length;
  }, [renewals]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDirection(field === "renewal_date" ? "asc" : "desc"); }
  };

  const renderSortButton = (label: string, field: SortField) => (
    <button type="button" className="inline-flex items-center gap-1 font-medium hover:text-foreground" onClick={() => toggleSort(field)}>
      {label}<ArrowUpDown className="h-3.5 w-3.5" />
    </button>
  );

  const handleSaveFollowUp = async (renewal: AORenewal) => {
    const draft = followUpDraft[renewal.id];
    if (!draft?.date || !currentUserId) return;
    setSavingFollowUp(renewal.id);
    try {
      await followUpMutation.mutateAsync({
        renewal,
        date: draft.date,
        reason: draft.reason.trim() || null,
        currentUserId,
      });
      setFollowUpDraft((prev) => { const next = { ...prev }; delete next[renewal.id]; return next; });
    } finally {
      setSavingFollowUp(null);
    }
  };

  const handleClearFollowUp = async (renewal: AORenewal) => {
    if (!currentUserId) return;
    setSavingFollowUp(renewal.id);
    try {
      await followUpMutation.mutateAsync({ renewal, date: null, reason: null, currentUserId });
    } finally {
      setSavingFollowUp(null);
    }
  };

  const handleStatusChange = (renewal: AORenewal, status: AORenewalStatus) => {
    if (status === 'moved' && renewal.status !== 'moved') {
      setMovedModalRenewal(renewal);
      return;
    }
    updateStatusMutation.mutate({ id: renewal.id, status });
  };

  const handleMovedConfirm = (data: { carrier: string; term: AORenewalTerm; premium: number }) => {
    if (!movedModalRenewal) return;
    updateRenewalMutation.mutate({
      id: movedModalRenewal.id,
      updates: {
        status: 'moved',
        moved_carrier: data.carrier,
        moved_term: data.term,
        moved_premium: data.premium,
        follow_up_date: null,
        follow_up_reason: null,
      },
    });
    setMovedModalRenewal(null);
  };

  const handleDelete = () => {
    if (deleteId) { deleteMutation.mutate(deleteId); setDeleteId(null); }
  };

  const handleDownloadTemplate = () => {
    const headers = ["NAMED INSURED","POLICY TYPE","POLICY NUMBER","CURRENT CARRIER","RENEWAL DATE","CURRENT PREMIUM","TERM MONTHS","PRIORITY","STATUS","NOTES","3 YR # of LOSSES","OLDEST IN HOUSEHOLD"];
    const sampleRow = ["John Doe","Personal Automobile","POL-123456","Auto-Owners","2026-05-16","1500","12","high","pending","Call before quoting","0","45"];
    const csv = [headers.join(","), sampleRow.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "ao-renewals-template.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const exportVisibleRows = () => {
    const headers = ["Customer","Policy Number","Renewal Date","Status","Premium","Days Since Contact","Follow Up Due","Priority","Urgency"];
    const rows = visibleRenewals.map(({ renewal, metrics }) => [
      renewal.customer_name, renewal.policy_number, renewal.renewal_date, renewal.status,
      renewal.current_premium ?? "", metrics.daysSinceContact ?? "", renewal.follow_up_date ?? "",
      renewal.priority, metrics.staleReason || (metrics.isFollowUpOverdue ? "Overdue follow-up" : ""),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ao-renewals-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Auto-Owners Renewals</h1>
            <p className="text-muted-foreground">
              Built for the team to move volume, enforce follow-up discipline, and stay a month ahead.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/ao-renewals/rate-watch")}>
              <Target className="mr-2 h-4 w-4" />Rate Watch
            </Button>
            <Button variant="outline" onClick={() => navigate("/ao-renewals/analytics")}>
              <TrendingUp className="mr-2 h-4 w-4" />Analytics
            </Button>
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="mr-2 h-4 w-4" />Template
            </Button>
            <Button variant="outline" onClick={exportVisibleRows}>
              <Download className="mr-2 h-4 w-4" />Export
            </Button>
            <Button onClick={() => navigate("/ao-renewals/import")}>
              <Upload className="mr-2 h-4 w-4" />Import Data
            </Button>
          </div>
        </div>

        {/* Work Queue KPI Tiles */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active workload</CardTitle>
              <CardDescription>Files still in play</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{queueSummary.activeCount}</div>
              <p className="mt-2 text-xs text-muted-foreground">
                {queueSummary.needsFirstContact} pending, {queueSummary.needsQuote} contacted
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
                {queueSummary.criticalWindow} inside 5 days and still active
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
                {queueSummary.onPace
                  ? <CheckCircle className="h-7 w-7 text-emerald-600" />
                  : <AlertTriangle className="h-7 w-7 text-amber-600" />}
                {queueSummary.onPace ? "On pace" : "Behind"}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{queueSummary.onPaceReason}</p>
            </CardContent>
          </Card>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />Total
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_count}</div>
                <p className="text-xs text-muted-foreground mt-1">All renewals</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />Premium
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats.total_premium)}</div>
                <p className="text-xs text-muted-foreground mt-1">Avg: {formatCurrency(stats.avg_premium)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />Next 30 Days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.upcoming_30_days}</div>
                <p className="text-xs text-muted-foreground mt-1">Upcoming renewals</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />Urgent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.upcoming_5_days}</div>
                <p className="text-xs text-muted-foreground mt-1">Due within 5 days</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />Follow-ups Due Today
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{followUpsTodayCount}</div>
                <p className="text-xs text-muted-foreground mt-1">Scheduled for today</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search insured or policy number"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => {
            setSearchInput("");
            setSortField("renewal_date"); setSortDirection("asc");
          }}>
            <RefreshCcw className="mr-2 h-4 w-4" />Reset
          </Button>
        </div>

        {/* Renewals Table */}
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
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : visibleRenewals.length === 0 ? (
              <div className="py-12 text-center">
                <Calendar className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-medium">No renewals found</h3>
                <p className="mt-2 text-muted-foreground">
                  Try a different search term, or import data to get started.
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
                      <TableHead className="text-right">Actions</TableHead>
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
                          <div className="font-medium">{renewal.customer_name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{renewal.policy_number}</div>
                        </TableCell>
                        <TableCell>
                          <div>{formatRenewalDate(renewal.renewal_date)}</div>
                          <div className="text-xs text-muted-foreground">
                            {metrics.daysUntilRenewal < 0
                              ? `${Math.abs(metrics.daysUntilRenewal)} days late`
                              : `${metrics.daysUntilRenewal} days out`}
                          </div>
                        </TableCell>
                        {/* Inline status dropdown */}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select value={renewal.status} onValueChange={(v) => handleStatusChange(renewal, v as AORenewalStatus)}>
                            <SelectTrigger className="h-8 w-[120px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="contacted">Contacted</SelectItem>
                              <SelectItem value="quoted">Quoted</SelectItem>
                              <SelectItem value="renewed">Renewed</SelectItem>
                              <SelectItem value="moved">Moved</SelectItem>
                              <SelectItem value="lost">Lost</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(renewal.current_premium)}</TableCell>
                        <TableCell>
                          {metrics.daysSinceContact === null ? (
                            <span className="text-muted-foreground text-sm">No contact logged</span>
                          ) : (
                            <>
                              <div>{metrics.daysSinceContact} day{metrics.daysSinceContact === 1 ? "" : "s"}</div>
                              <div className="text-xs text-muted-foreground">
                                Last {formatFollowUpDate(renewal.last_contact_date)}
                              </div>
                            </>
                          )}
                        </TableCell>
                        {/* Inline follow-up popover */}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs gap-1"
                                onClick={() => {
                                  if (!followUpDraft[renewal.id]) {
                                    setFollowUpDraft((prev) => ({
                                      ...prev,
                                      [renewal.id]: {
                                        date: renewal.follow_up_date || "",
                                        reason: renewal.follow_up_reason || "",
                                      },
                                    }));
                                  }
                                }}
                              >
                                <CalendarClock className="h-3.5 w-3.5" />
                                {renewal.follow_up_date
                                  ? formatFollowUpDate(renewal.follow_up_date)
                                  : "Set"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 p-4 space-y-3" align="end">
                              <p className="text-sm font-medium">Set Follow-up</p>
                              <div>
                                <Label htmlFor={`fu-date-${renewal.id}`} className="text-xs">Date *</Label>
                                <Input
                                  id={`fu-date-${renewal.id}`}
                                  type="date"
                                  className="h-8 text-sm mt-1"
                                  value={followUpDraft[renewal.id]?.date || ""}
                                  onChange={(e) => setFollowUpDraft((prev) => ({ ...prev, [renewal.id]: { ...prev[renewal.id], date: e.target.value } }))}
                                />
                              </div>
                              <div>
                                <Label htmlFor={`fu-reason-${renewal.id}`} className="text-xs">Reason</Label>
                                <Textarea
                                  id={`fu-reason-${renewal.id}`}
                                  className="text-sm mt-1 resize-none"
                                  rows={2}
                                  value={followUpDraft[renewal.id]?.reason || ""}
                                  onChange={(e) => setFollowUpDraft((prev) => ({ ...prev, [renewal.id]: { ...prev[renewal.id], reason: e.target.value } }))}
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="flex-1"
                                  disabled={!followUpDraft[renewal.id]?.date || savingFollowUp === renewal.id}
                                  onClick={() => handleSaveFollowUp(renewal)}
                                >
                                  {savingFollowUp === renewal.id ? "Saving…" : "Save"}
                                </Button>
                                {renewal.follow_up_date && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={savingFollowUp === renewal.id}
                                    onClick={() => handleClearFollowUp(renewal)}
                                  >
                                    Clear
                                  </Button>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        {/* Attention badge */}
                        <TableCell>
                          {(renewal.status === "moved" || renewal.status === "lost" || renewal.status === "cancelled" || renewal.status === "renewed") ? (
                            <div className="flex items-center gap-1.5 text-emerald-500" title="Handled — off your plate">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-xs capitalize text-emerald-600">{renewal.status}</span>
                            </div>
                          ) : renewal.status === "pending" ? (
                            <Badge className="bg-slate-700 hover:bg-slate-700">No contact yet</Badge>
                          ) : renewal.status === "contacted" ? (
                            <Badge className="bg-blue-600 hover:bg-blue-600">Quote needed</Badge>
                          ) : metrics.isFollowUpOverdue || metrics.staleReason ? (
                            <Badge variant="destructive">Follow up overdue</Badge>
                          ) : metrics.isCriticalWindow ? (
                            <Badge className="bg-orange-600 hover:bg-orange-600">Inside 5 days</Badge>
                          ) : (
                            <Badge variant="outline">On track</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm"><MoreVertical className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setTaskRenewal(renewal)}>Create Task</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(renewal.id)}>Delete</DropdownMenuItem>
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

      {/* Dialogs */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the renewal record and cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {taskRenewal && (
        <AddAORenewalTaskModal
          open={!!taskRenewal}
          onOpenChange={(open) => !open && setTaskRenewal(null)}
          renewal={taskRenewal}
        />
      )}
      <MovedStatusModal
        open={!!movedModalRenewal}
        onOpenChange={(open) => !open && setMovedModalRenewal(null)}
        onConfirm={handleMovedConfirm}
        customerName={movedModalRenewal?.customer_name}
      />
    </AppLayout>
  );
}
