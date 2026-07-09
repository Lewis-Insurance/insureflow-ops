import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { formatLocalDateDisplay, extractLocalDate, todayLocalDate, differenceFromTodayInLocalDays } from "@/lib/date/localDate";
import {
  ArrowUpDown,
  Calendar,
  CalendarClock,
  CheckCircle,
  Download,
  Eye,
  EyeOff,
  MoreVertical,
  RefreshCcw,
  Search,
  Target,
  TrendingUp,
  Upload,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { MovedStatusModal } from "@/components/renewals/MovedStatusModal";
import { TerminalStatusModal, type TerminalStatusData, type TerminalStatusType } from "@/components/renewals/TerminalStatusModal";
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
  ACTIVE_STATUSES,
  getAORenewalOperationalMetrics,
  useAORenewals,
  useDeleteAORenewal,
  useBulkDeleteAllAORenewals,
  useUpdateAORenewal,
  useUpdateAORenewalStatus,
  useSetAORenewalFollowUp,
  type AORenewal,
  type AORenewalOperationalMetrics,
  type AORenewalStatus,
  type AORenewalTerm,
} from "@/hooks/useAORenewals";
import { supabase } from "@/integrations/supabase/client";
import { AddAORenewalTaskModal } from "@/components/renewals/AddAORenewalTaskModal";

type SortField = "renewal_date" | "current_premium" | "days_since_contact" | "follow_up_date";
type ActiveTile = "follow_up_today" | "overdue_follow_up" | "renewing_7" | "no_contact_7";

const formatCurrency = (value: number | null) => {
  if (!value) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
};

const formatRenewalDate = (date: string) => formatLocalDateDisplay(date);
const formatFollowUpDate = (date: string | null) => (!date ? "Not set" : formatLocalDateDisplay(date));

const TERMINAL_STATUSES: AORenewalStatus[] = ["moved", "lost", "cancelled", "renewed"];

function RenewalUrgencyBadge({ renewal }: { renewal: AORenewal }) {
  if (TERMINAL_STATUSES.includes(renewal.status)) return <span className="text-muted-foreground text-xs">—</span>;
  const days = differenceFromTodayInLocalDays(extractLocalDate(renewal.renewal_date));
  if (days === null) return null;
  if (days < 0) return <Badge variant="destructive" className="text-xs font-semibold">OVERDUE</Badge>;
  if (days === 0) return <Badge className="bg-warning hover:bg-warning text-warning-foreground text-xs">Today</Badge>;
  if (days === 1) return <Badge className="bg-warning hover:bg-warning text-warning-foreground text-xs">Tomorrow</Badge>;
  if (days <= 7) return <Badge className="bg-warning/80 hover:bg-warning/80 text-warning-foreground text-xs">{days}d</Badge>;
  if (days <= 14) return <Badge variant="outline" className="text-xs">{days}d</Badge>;
  return <span className="text-xs text-muted-foreground">{days}d</span>;
}

const getStatusBadge = (status: AORenewalStatus) => {
  const config: Record<AORenewalStatus, { label: string; className: string }> = {
    pending:   { label: "Pending",   className: "bg-cc-surface-overlay text-cc-text-secondary border-cc-border-subtle" },
    quoted:    { label: "Quoted",    className: "bg-warning/10 text-warning border-warning/30" },
    contacted: { label: "Contacted", className: "bg-info/10 text-info border-info/30" },
    renewed:   { label: "Retained",  className: "bg-success/10 text-success border-success/30" },
    moved:     { label: "Moved",     className: "bg-info/10 text-info border-info/30" },
    lost:      { label: "Lost",      className: "bg-destructive/10 text-destructive border-destructive/30" },
    cancelled: { label: "Cancelled", className: "bg-cc-surface-overlay text-cc-text-secondary border-cc-border-subtle" },
  };
  return <Badge variant="outline" className={config[status].className}>{config[status].label}</Badge>;
};

/**
 * The "Attention" cell tells the CSR what this file needs next, based on the
 * Pending -> Quoted -> Contacted workflow (quote is built first, then we reach out).
 * A scheduled follow-up that is past due always wins - that is what this column exists for.
 */
