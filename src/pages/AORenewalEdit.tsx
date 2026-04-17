import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppLayout } from '@/components/layout/AppLayout';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, CheckSquare, ArrowRightLeft, CalendarClock } from 'lucide-react';
import { useAORenewal, useUpdateAORenewal, type AORenewalStatus, type AORenewalPriority, type AORenewal, type AORenewalTerm } from '@/hooks/useAORenewals';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AddAORenewalTaskModal } from '@/components/renewals/AddAORenewalTaskModal';
import { MovedStatusModal } from '@/components/renewals/MovedStatusModal';
import { useProfiles } from '@/hooks/useProfiles';
import { AORenewalNotes } from '@/components/renewals/AORenewalNotes';
import { AORenewalContactLog } from '@/components/renewals/AORenewalContactLog';
import { AORenewalQuotes } from '@/components/renewals/AORenewalQuotes';
import { AORenewalDocuments } from '@/components/renewals/AORenewalDocuments';
import { addDaysLocalDate, differenceFromTodayInLocalDays, extractLocalDate, formatLocalDateDisplay, todayLocalDate } from '@/lib/date/localDate';

export default function AORenewalEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const { data: renewal, isLoading } = useAORenewal(id);
  const updateMutation = useUpdateAORenewal();
  const { profiles } = useProfiles();

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMovedModal, setShowMovedModal] = useState(false);
  const [pendingMovedStatus, setPendingMovedStatus] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState({ date: '', reason: '', note: '' });
  const [followUpSaving, setFollowUpSaving] = useState(false);

  // Track if we've loaded initial data to prevent form reset after save
  const initialDataLoaded = useRef(false);

  const [formData, setFormData] = useState({
    customer_name: '',
    policy_number: '',
    policy_type: '',
    renewal_date: '',
    current_premium: '',
    term_months: '' as '' | '6' | '12',
    status: 'pending' as AORenewalStatus,
    priority: 'normal' as AORenewalPriority,
    assigned_to: '',
    last_contact_date: '',
    follow_up_date: '',
    follow_up_reason: '',
    follow_up_note: '',
    losses_3yr: '',
    oldest_in_household: '',
    moved_carrier: '' as string,
    moved_term: '' as '' | AORenewalTerm,
    moved_premium: '' as string,
  });

  // Only populate form data on initial load to prevent reset after save
  useEffect(() => {
    if (renewal && !initialDataLoaded.current) {
      initialDataLoaded.current = true;
      const nextFormData = {
        customer_name: renewal.customer_name || '',
        policy_number: renewal.policy_number || '',
        policy_type: renewal.policy_type || '',
        renewal_date: extractLocalDate(renewal.renewal_date),
        current_premium: renewal.current_premium?.toString() || '',
        term_months: renewal.term_months ? renewal.term_months.toString() as '6' | '12' : '',
        status: renewal.status || 'pending',
        priority: renewal.priority || 'normal',
        assigned_to: renewal.assigned_to || '',
        last_contact_date: extractLocalDate(renewal.last_contact_date),
        follow_up_date: extractLocalDate(renewal.follow_up_date),
        follow_up_reason: renewal.follow_up_reason || '',
        follow_up_note: renewal.follow_up_note || '',
        losses_3yr: renewal.losses_3yr?.toString() || '',
        oldest_in_household: renewal.oldest_in_household?.toString() || '',
        moved_carrier: renewal.moved_carrier || '',
        moved_term: renewal.moved_term || '',
        moved_premium: renewal.moved_premium?.toString() || '',
      };
      setFormData(nextFormData);
      setFollowUpDraft({
        date: nextFormData.follow_up_date,
        reason: nextFormData.follow_up_reason,
        note: nextFormData.follow_up_note,
      });
    }
  }, [renewal]);

  // Handle status change - show modal if moved
  const handleStatusChange = (newStatus: AORenewalStatus) => {
    if (newStatus === 'moved' && formData.status !== 'moved') {
      setPendingMovedStatus(true);
      setShowMovedModal(true);
    } else {
      setFormData(prev => ({ ...prev, status: newStatus }));
    }
  };

  // Handle moved modal confirmation
  const handleMovedConfirm = (data: { carrier: string; term: AORenewalTerm; premium: number }) => {
    setFormData(prev => ({
      ...prev,
      status: 'moved',
      moved_carrier: data.carrier,
      moved_term: data.term,
      moved_premium: data.premium.toString(),
    }));
    setPendingMovedStatus(false);
    setShowMovedModal(false);
  };

  // Handle moved modal cancel
  const handleMovedCancel = () => {
    setPendingMovedStatus(false);
    setShowMovedModal(false);
  };

  const followUpDirty = useMemo(() => (
    followUpDraft.date !== formData.follow_up_date ||
    followUpDraft.reason !== formData.follow_up_reason ||
    followUpDraft.note !== formData.follow_up_note
  ), [followUpDraft, formData.follow_up_date, formData.follow_up_reason, formData.follow_up_note]);

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

      toast({
        title: 'Success',
        description: 'Follow-up updated',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update follow-up',
        variant: 'destructive',
      });
    } finally {
      setFollowUpSaving(false);
    }
  };

  const followUpSummary = [
    formData.follow_up_date ? `Next follow-up ${formatLocalDateDisplay(formData.follow_up_date)}` : null,
    formData.follow_up_reason || null,
    formData.follow_up_note || null,
  ].filter(Boolean).join(' • ') || 'No follow-up committed yet';

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
          term_months: formData.term_months ? parseInt(formData.term_months) as 6 | 12 : null,
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

      toast({
        title: 'Success',
        description: 'Renewal updated successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update renewal',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Card className="max-w-4xl">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!renewal) {
    return (
      <AppLayout>
        <div className="p-6">
          <Card className="max-w-2xl mx-auto">
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">Renewal not found</p>
              <Button
                variant="outline"
                onClick={() => navigate(-1)}
                className="mt-4"
              >
                Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-semibold">Edit Renewal</h1>
          </div>
          {renewal && (
            <Button variant="outline" onClick={() => setShowTaskModal(true)}>
              <CheckSquare className="h-4 w-4 mr-2" />
              Create Task
            </Button>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <Card className="max-w-4xl">
            <CardHeader>
              <CardTitle>Renewal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customer_name">Customer Name *</Label>
                  <Input
                    id="customer_name"
                    value={formData.customer_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, customer_name: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="policy_number">Policy Number *</Label>
                  <Input
                    id="policy_number"
                    value={formData.policy_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, policy_number: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="policy_type">Policy Type</Label>
                  <Input
                    id="policy_type"
                    value={formData.policy_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, policy_type: e.target.value }))}
                    placeholder="e.g., Personal Automobile"
                  />
                </div>

                <div>
                  <Label htmlFor="renewal_date">Renewal Date *</Label>
                  <Input
                    id="renewal_date"
                    type="date"
                    value={formData.renewal_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, renewal_date: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="current_premium">Current Premium</Label>
                  <Input
                    id="current_premium"
                    type="number"
                    step="0.01"
                    value={formData.current_premium}
                    onChange={(e) => setFormData(prev => ({ ...prev, current_premium: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <Label htmlFor="term_months">Policy Term</Label>
                  <Select
                    value={formData.term_months || "not_set"}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, term_months: value === "not_set" ? '' : value as '6' | '12' }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select term" />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="not_set">Not Set</SelectItem>
                      <SelectItem value="6">6 Months (Semi-Annual)</SelectItem>
                      <SelectItem value="12">12 Months (Annual)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="assigned_to">Assigned To</Label>
                  <Select
                    value={formData.assigned_to || "unassigned"}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, assigned_to: value === "unassigned" ? "" : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {profiles?.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.full_name || 'Unknown User'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => handleStatusChange(value as AORenewalStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="quoted">Quoted</SelectItem>
                      <SelectItem value="waiting_on_insured">Waiting on Insured</SelectItem>
                      <SelectItem value="renewed">Retained</SelectItem>
                      <SelectItem value="moved">Moved</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value as AORenewalPriority }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="last_contact_date">Last Contact Date</Label>
                  <Input
                    id="last_contact_date"
                    type="date"
                    value={formData.last_contact_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, last_contact_date: e.target.value }))}
                  />
                </div>

                <div>
                  <Label htmlFor="losses_3yr">3 Year # of Losses</Label>
                  <Input
                    id="losses_3yr"
                    type="number"
                    min="0"
                    value={formData.losses_3yr}
                    onChange={(e) => setFormData(prev => ({ ...prev, losses_3yr: e.target.value }))}
                    placeholder="0"
                  />
                </div>

                <div>
                  <Label htmlFor="oldest_in_household">Oldest in Household</Label>
                  <Input
                    id="oldest_in_household"
                    type="number"
                    min="0"
                    max="120"
                    value={formData.oldest_in_household}
                    onChange={(e) => setFormData(prev => ({ ...prev, oldest_in_household: e.target.value }))}
                    placeholder="Age"
                  />
                </div>
              </div>

              {/* Moved Details Section */}
              {formData.status === 'moved' && formData.moved_carrier && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100">Policy Moved Details</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">New Carrier</Label>
                      <p className="font-medium">{formData.moved_carrier}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Policy Term</Label>
                      <p className="font-medium">
                        {formData.moved_term === '6_month' ? '6 Months' : formData.moved_term === 'annual' ? 'Annual' : '-'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">New Premium</Label>
                      <p className="font-medium">
                        {formData.moved_premium
                          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(formData.moved_premium))
                          : '-'}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setShowMovedModal(true)}
                  >
                    Edit Moved Details
                  </Button>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(-1)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>


        {renewal && (
          <Card className="max-w-4xl">
            <CardHeader>
              <CardTitle>Follow-Up</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CalendarClock className="h-4 w-4" />
                  Current follow-up commitment
                </div>
                <div className="text-sm text-muted-foreground">{followUpSummary}</div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {(() => {
                  const diff = differenceFromTodayInLocalDays(followUpDraft.date);
                  let label = 'Not set';
                  let tone = 'outline';
                  if (diff !== null) {
                    if (diff < 0) {
                      label = `Overdue by ${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'}`;
                      tone = 'destructive';
                    } else if (diff === 0) {
                      label = 'Due today';
                      tone = 'default';
                    } else {
                      label = `Due in ${diff} day${diff === 1 ? '' : 's'}`;
                    }
                  }
                  const badgeVariant = tone === 'destructive' ? 'destructive' : tone === 'default' ? 'default' : 'outline';
                  return <Badge variant={badgeVariant}>{label}</Badge>;
                })()}
                <span className="text-sm text-muted-foreground">Current status: <strong className="text-foreground">{renewal.status.replaceAll('_', ' ')}</strong></span>
                <span className="text-sm text-muted-foreground">Last contact: <strong className="text-foreground">{renewal.last_contact_date ? extractLocalDate(renewal.last_contact_date) : 'None logged'}</strong></span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="follow_up_panel_date">Follow-Up Date</Label>
                  <Input
                    id="follow_up_panel_date"
                    type="date"
                    value={followUpDraft.date}
                    onChange={(e) => setFollowUpDraft(prev => ({ ...prev, date: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => {
                      setFollowUpDraft(prev => ({ ...prev, date: addDaysLocalDate(todayLocalDate(), 1) }));
                    }}>Tomorrow</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => {
                      setFollowUpDraft(prev => ({ ...prev, date: addDaysLocalDate(todayLocalDate(), 3) }));
                    }}>+3 days</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => {
                      setFollowUpDraft(prev => ({ ...prev, date: addDaysLocalDate(todayLocalDate(), 7) }));
                    }}>+7 days</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => {
                      const base = new Date();
                      const day = base.getDay();
                      const add = day === 0 ? 1 : 8 - day;
                      setFollowUpDraft(prev => ({ ...prev, date: addDaysLocalDate(base, add) }));
                    }}>Next week</Button>
                  </div>
                </div>
                <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground space-y-2">
                  <div>Set the next committed callback date here so the file never drifts.</div>
                  <div><strong>Recommended:</strong> {formData.status === 'waiting_on_insured' ? '3 to 7 days depending on renewal pressure.' : formData.status === 'quoted' ? '1 to 3 days so quotes do not sit quietly.' : 'Use a real follow-up date whenever the next touch is committed.'}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="follow_up_reason">Follow-Up Reason</Label>
                  <Input
                    id="follow_up_reason"
                    value={followUpDraft.reason}
                    maxLength={120}
                    onChange={(e) => setFollowUpDraft(prev => ({ ...prev, reason: e.target.value }))}
                    placeholder="e.g. waiting on insured, quote review"
                  />
                </div>
                <div>
                  <Label htmlFor="follow_up_note">Follow-Up Note</Label>
                  <Textarea
                    id="follow_up_note"
                    value={followUpDraft.note}
                    maxLength={240}
                    onChange={(e) => setFollowUpDraft(prev => ({ ...prev, note: e.target.value }))}
                    placeholder="Short context for the next call"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button type="button" variant="outline" onClick={() => setFollowUpDraft({ date: '', reason: '', note: '' })}>Clear</Button>
                <Button type="button" onClick={handleConfirmFollowUp} disabled={!followUpDirty || followUpSaving || updateMutation.isPending}>
                  {(followUpSaving || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Confirm Follow-Up
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Documents Section */}
        {renewal && (
          <AORenewalDocuments
            renewalId={renewal.id}
            customerName={renewal.customer_name}
            policyNumber={renewal.policy_number}
          />
        )}

        {/* Quotes Section */}
        {renewal && (
          <AORenewalQuotes 
            renewalId={renewal.id} 
            currentPremium={renewal.current_premium}
            currentTermMonths={renewal.term_months}
          />
        )}

        {/* Contact Log Section */}
        {renewal && (
          <AORenewalContactLog
            renewalId={renewal.id}
            currentStatus={renewal.status}
            currentFollowUpDate={renewal.follow_up_date}
            currentFollowUpReason={renewal.follow_up_reason}
            currentFollowUpNote={renewal.follow_up_note}
          />
        )}

        {/* Notes Section */}
        {renewal && <AORenewalNotes renewalId={renewal.id} />}

        {/* Task Modal */}
        {renewal && (
          <AddAORenewalTaskModal
            open={showTaskModal}
            onOpenChange={setShowTaskModal}
            renewal={renewal}
          />
        )}

        {/* Moved Status Modal */}
        <MovedStatusModal
          open={showMovedModal}
          onOpenChange={handleMovedCancel}
          onConfirm={handleMovedConfirm}
          customerName={formData.customer_name}
        />
      </div>
    </AppLayout>
  );
}
