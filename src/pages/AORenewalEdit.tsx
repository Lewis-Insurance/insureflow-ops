import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAORenewal, useUpdateAORenewal, type AORenewalPriority, type AORenewalStatus, type AORenewalTerm } from "@/hooks/useAORenewals";
import { AddAORenewalTaskModal } from "@/components/renewals/AddAORenewalTaskModal";
import { MovedStatusModal } from "@/components/renewals/MovedStatusModal";
import { AORenewalNotes } from "@/components/renewals/AORenewalNotes";
import { AORenewalContactLog } from "@/components/renewals/AORenewalContactLog";
import { AORenewalQuotes } from "@/components/renewals/AORenewalQuotes";
import { AORenewalDocuments } from "@/components/renewals/AORenewalDocuments";
import {
  addDaysLocalDate,
  differenceFromTodayInLocalDays,
  extractLocalDate,
  formatLocalDateDisplay,
  todayLocalDate,
} from "@/lib/date/localDate";
import {
  ArrowLeft,
  ArrowRightLeft,
  CalendarClock,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<AORenewalStatus, string> = {
  pending: "bg-slate-500/15 text-slate-200 border-slate-400/30",
  contacted: "bg-sky-500/15 text-sky-200 border-sky-400/30",
  quoted: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  waiting_on_insured: "bg-amber-500/15 text-amber-200 border-amber-400/30",
  renewed: "bg-green-500/15 text-green-200 border-green-400/30",
  moved: "bg-blue-500/15 text-blue-200 border-blue-400/30",
  lost: "bg-rose-500/15 text-rose-200 border-rose-400/30",
  cancelled: "bg-zinc-500/15 text-zinc-200 border-zinc-400/30",
};

const PRIORITY_STYLES: Record<AORenewalPriority, string> = {
  low: "bg-slate-500/10 text-slate-200 border-slate-400/30",
  normal: "bg-violet-500/10 text-violet-200 border-violet-400/30",
  high: "bg-orange-500/10 text-orange-200 border-orange-400/30",
  urgent: "bg-rose-500/10 text-rose-200 border-rose-400/30",
};

const surfaceCard = "border-white/10 bg-[#0b1020]/90 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur";
const heroTile = "rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
const sectionTitle = "text-base font-semibold tracking-tight text-white";
const sectionDescription = "text-sm text-slate-400";
const panelCardContent = "overflow-hidden transition-all duration-200 ease-out data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down";
const PANEL_PREFS_KEY = "ao-renewal-panel-prefs-v1";

function loadPanelPrefs() {
  if (typeof window === "undefined") {
    return { details: true, followUp: true, workspace: true };
  }

  try {
    const raw = window.localStorage.getItem(PANEL_PREFS_KEY);
    if (!raw) return { details: true, followUp: true, workspace: true };
    return { details: true, followUp: true, workspace: true, ...JSON.parse(raw) };
  } catch {
    return { details: true, followUp: true, workspace: true };
  }
}

function formatCurrency(value?: string | number | null) {
  const amount = typeof value === "string" ? Number(value) : value;
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export default function AORenewalEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: renewal, isLoading } = useAORenewal(id);
  const updateMutation = useUpdateAORenewal();

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMovedModal, setShowMovedModal] = useState(false);
  const [pendingMovedStatus, setPendingMovedStatus] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState({ date: "", reason: "", note: "" });
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [panelPrefs, setPanelPrefs] = useState(loadPanelPrefs);

  const initialDataLoaded = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PANEL_PREFS_KEY, JSON.stringify(panelPrefs));
    }
  }, [panelPrefs]);

  const [formData, setFormData] = useState({
    customer_name: "",
    policy_number: "",
    policy_type: "",
    renewal_date: "",
    current_premium: "",
    term_months: "" as "" | "6" | "12",
    status: "pending" as AORenewalStatus,
    priority: "normal" as AORenewalPriority,
    assigned_to: "",
    last_contact_date: "",
    follow_up_date: "",
    follow_up_reason: "",
    follow_up_note: "",
    losses_3yr: "",
    oldest_in_household: "",
    moved_carrier: "",
    moved_term: "" as "" | AORenewalTerm,
    moved_premium: "",
  });

  useEffect(() => {
    if (renewal && !initialDataLoaded.current) {
      initialDataLoaded.current = true;
      const nextFormData = {
        customer_name: renewal.customer_name || "",
        policy_number: renewal.policy_number || "",
        policy_type: renewal.policy_type || "",
        renewal_date: extractLocalDate(renewal.renewal_date),
        current_premium: renewal.current_premium?.toString() || "",
        term_months: renewal.term_months ? (renewal.term_months.toString() as "6" | "12") : "",
        status: renewal.status || "pending",
        priority: renewal.priority || "normal",
        assigned_to: renewal.assigned_to || "",
        last_contact_date: extractLocalDate(renewal.last_contact_date),
        follow_up_date: extractLocalDate(renewal.follow_up_date),
        follow_up_reason: renewal.follow_up_reason || "",
        follow_up_note: renewal.follow_up_note || "",
        losses_3yr: renewal.losses_3yr?.toString() || "",
        oldest_in_household: renewal.oldest_in_household?.toString() || "",
        moved_carrier: renewal.moved_carrier || "",
        moved_term: renewal.moved_term || "",
        moved_premium: renewal.moved_premium?.toString() || "",
      };
      setFormData(nextFormData);
      setFollowUpDraft({
        date: nextFormData.follow_up_date,
        reason: nextFormData.follow_up_reason,
        note: nextFormData.follow_up_note,
      });
    }
  }, [renewal]);

  const handleStatusChange = (newStatus: AORenewalStatus) => {
    if (newStatus === "moved" && formData.status !== "moved") {
      setPendingMovedStatus(true);
      setShowMovedModal(true);
    } else {
      setFormData((prev) => ({ ...prev, status: newStatus }));
    }
  };

  const handleMovedConfirm = (data: { carrier: string; term: AORenewalTerm; premium: number }) => {
    setFormData((prev) => ({
      ...prev,
      status: "moved",
      moved_carrier: data.carrier,
      moved_term: data.term,
      moved_premium: data.premium.toString(),
    }));
    setPendingMovedStatus(false);
    setShowMovedModal(false);
  };

  const handleMovedCancel = () => {
    setPendingMovedStatus(false);
    setShowMovedModal(false);
  };

  const followUpDirty = useMemo(
    () =>
      followUpDraft.date !== formData.follow_up_date ||
      followUpDraft.reason !== formData.follow_up_reason ||
      followUpDraft.note !== formData.follow_up_note,
    [followUpDraft, formData.follow_up_date, formData.follow_up_reason, formData.follow_up_note],
  );

  const handleConfirmFollowUp = async () => {
    if (!id) return;

    setFollowUpSaving(true);
    try {
      await updateMutation.mutateAsync({
        id,
        updates: {
          follow_up_date: followUpDraft.date || null,
          follow_up_reason: followUpDraft.reason.trim() || null,
          follow_up_note: followUpDraft.note.trim() || null,
        },
      });

      setFormData((prev) => ({
        ...prev,
        follow_up_date: followUpDraft.date,
        follow_up_reason: followUpDraft.reason,
        follow_up_note: followUpDraft.note,
      }));

      toast({ title: "Success", description: "Follow-up updated" });
    } catch {
      toast({ title: "Error", description: "Failed to update follow-up", variant: "destructive" });
    } finally {
      setFollowUpSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    try {
      await updateMutation.mutateAsync({
        id,
        updates: {
          customer_name: formData.customer_name.trim(),
          policy_number: formData.policy_number.trim(),
          policy_type: formData.policy_type.trim(),
          renewal_date: formData.renewal_date,
          current_premium: parseFloat(formData.current_premium) || null,
          term_months: formData.term_months ? (parseInt(formData.term_months) as 6 | 12) : null,
          status: formData.status,
          priority: formData.priority,
          assigned_to: formData.assigned_to.trim() || null,
          last_contact_date: formData.last_contact_date || null,
          follow_up_date: formData.follow_up_date || null,
          follow_up_reason: formData.follow_up_reason.trim() || null,
          follow_up_note: formData.follow_up_note.trim() || null,
          losses_3yr: formData.losses_3yr ? parseInt(formData.losses_3yr) : null,
          oldest_in_household: formData.oldest_in_household ? parseInt(formData.oldest_in_household) : null,
          moved_carrier: formData.moved_carrier || null,
          moved_term: formData.moved_term || null,
          moved_premium: formData.moved_premium ? parseFloat(formData.moved_premium) : null,
        },
      });

      toast({ title: "Success", description: "Renewal updated successfully" });
    } catch {
      toast({ title: "Error", description: "Failed to update renewal", variant: "destructive" });
    }
  };

  const togglePanel = (panel: keyof typeof panelPrefs) => {
    setPanelPrefs((prev) => ({ ...prev, [panel]: !prev[panel] }));
  };

  const followUpSummary = [
    formData.follow_up_date ? `Next follow-up ${formatLocalDateDisplay(formData.follow_up_date)}` : null,
    formData.follow_up_reason || null,
    formData.follow_up_note || null,
  ]
    .filter(Boolean)
    .join(" • ") || "No follow-up committed yet";

  const followUpDiff = differenceFromTodayInLocalDays(followUpDraft.date);
  const daysToRenewal = differenceFromTodayInLocalDays(formData.renewal_date);
  const commandStateLabel =
    followUpDiff === null
      ? "No follow-up set"
      : followUpDiff < 0
        ? `Overdue by ${Math.abs(followUpDiff)} day${Math.abs(followUpDiff) === 1 ? "" : "s"}`
        : followUpDiff === 0
          ? "Due today"
          : `Due in ${followUpDiff} day${followUpDiff === 1 ? "" : "s"}`;
  const renewalWindowLabel =
    daysToRenewal === null
      ? "Renewal date missing"
      : daysToRenewal < 0
        ? `Renewed ${Math.abs(daysToRenewal)} day${Math.abs(daysToRenewal) === 1 ? "" : "s"} ago`
        : daysToRenewal === 0
          ? "Renews today"
          : `Renews in ${daysToRenewal} day${daysToRenewal === 1 ? "" : "s"}`;
  const movedDetailsReady = formData.status === "moved" && formData.moved_carrier;
  const followUpHeadline = formData.follow_up_date ? formatLocalDateDisplay(formData.follow_up_date) : "No follow-up date";

  if (isLoading) {
    return <AppLayout><div className="min-h-screen bg-[#060b16] p-6 md:p-8"><div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6"><Skeleton className="h-16 w-full rounded-3xl bg-white/5" /><div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]"><Skeleton className="h-[460px] rounded-3xl bg-white/5" /><Skeleton className="h-[460px] rounded-3xl bg-white/5" /></div><Skeleton className="h-[520px] rounded-3xl bg-white/5" /></div></div></AppLayout>;
  }

  if (!renewal) {
    return <AppLayout><div className="min-h-screen bg-[#060b16] p-6 md:p-8"><Card className={cn(surfaceCard, "mx-auto max-w-2xl rounded-3xl")}><CardContent className="pt-6 text-center"><p className="text-slate-300">Renewal not found</p><Button variant="outline" onClick={() => navigate(-1)} className="mt-4">Back</Button></CardContent></Card></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#060b16] p-4 md:p-6 xl:p-8">
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
          <div className="overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(76,101,255,0.25),_transparent_26%),linear-gradient(180deg,_rgba(15,23,42,0.96),_rgba(7,11,22,0.98))] p-5 shadow-[0_32px_120px_rgba(0,0,0,0.45)] md:p-7">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <Button variant="ghost" className="h-9 rounded-full border border-white/10 bg-white/5 px-4 text-slate-200 hover:bg-white/10" onClick={() => navigate(-1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-400">AO Renewal Command Center</span>
                </div>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">{formData.customer_name || "Edit Renewal"}</h1>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Badge className={cn("border px-3 py-1.5 text-sm capitalize", STATUS_STYLES[formData.status])}>{formData.status.replaceAll("_", " ")}</Badge>
                  <Badge className={cn("border px-3 py-1.5 text-sm capitalize", PRIORITY_STYLES[formData.priority])}>{formData.priority} priority</Badge>
                  <Badge variant="outline" className="border-white/15 bg-white/5 px-3 py-1.5 text-sm text-slate-200">{formData.policy_number || "No policy number"}</Badge>
                  <Badge variant="outline" className="border-white/15 bg-white/5 px-3 py-1.5 text-sm text-slate-200">{formData.policy_type || "Policy type not set"}</Badge>
                </div>
              </div>

              <div className="flex w-full flex-col gap-3 xl:max-w-sm">
                <Button className="h-12 rounded-2xl bg-white text-slate-950 hover:bg-slate-100" onClick={() => setShowTaskModal(true)} variant="default"><CheckSquare className="mr-2 h-4 w-4" />Create Task</Button>
                <Button type="submit" form="ao-renewal-command-form" className="h-12 rounded-2xl bg-lime-300 text-slate-950 hover:bg-lime-200" disabled={updateMutation.isPending}>{updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Changes</Button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Renewal Window</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{renewalWindowLabel}</div>
                    <p className="mt-2 text-sm text-slate-400">Renewal date {formData.renewal_date ? formatLocalDateDisplay(formData.renewal_date) : "not set"}</p>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Current Follow-Up</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{commandStateLabel}</div>
                    <p className="mt-2 text-sm text-slate-400">{followUpDraft.date ? formatLocalDateDisplay(followUpDraft.date) : "No date committed"}</p>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Premium</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{formatCurrency(formData.current_premium)}</div>
                    <p className="mt-2 text-sm text-slate-400">{formData.term_months ? `${formData.term_months}-month term` : "Term not set"}</p>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Last Contact</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{formData.last_contact_date ? formatLocalDateDisplay(formData.last_contact_date) : "Not logged"}</div>
                    <p className="mt-2 text-sm text-slate-400">{formData.follow_up_reason || formData.follow_up_note || "No follow-up context saved."}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-lime-300/20 bg-lime-300/8 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-lime-200/70">Quote</div>
                {bestQuote ? (
                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="text-2xl font-semibold text-white">{bestQuote.carrier}</div>
                      <p className="mt-1 text-sm text-slate-300">Most useful quote currently on file</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className={heroTile}>
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Carrier</div>
                        <div className="mt-2 text-lg font-semibold text-white">{bestQuote.carrier}</div>
                      </div>
                      <div className={heroTile}>
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Premium</div>
                        <div className="mt-2 text-lg font-semibold text-white">{formatAppCurrency(bestQuote.premium)}</div>
                      </div>
                      <div className={heroTile}>
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Term</div>
                        <div className="mt-2 text-lg font-semibold text-white">{bestQuote.term_months} months</div>
                      </div>
                      <div className={heroTile}>
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Savings</div>
                        <div className="mt-2 text-lg font-semibold text-white">{savingsAmount === null ? "—" : savingsAmount >= 0 ? formatAppCurrency(savingsAmount) : `+${formatAppCurrency(Math.abs(savingsAmount))}`}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3">
                    <div className="text-2xl font-semibold text-white">No quote yet</div>
                    <p className="mt-2 text-sm text-slate-300">Once a quote is added, the key carrier, premium, term, and savings will live here.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-start">
            <div className="space-y-6">
              <Card className={cn(surfaceCard, "rounded-3xl")}>
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className={sectionTitle}>Quotes</CardTitle>
                      <CardDescription className={sectionDescription}>
                        Enter every live option here, compare them fast, and keep the real selling surface above the fold.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <AORenewalQuotes
                    renewalId={renewal.id}
                    currentPremium={renewal.current_premium}
                    currentTermMonths={renewal.term_months}
                  />
                </CardContent>
              </Card>

              <Card className={cn(surfaceCard, "rounded-3xl")}><CardHeader className="pb-4"><div className="flex items-start justify-between gap-3"><div><CardTitle className={sectionTitle}>Follow-Up Command Panel</CardTitle><CardDescription className={sectionDescription}>Set the current commitment here. Make the next touch obvious and enforceable.</CardDescription></div><Button type="button" variant="ghost" size="sm" className="text-slate-300 hover:bg-white/5 hover:text-white" onClick={() => togglePanel("followUp")}>{panelPrefs.followUp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button></div></CardHeader>{panelPrefs.followUp && <CardContent className={cn(panelCardContent, "space-y-5")}><div className="rounded-3xl border border-white/10 bg-white/5 p-5"><div className="flex items-center gap-2 text-sm font-medium text-white"><CalendarClock className="h-4 w-4 text-lime-300" />Current follow-up commitment</div><div className="mt-3 text-xl font-semibold text-white">{followUpHeadline}</div><div className="mt-2 text-sm text-slate-300">{formData.follow_up_reason || "No reason set"}</div>{formData.follow_up_note ? <div className="mt-1 text-sm text-slate-400">{formData.follow_up_note}</div> : null}</div><div className="grid gap-3 sm:grid-cols-3"><div className={heroTile}><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Follow-Up State</div><div className="mt-2 text-lg font-semibold text-white">{commandStateLabel}</div></div><div className={heroTile}><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Current Status</div><div className="mt-2 text-lg font-semibold capitalize text-white">{renewal.status.replaceAll("_", " ")}</div></div><div className={heroTile}><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Last Contact</div><div className="mt-2 text-lg font-semibold text-white">{renewal.last_contact_date ? formatLocalDateDisplay(renewal.last_contact_date) : "None logged"}</div></div></div><div className="space-y-2"><Label htmlFor="follow_up_panel_date">Follow-Up Date</Label><Input id="follow_up_panel_date" type="date" value={followUpDraft.date} onChange={(e) => setFollowUpDraft((prev) => ({ ...prev, date: e.target.value }))} className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white" /><div className="grid grid-cols-2 gap-2 lg:grid-cols-4"><Button type="button" variant="outline" className="h-11 rounded-2xl border-white/10 bg-white/5 text-sm text-slate-100 hover:bg-white/10" onClick={() => setFollowUpDraft((prev) => ({ ...prev, date: addDaysLocalDate(todayLocalDate(), 1) }))}>Tomorrow</Button><Button type="button" variant="outline" className="h-11 rounded-2xl border-white/10 bg-white/5 text-sm text-slate-100 hover:bg-white/10" onClick={() => setFollowUpDraft((prev) => ({ ...prev, date: addDaysLocalDate(todayLocalDate(), 3) }))}>+3 days</Button><Button type="button" variant="outline" className="h-11 rounded-2xl border-white/10 bg-white/5 text-sm text-slate-100 hover:bg-white/10" onClick={() => setFollowUpDraft((prev) => ({ ...prev, date: addDaysLocalDate(todayLocalDate(), 7) }))}>+7 days</Button><Button type="button" variant="outline" className="h-11 rounded-2xl border-white/10 bg-white/5 text-sm text-slate-100 hover:bg-white/10" onClick={() => { const base = new Date(); const day = base.getDay(); const add = day === 0 ? 1 : 8 - day; setFollowUpDraft((prev) => ({ ...prev, date: addDaysLocalDate(base, add) })); }}>Next week</Button></div></div><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="follow_up_reason">Follow-Up Reason</Label><Input id="follow_up_reason" value={followUpDraft.reason} maxLength={120} onChange={(e) => setFollowUpDraft((prev) => ({ ...prev, reason: e.target.value }))} placeholder="e.g. quote review, waiting on insured" className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white" /></div><div className="space-y-2"><Label htmlFor="follow_up_note">Follow-Up Note</Label><Textarea id="follow_up_note" value={followUpDraft.note} maxLength={240} onChange={(e) => setFollowUpDraft((prev) => ({ ...prev, note: e.target.value }))} placeholder="Short context for the next call" rows={4} className="rounded-2xl border-white/10 bg-white/5 text-base text-white" /></div></div><div className="rounded-3xl border border-dashed border-white/10 bg-[#11192b] p-4 text-sm text-slate-300"><p>Recommended: <strong className="text-white">{formData.status === "waiting_on_insured" ? "3 to 7 days depending on renewal pressure." : formData.status === "quoted" ? "1 to 3 days so quotes do not sit quietly." : "Use a real follow-up date whenever the next touch is committed."}</strong></p></div><div className="flex flex-wrap gap-3"><Button type="button" variant="outline" className="h-11 rounded-2xl border-white/10 bg-white/5 text-slate-100 hover:bg-white/10" onClick={() => setFollowUpDraft({ date: "", reason: "", note: "" })}>Clear</Button><Button type="button" className="h-11 rounded-2xl bg-lime-300 text-slate-950 hover:bg-lime-200" onClick={handleConfirmFollowUp} disabled={!followUpDirty || followUpSaving || updateMutation.isPending}>{(followUpSaving || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm Follow-Up</Button></div></CardContent>}</Card>

              <Card className={cn(surfaceCard, "rounded-3xl")}><CardHeader className="pb-4"><div className="flex items-start justify-between gap-3"><div><CardTitle className={sectionTitle}>Renewal Workspace</CardTitle><CardDescription className={sectionDescription}>Log what just happened, then jump to documents or notes without losing your place.</CardDescription></div><Button type="button" variant="ghost" size="sm" className="text-slate-300 hover:bg-white/5 hover:text-white" onClick={() => togglePanel("workspace")}>{panelPrefs.workspace ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button></div></CardHeader>{panelPrefs.workspace && <CardContent className={panelCardContent}><Tabs defaultValue="contact" className="w-full"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><TabsList className="h-11 rounded-2xl bg-white/5 p-1 text-slate-400"><TabsTrigger value="contact" className="rounded-xl px-4 data-[state=active]:bg-white data-[state=active]:text-slate-950">Contact</TabsTrigger><TabsTrigger value="documents" className="rounded-xl px-4 data-[state=active]:bg-white data-[state=active]:text-slate-950">Documents</TabsTrigger><TabsTrigger value="notes" className="rounded-xl px-4 data-[state=active]:bg-white data-[state=active]:text-slate-950">Notes</TabsTrigger></TabsList></div><TabsContent value="contact" className="mt-6"><AORenewalContactLog renewalId={renewal.id} currentStatus={renewal.status} currentFollowUpDate={renewal.follow_up_date} currentFollowUpReason={renewal.follow_up_reason} currentFollowUpNote={renewal.follow_up_note} /></TabsContent><TabsContent value="documents" className="mt-6"><AORenewalDocuments renewalId={renewal.id} customerName={renewal.customer_name} policyNumber={renewal.policy_number} /></TabsContent><TabsContent value="notes" className="mt-6"><AORenewalNotes renewalId={renewal.id} /></TabsContent></Tabs></CardContent>}</Card>
            </div>

            <form id="ao-renewal-command-form" onSubmit={handleSubmit} className="space-y-6">
              <Card className={cn(surfaceCard, "rounded-3xl")}><CardHeader className="pb-4"><div className="flex items-start justify-between gap-3"><div><CardTitle className={sectionTitle}>Renewal Overview</CardTitle><CardDescription className={sectionDescription}>Keep only the facts you need to steer the file. Everything else is still here, just not fighting for attention.</CardDescription></div><Button type="button" variant="ghost" size="sm" className="text-slate-300 hover:bg-white/5 hover:text-white" onClick={() => togglePanel("details")}>{panelPrefs.details ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button></div></CardHeader>{panelPrefs.details && <CardContent className={cn(panelCardContent, "space-y-6")}><div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"><div className="space-y-2"><Label htmlFor="customer_name">Customer Name</Label><Input id="customer_name" value={formData.customer_name} onChange={(e) => setFormData((prev) => ({ ...prev, customer_name: e.target.value }))} required className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white" /></div><div className="space-y-2"><Label htmlFor="policy_number">Policy Number</Label><Input id="policy_number" value={formData.policy_number} onChange={(e) => setFormData((prev) => ({ ...prev, policy_number: e.target.value }))} required className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white" /></div><div className="space-y-2"><Label htmlFor="policy_type">Policy Type</Label><Input id="policy_type" value={formData.policy_type} onChange={(e) => setFormData((prev) => ({ ...prev, policy_type: e.target.value }))} placeholder="e.g. Personal Automobile" className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white" /></div><div className="space-y-2"><Label htmlFor="renewal_date">Renewal Date</Label><Input id="renewal_date" type="date" value={formData.renewal_date} onChange={(e) => setFormData((prev) => ({ ...prev, renewal_date: e.target.value }))} required className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white" /></div><div className="space-y-2"><Label htmlFor="current_premium">Current Premium</Label><Input id="current_premium" type="number" step="0.01" value={formData.current_premium} onChange={(e) => setFormData((prev) => ({ ...prev, current_premium: e.target.value }))} placeholder="0.00" className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white" /></div><div className="space-y-2"><Label htmlFor="term_months">Policy Term</Label><Select value={formData.term_months || "not_set"} onValueChange={(value) => setFormData((prev) => ({ ...prev, term_months: value === "not_set" ? "" : (value as "6" | "12") }))}><SelectTrigger className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white"><SelectValue placeholder="Select term" /></SelectTrigger><SelectContent className="bg-slate-950 text-white"><SelectItem value="not_set">Not set</SelectItem><SelectItem value="6">6 Months (Semi-Annual)</SelectItem><SelectItem value="12">12 Months (Annual)</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="status">Status</Label><Select value={formData.status} onValueChange={(value) => handleStatusChange(value as AORenewalStatus)}><SelectTrigger className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white"><SelectValue /></SelectTrigger><SelectContent className="bg-slate-950 text-white"><SelectItem value="pending">Pending</SelectItem><SelectItem value="contacted">Contacted</SelectItem><SelectItem value="quoted">Quoted</SelectItem><SelectItem value="waiting_on_insured">Waiting on Insured</SelectItem><SelectItem value="renewed">Retained</SelectItem><SelectItem value="moved">Moved</SelectItem><SelectItem value="lost">Lost</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="priority">Priority</Label><Select value={formData.priority} onValueChange={(value) => setFormData((prev) => ({ ...prev, priority: value as AORenewalPriority }))}><SelectTrigger className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white"><SelectValue /></SelectTrigger><SelectContent className="bg-slate-950 text-white"><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="last_contact_date">Last Contact</Label><Input id="last_contact_date" type="date" value={formData.last_contact_date} onChange={(e) => setFormData((prev) => ({ ...prev, last_contact_date: e.target.value }))} className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white" /></div><div className="space-y-2"><Label htmlFor="losses_3yr">3-Year Losses</Label><Input id="losses_3yr" type="number" min="0" value={formData.losses_3yr} onChange={(e) => setFormData((prev) => ({ ...prev, losses_3yr: e.target.value }))} className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white" /></div><div className="space-y-2"><Label htmlFor="oldest_in_household">Oldest in Household</Label><Input id="oldest_in_household" type="number" min="0" max="120" value={formData.oldest_in_household} onChange={(e) => setFormData((prev) => ({ ...prev, oldest_in_household: e.target.value }))} className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white" /></div></div>{movedDetailsReady && <div className="rounded-3xl border border-sky-400/20 bg-sky-400/10 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="rounded-2xl bg-sky-400/15 p-3 text-sky-200"><ArrowRightLeft className="h-5 w-5" /></div><div><div className="text-sm font-medium text-sky-100">Moved Policy Details</div><div className="text-sm text-sky-200/70">Captured move-away outcome for this renewal.</div></div></div><Button type="button" variant="outline" className="rounded-2xl border-sky-300/20 bg-sky-300/10 text-sky-100 hover:bg-sky-300/20" onClick={() => setShowMovedModal(true)}>Edit moved details</Button></div><div className="mt-4 grid gap-4 md:grid-cols-3"><div className={heroTile}><div className="text-xs uppercase tracking-[0.18em] text-sky-200/70">Carrier</div><div className="mt-2 text-lg font-semibold text-white">{formData.moved_carrier}</div></div><div className={heroTile}><div className="text-xs uppercase tracking-[0.18em] text-sky-200/70">Term</div><div className="mt-2 text-lg font-semibold text-white">{formData.moved_term === "6_month" ? "6 Months" : formData.moved_term === "annual" ? "Annual" : "—"}</div></div><div className={heroTile}><div className="text-xs uppercase tracking-[0.18em] text-sky-200/70">New Premium</div><div className="mt-2 text-lg font-semibold text-white">{formatCurrency(formData.moved_premium)}</div></div></div></div>}</CardContent>}</Card>
            </form>
          </div>

          <AddAORenewalTaskModal open={showTaskModal} onOpenChange={setShowTaskModal} renewal={renewal} />
          <MovedStatusModal open={showMovedModal} onOpenChange={handleMovedCancel} onConfirm={handleMovedConfirm} customerName={formData.customer_name} />
        </div>
      </div>
    </AppLayout>
  );
}