function AttentionCell({ renewal, metrics }: { renewal: AORenewal; metrics: AORenewalOperationalMetrics }) {
  if (TERMINAL_STATUSES.includes(renewal.status)) {
    return (
      <div className="flex items-center gap-1.5 text-success" title="Handled, off your plate">
        <CheckCircle className="h-4 w-4" />
        <span className="text-xs capitalize text-success">{renewal.status}</span>
      </div>
    );
  }

  // Pending: no quote yet - warn based on how close the renewal is.
  if (renewal.status === "pending") {
    const d = metrics.daysUntilRenewal;
    if (d < 0) return <Badge variant="destructive">Renewal passed</Badge>;
    if (d === 0) return <Badge className="bg-warning hover:bg-warning text-warning-foreground">Renews today</Badge>;
    if (d === 1) return <Badge className="bg-warning hover:bg-warning text-warning-foreground">Renews tomorrow</Badge>;
    if (d <= 5) return <Badge className="bg-warning hover:bg-warning text-warning-foreground">Renews in {d}d</Badge>;
    if (d <= 30) return <Badge className="bg-warning/80 hover:bg-warning/80 text-warning-foreground">Renews in {d}d</Badge>;
    return <Badge variant="outline">Renews in {d}d</Badge>;
  }

  // Quoted: quote is done, next action is to contact the insured.
  if (renewal.status === "quoted") {
    if (metrics.isFollowUpOverdue) return <Badge variant="destructive">Follow up overdue</Badge>;
    if (metrics.isCriticalWindow) return <Badge className="bg-warning hover:bg-warning text-warning-foreground">Contact now</Badge>;
    return <Badge className="bg-info hover:bg-info text-info-foreground">Contact needed</Badge>;
  }

  // Contacted: quote is ready and the insured has been reached.
  if (renewal.status === "contacted") {
    if (metrics.isFollowUpOverdue) return <Badge variant="destructive">Follow up overdue</Badge>;
    return <Badge className="bg-success hover:bg-success text-success-foreground">Quote Ready</Badge>;
  }

  return <Badge variant="outline">On track</Badge>;
}

const QUEUE_STATE_KEY = (uid: string) => `ao-renewals-queue-state-v1-${uid}`;

