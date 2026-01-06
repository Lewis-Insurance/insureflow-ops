import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Phone, Mail, MessageSquare, Plus, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { formatDistanceToNow, addDays, format } from 'date-fns';
import type { Renewal } from '@/hooks/useRenewalWorkflow';
import { useRenewalStatusHistory, useLogRenewalContact, ContactType, ContactDirection } from '@/hooks/useRenewalWorkflow';
import { useTasks, TaskPriority, TaskCategory } from '@/hooks/useTasks';
import { useSendSMS } from '@/hooks/useSMSMessages';
import { useComposeEmail } from '@/hooks/useEmailComposer';
import { toast } from 'sonner';

interface RenewalOverviewProps {
  renewal: Renewal;
}

export function RenewalOverview({ renewal }: RenewalOverviewProps) {
  const { data: statusHistory } = useRenewalStatusHistory(renewal.id);
  const logContact = useLogRenewalContact();
  const { createTask } = useTasks();
  const sendSMS = useSendSMS();
  const composeEmail = useComposeEmail();

  // Modal states
  const [showCallModal, setShowCallModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showSMSModal, setShowSMSModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);

  // Form states
  const [callForm, setCallForm] = useState({
    direction: 'outbound' as ContactDirection,
    outcome: '',
    notes: '',
    duration_minutes: '',
  });

  const [smsForm, setSmsForm] = useState({
    body: '',
  });

  const [emailForm, setEmailForm] = useState({
    subject: '',
    body: '',
  });

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    priority: 'medium' as TaskPriority,
    due_days: '1',
  });

  // Handle Log Call
  const handleLogCall = async () => {
    logContact.mutate(
      {
        renewalId: renewal.id,
        contact_type: 'call',
        direction: callForm.direction,
        outcome: callForm.outcome || undefined,
        notes: callForm.notes || undefined,
        duration_minutes: callForm.duration_minutes ? parseInt(callForm.duration_minutes) : undefined,
      },
      {
        onSuccess: () => {
          setShowCallModal(false);
          setCallForm({ direction: 'outbound', outcome: '', notes: '', duration_minutes: '' });
          toast.success('Call logged successfully');
        },
      }
    );
  };

  // Handle Send SMS
  const handleSendSMS = async () => {
    const phone = renewal.account?.phone;
    if (!phone) {
      toast.error('No phone number available for this account');
      return;
    }

    sendSMS.mutate(
      {
        to_number: phone,
        body: smsForm.body,
        account_id: renewal.account_id || undefined,
      },
      {
        onSuccess: () => {
          // Also log as a contact attempt
          logContact.mutate({
            renewalId: renewal.id,
            contact_type: 'sms',
            direction: 'outbound',
            notes: smsForm.body,
          });
          setShowSMSModal(false);
          setSmsForm({ body: '' });
        },
      }
    );
  };

  // Handle Send Email
  const handleComposeEmail = async () => {
    composeEmail.mutate(
      {
        scenario: 'renewal_reminder',
        recipient_id: renewal.account_id || undefined,
        recipient_type: 'account',
        tone: 'professional',
        context: {
          customer_name: renewal.account?.name,
          policy_number: renewal.policy?.policy_number,
          expiration_date: renewal.expiration_date,
          current_premium: renewal.current_premium,
        },
      },
      {
        onSuccess: (data) => {
          if (data?.email) {
            setEmailForm({
              subject: data.email.subject,
              body: data.email.body,
            });
          }
          toast.success('Email composed! Review and send from email modal.');
        },
        onError: () => {
          toast.error('Failed to compose email. Using template...');
          setEmailForm({
            subject: `Renewal Reminder - Policy ${renewal.policy?.policy_number || ''}`,
            body: `Dear ${renewal.account?.name || 'Valued Customer'},\n\nThis is a friendly reminder about your upcoming policy renewal.\n\nPolicy: ${renewal.policy?.policy_number || 'N/A'}\nExpiration: ${renewal.expiration_date ? format(new Date(renewal.expiration_date), 'MMM d, yyyy') : 'N/A'}\n\nPlease contact us at your earliest convenience to discuss your renewal options.\n\nBest regards,\nYour Insurance Team`,
          });
        },
      }
    );
    setShowEmailModal(true);
  };

  // Handle Create Task
  const handleCreateTask = async () => {
    const dueDate = addDays(new Date(), parseInt(taskForm.due_days || '1'));

    const result = await createTask({
      title: taskForm.title,
      description: taskForm.description,
      priority: taskForm.priority,
      category: 'renewal' as TaskCategory,
      due_at: dueDate.toISOString(),
      entity_type: 'renewal',
      entity_id: renewal.id,
      account_id: renewal.account_id || undefined,
    });

    if (result) {
      setShowTaskModal(false);
      setTaskForm({ title: '', description: '', priority: 'medium', due_days: '1' });
    }
  };

  // Parse risk factors if they exist
  const riskFactors = Array.isArray(renewal.risk_factors) ? renewal.risk_factors : [];

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCallModal(true)}>
              <Phone className="h-4 w-4 mr-2" />
              Log Call
            </Button>
            <Button variant="outline" size="sm" onClick={handleComposeEmail}>
              <Mail className="h-4 w-4 mr-2" />
              Send Email
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSMSModal(true)}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Send SMS
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowTaskModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Task
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Risk Factors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Risk Factors
            </CardTitle>
          </CardHeader>
          <CardContent>
            {riskFactors.length > 0 ? (
              <div className="space-y-3">
                {riskFactors.map((factor: any, index: number) => (
                  <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{factor.factor || factor.name || 'Unknown factor'}</p>
                      {factor.description && (
                        <p className="text-sm text-muted-foreground mt-1">{factor.description}</p>
                      )}
                    </div>
                    {factor.impact && (
                      <Badge variant={factor.impact === 'high' ? 'destructive' : 'secondary'}>
                        {factor.impact}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p>No risk factors identified</p>
              </div>
            )}

            {/* Risk Indicators */}
            <div className="mt-4 pt-4 border-t space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Risk Indicators</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${renewal.has_recent_claims ? 'bg-red-500' : 'bg-green-500'}`} />
                  <span>Recent Claims</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${renewal.has_payment_issues ? 'bg-red-500' : 'bg-green-500'}`} />
                  <span>Payment Issues</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${renewal.competitor_activity_detected ? 'bg-orange-500' : 'bg-green-500'}`} />
                  <span>Competitor Activity</span>
                </div>
                <div className="flex items-center gap-2">
                  {renewal.price_change_pct !== null && renewal.price_change_pct > 10 ? (
                    <>
                      <TrendingUp className="w-4 h-4 text-red-500" />
                      <span className="text-red-600">+{renewal.price_change_pct.toFixed(1)}% premium increase</span>
                    </>
                  ) : renewal.price_change_pct !== null && renewal.price_change_pct < 0 ? (
                    <>
                      <TrendingDown className="w-4 h-4 text-green-500" />
                      <span className="text-green-600">{renewal.price_change_pct.toFixed(1)}% premium decrease</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span>Stable Premium</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Activity Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {statusHistory && statusHistory.length > 0 ? (
              <div className="space-y-4">
                {statusHistory.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                      <div className="w-px flex-1 bg-border" />
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium">
                        Status changed to <Badge variant="outline">{entry.new_status}</Badge>
                      </p>
                      {entry.reason && (
                        <p className="text-sm text-muted-foreground">{entry.reason}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                        {entry.changer?.full_name && ` by ${entry.changer.full_name}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <p>No activity recorded yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Scores Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Engagement Score</p>
              <p className="text-3xl font-bold mt-1">
                {renewal.engagement_score ?? 'N/A'}
              </p>
              {renewal.engagement_score !== null && (
                <div className="w-full bg-muted rounded-full h-2 mt-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${renewal.engagement_score}%` }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Satisfaction Score</p>
              <p className="text-3xl font-bold mt-1">
                {renewal.customer_satisfaction_score ?? 'N/A'}
              </p>
              {renewal.customer_satisfaction_score !== null && (
                <div className="w-full bg-muted rounded-full h-2 mt-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${renewal.customer_satisfaction_score}%` }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Sentiment Score</p>
              <p className="text-3xl font-bold mt-1">
                {renewal.sentiment_score ?? 'N/A'}
              </p>
              {renewal.sentiment_score !== null && (
                <div className="w-full bg-muted rounded-full h-2 mt-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full"
                    style={{ width: `${renewal.sentiment_score}%` }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Log Call Modal */}
      <Dialog open={showCallModal} onOpenChange={setShowCallModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Log Call</DialogTitle>
            <DialogDescription>
              Record a phone call with {renewal.account?.name || 'the customer'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select
                value={callForm.direction}
                onValueChange={(v) => setCallForm({ ...callForm, direction: v as ContactDirection })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">Outbound (I called them)</SelectItem>
                  <SelectItem value="inbound">Inbound (They called us)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                placeholder="5"
                value={callForm.duration_minutes}
                onChange={(e) => setCallForm({ ...callForm, duration_minutes: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Select
                value={callForm.outcome}
                onValueChange={(v) => setCallForm({ ...callForm, outcome: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Left voicemail">Left voicemail</SelectItem>
                  <SelectItem value="Spoke with customer">Spoke with customer</SelectItem>
                  <SelectItem value="Scheduled follow-up">Scheduled follow-up</SelectItem>
                  <SelectItem value="No answer">No answer</SelectItem>
                  <SelectItem value="Customer will call back">Customer will call back</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Call notes..."
                rows={3}
                value={callForm.notes}
                onChange={(e) => setCallForm({ ...callForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCallModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleLogCall} disabled={logContact.isPending}>
              {logContact.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Log Call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send SMS Modal */}
      <Dialog open={showSMSModal} onOpenChange={setShowSMSModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Send SMS</DialogTitle>
            <DialogDescription>
              Send a text message to {renewal.account?.phone || 'the customer'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>To</Label>
              <Input
                value={renewal.account?.phone || 'No phone number on file'}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                placeholder="Type your message..."
                rows={4}
                value={smsForm.body}
                onChange={(e) => setSmsForm({ ...smsForm, body: e.target.value })}
                maxLength={160}
              />
              <p className="text-xs text-muted-foreground text-right">
                {smsForm.body.length}/160 characters
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSMSModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendSMS}
              disabled={sendSMS.isPending || !smsForm.body.trim() || !renewal.account?.phone}
            >
              {sendSMS.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send SMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email Modal */}
      <Dialog open={showEmailModal} onOpenChange={setShowEmailModal}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Compose Email</DialogTitle>
            <DialogDescription>
              Send an email to {renewal.account?.name || 'the customer'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                placeholder="Email subject..."
                value={emailForm.subject}
                onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea
                placeholder="Email content..."
                rows={10}
                value={emailForm.body}
                onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Log contact and close
                logContact.mutate({
                  renewalId: renewal.id,
                  contact_type: 'email',
                  direction: 'outbound',
                  notes: `Subject: ${emailForm.subject}`,
                });
                toast.success('Email logged! Open your email client to send.');
                setShowEmailModal(false);
                setEmailForm({ subject: '', body: '' });
              }}
              disabled={!emailForm.subject.trim() || !emailForm.body.trim()}
            >
              Log & Copy to Clipboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Task Modal */}
      <Dialog open={showTaskModal} onOpenChange={setShowTaskModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>
              Create a follow-up task for this renewal
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Task Title</Label>
              <Input
                placeholder="e.g., Follow up on renewal quote"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Task details..."
                rows={3}
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={taskForm.priority}
                  onValueChange={(v) => setTaskForm({ ...taskForm, priority: v as TaskPriority })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Due In</Label>
                <Select
                  value={taskForm.due_days}
                  onValueChange={(v) => setTaskForm({ ...taskForm, due_days: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="2">2 days</SelectItem>
                    <SelectItem value="3">3 days</SelectItem>
                    <SelectItem value="7">1 week</SelectItem>
                    <SelectItem value="14">2 weeks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaskModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTask}
              disabled={!taskForm.title.trim()}
            >
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