export default function AORenewalsPage() {
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState("");
  const [activeTile, setActiveTile] = useState<ActiveTile | null>(null);
  const [hideClosed, setHideClosed] = useState(true);
  const [sortField, setSortField] = useState<SortField>("renewal_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [taskRenewal, setTaskRenewal] = useState<AORenewal | null>(null);
  const [followUpDraft, setFollowUpDraft] = useState<Record<string, { date: string; reason: string }>>({});
  const [savingFollowUp, setSavingFollowUp] = useState<string | null>(null);
  const [movedModalRenewal, setMovedModalRenewal] = useState<AORenewal | null>(null);
  const [terminalModalRenewal, setTerminalModalRenewal] = useState<AORenewal | null>(null);
  const [terminalModalStatus, setTerminalModalStatus] = useState<'lost' | 'cancelled' | null>(null);
  const [terminalModalLoading, setTerminalModalLoading] = useState(false);

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
            if (saved.activeTile !== undefined) setActiveTile(saved.activeTile);
            if (saved.hideClosed !== undefined) setHideClosed(saved.hideClosed);
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
      localStorage.setItem(QUEUE_STATE_KEY(currentUserId), JSON.stringify({ searchInput, activeTile, hideClosed, sortField, sortDirection }));
    } catch {}
  }, [currentUserId, searchInput, activeTile, hideClosed, sortField, sortDirection]);

  const { data: renewals = [], isLoading } = useAORenewals(
    debouncedSearch.trim() ? { search: debouncedSearch.trim() } : undefined
  );
  const updateStatusMutation = useUpdateAORenewalStatus();
  const updateRenewalMutation = useUpdateAORenewal();
  const followUpMutation = useSetAORenewalFollowUp();
  const deleteMutation = useDeleteAORenewal();
  const deleteAllMutation = useBulkDeleteAllAORenewals();

  // Shared base: hide-closed gate applied once, used by both tileCounts and visibleRenewals
  const openRenewals = useMemo(
    () => renewals.filter((r) => !hideClosed || !TERMINAL_STATUSES.includes(r.status)),
    [renewals, hideClosed],
  );

  const tileCounts = useMemo(() => {
    const today = todayLocalDate();
    return {
      followUpToday: openRenewals.filter((r) => extractLocalDate(r.follow_up_date) === today).length,
      overdueFollowUp: openRenewals.filter((r) => {
        const fuDate = extractLocalDate(r.follow_up_date);
        return fuDate !== "" && fuDate < today;
      }).length,
      renewing7: openRenewals.filter((r) => {
        const d = differenceFromTodayInLocalDays(extractLocalDate(r.renewal_date));
        return d !== null && d >= 0 && d <= 7;
      }).length,
      noContact7: openRenewals.filter((r) => {
        if (r.status === 'pending') return false;
        const m = getAORenewalOperationalMetrics(r);
        return r.last_contact_date === null || (m.daysSinceContact !== null && m.daysSinceContact >= 7);
      }).length,
    };
  }, [openRenewals]);

  const visibleRenewals = useMemo(() => {
    const today = todayLocalDate();
    return openRenewals
      .map((renewal) => ({ renewal, metrics: getAORenewalOperationalMetrics(renewal) }))
      .filter(({ renewal, metrics }) => {
        if (!activeTile) return true;
        if (activeTile === "follow_up_today") return extractLocalDate(renewal.follow_up_date) === today;
        if (activeTile === "overdue_follow_up") {
          const fuDate = extractLocalDate(renewal.follow_up_date);
          return fuDate !== "" && fuDate < today;
        }
        if (activeTile === "renewing_7") {
          return metrics.daysUntilRenewal >= 0 && metrics.daysUntilRenewal <= 7;
        }
        if (activeTile === "no_contact_7") {
          return renewal.status !== 'pending' &&
            (renewal.last_contact_date === null || (metrics.daysSinceContact !== null && metrics.daysSinceContact >= 7));
        }
        return true;
      })
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
  }, [openRenewals, activeTile, sortField, sortDirection]);

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
    if (status === 'lost' || status === 'cancelled') {
      setTerminalModalRenewal(renewal);
      setTerminalModalStatus(status);
      return;
    }
    updateStatusMutation.mutate({ id: renewal.id, status });
  };

  const handleTerminalConfirm = (_data: TerminalStatusData) => {
    if (!terminalModalRenewal || !terminalModalStatus) return;
    setTerminalModalLoading(true);
    updateStatusMutation.mutate(
      { id: terminalModalRenewal.id, status: terminalModalStatus },
      {
        onSuccess: () => {
          setTerminalModalRenewal(null);
          setTerminalModalStatus(null);
          setTerminalModalLoading(false);
        },
        onError: () => setTerminalModalLoading(false),
      },
    );
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
    const headers = ["Customer","Policy Number","Renewal Date","Status","Premium","Days Since Contact","Follow Up Due","Urgency"];
    const rows = visibleRenewals.map(({ renewal, metrics }) => [
      renewal.customer_name, renewal.policy_number, renewal.renewal_date, renewal.status,
      renewal.current_premium ?? "", metrics.daysSinceContact ?? "", renewal.follow_up_date ?? "",
      metrics.staleReason || (metrics.isFollowUpOverdue ? "Overdue follow-up" : ""),
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

        {/* Filter tiles — click to filter the queue */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {([
            { id: "follow_up_today",  count: tileCounts.followUpToday,  label: "Follow-ups due today",    sub: "Scheduled for today" },
            { id: "overdue_follow_up",count: tileCounts.overdueFollowUp, label: "Overdue follow-ups",      sub: "Past due, still active" },
            { id: "renewing_7",       count: tileCounts.renewing7,       label: "Renewing in ≤7 days",     sub: "Active files in critical window" },
            { id: "no_contact_7",     count: tileCounts.noContact7,      label: "No contact in 7+ days",   sub: "Active files going stale" },
          ] as { id: ActiveTile; count: number; label: string; sub: string }[]).map((tile) => {
            const isActive = activeTile === tile.id;
            return (
              <button
                key={tile.id}
                type="button"
                onClick={() => setActiveTile(isActive ? null : tile.id)}
                className={`rounded-lg border p-4 text-left transition-all hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? "border-primary bg-primary/5 ring-1 ring-primary" : ""}`}
              >
                <div className={`text-3xl font-bold tabular-nums ${tile.count > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                  {tile.count}
                </div>
                <div className="mt-1 text-sm font-medium">{tile.label}</div>
                <div className="text-xs text-muted-foreground">{tile.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Search + active filter chip */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search insured or policy number"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          {activeTile && (
            <Badge
              variant="secondary"
              className="cursor-pointer gap-1 font-normal"
              onClick={() => setActiveTile(null)}
            >
              Filter active · click to clear ×
            </Badge>
          )}
          <Button
            size="sm"
            onClick={() => setHideClosed((v) => !v)}
            className={hideClosed
              ? "bg-success hover:bg-success/90 text-success-foreground border-success"
              : ""}
            variant={hideClosed ? "default" : "outline"}
          >
            {hideClosed
              ? <><EyeOff className="mr-2 h-4 w-4" />Hide closed</>
              : <><Eye className="mr-2 h-4 w-4" />Show closed</>}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => {
            setSearchInput(""); setActiveTile(null); setHideClosed(true);
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
                          <div className="mt-0.5"><RenewalUrgencyBadge renewal={renewal} /></div>
                        </TableCell>
                        {/* Inline status dropdown */}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select value={renewal.status} onValueChange={(v) => handleStatusChange(renewal, v as AORenewalStatus)}>
                            <SelectTrigger className="h-8 w-[120px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="quoted">Quoted</SelectItem>
                              <SelectItem value="contacted">Contacted</SelectItem>
                              {renewal.status === 'renewed' && (
                                <SelectItem value="renewed" disabled>Retained (existing)</SelectItem>
                              )}
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
                          <AttentionCell renewal={renewal} metrics={metrics} />
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
      {terminalModalStatus && (
        <TerminalStatusModal
          open={!!terminalModalRenewal}
          onOpenChange={(open) => {
            if (!open) { setTerminalModalRenewal(null); setTerminalModalStatus(null); }
          }}
          onConfirm={handleTerminalConfirm}
          isLoading={terminalModalLoading}
          statusType={terminalModalStatus as TerminalStatusType}
          currentExpirationDate={terminalModalRenewal?.renewal_date}
        />
      )}
    </AppLayout>
  );
}
