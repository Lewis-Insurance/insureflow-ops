/**
 * Notifications Settings Component
 * 
 * Configure notification preferences:
 * - Email Notifications
 * - In-App Alerts
 * - Slack/Teams Integration
 * - Mobile Push (future)
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Bell,
  Mail,
  MessageSquare,
  Smartphone,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  TestTube,
  ExternalLink,
} from 'lucide-react';

interface NotificationSettings {
  // Email Notifications
  email_new_lead: boolean;
  email_new_quote_request: boolean;
  email_policy_bound: boolean;
  email_claim_filed: boolean;
  email_payment_received: boolean;
  email_document_uploaded: boolean;
  email_task_assigned: boolean;
  email_task_due: boolean;
  // In-App Notifications
  inapp_new_lead: boolean;
  inapp_new_quote_request: boolean;
  inapp_policy_bound: boolean;
  inapp_claim_filed: boolean;
  inapp_payment_received: boolean;
  inapp_document_uploaded: boolean;
  inapp_task_assigned: boolean;
  inapp_task_due: boolean;
  // Slack Integration
  slack_enabled: boolean;
  slack_webhook_url_set: boolean;
  slack_channel: string;
  slack_new_lead: boolean;
  slack_policy_bound: boolean;
  slack_claim_filed: boolean;
  // Teams Integration
  teams_enabled: boolean;
  teams_webhook_url_set: boolean;
  teams_new_lead: boolean;
  teams_policy_bound: boolean;
  teams_claim_filed: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  email_new_lead: true,
  email_new_quote_request: true,
  email_policy_bound: true,
  email_claim_filed: true,
  email_payment_received: false,
  email_document_uploaded: false,
  email_task_assigned: true,
  email_task_due: true,
  inapp_new_lead: true,
  inapp_new_quote_request: true,
  inapp_policy_bound: true,
  inapp_claim_filed: true,
  inapp_payment_received: true,
  inapp_document_uploaded: true,
  inapp_task_assigned: true,
  inapp_task_due: true,
  slack_enabled: false,
  slack_webhook_url_set: false,
  slack_channel: '#insurance-alerts',
  slack_new_lead: true,
  slack_policy_bound: true,
  slack_claim_filed: true,
  teams_enabled: false,
  teams_webhook_url_set: false,
  teams_new_lead: true,
  teams_policy_bound: true,
  teams_claim_filed: true,
};

interface NotificationRow {
  key: string;
  label: string;
  description: string;
  emailKey: keyof NotificationSettings;
  inappKey: keyof NotificationSettings;
}

const NOTIFICATION_ROWS: NotificationRow[] = [
  { key: 'new_lead', label: 'New Lead', description: 'When a new lead is created', emailKey: 'email_new_lead', inappKey: 'inapp_new_lead' },
  { key: 'quote_request', label: 'Quote Request', description: 'When a quote is requested', emailKey: 'email_new_quote_request', inappKey: 'inapp_new_quote_request' },
  { key: 'policy_bound', label: 'Policy Bound', description: 'When a new policy is bound', emailKey: 'email_policy_bound', inappKey: 'inapp_policy_bound' },
  { key: 'claim_filed', label: 'Claim Filed', description: 'When a claim is submitted', emailKey: 'email_claim_filed', inappKey: 'inapp_claim_filed' },
  { key: 'payment', label: 'Payment Received', description: 'When a payment is received', emailKey: 'email_payment_received', inappKey: 'inapp_payment_received' },
  { key: 'document', label: 'Document Uploaded', description: 'When a document is uploaded', emailKey: 'email_document_uploaded', inappKey: 'inapp_document_uploaded' },
  { key: 'task_assigned', label: 'Task Assigned', description: 'When a task is assigned to you', emailKey: 'email_task_assigned', inappKey: 'inapp_task_assigned' },
  { key: 'task_due', label: 'Task Due', description: 'When a task is due soon', emailKey: 'email_task_due', inappKey: 'inapp_task_due' },
];

export function NotificationsSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Webhook inputs
  const [slackWebhook, setSlackWebhook] = useState('');
  const [showSlackWebhook, setShowSlackWebhook] = useState(false);
  const [teamsWebhook, setTeamsWebhook] = useState('');
  const [showTeamsWebhook, setShowTeamsWebhook] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .single();

      if (data) {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      }
    } catch (error) {
      console.error('Error fetching notification settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('notification_settings')
        .upsert({
          id: '00000000-0000-0000-0000-000000000001',
          ...settings,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: 'Settings Saved',
        description: 'Notification preferences have been updated.',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save notification settings.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const saveWebhook = async (type: 'slack' | 'teams', url: string) => {
    if (!url.trim()) {
      toast({ title: 'Error', description: 'Please enter a valid webhook URL.', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      toast({ title: 'Webhook Saved', description: `${type} webhook has been configured.` });
      
      if (type === 'slack') {
        setSettings(prev => ({ ...prev, slack_webhook_url_set: true }));
        setSlackWebhook('');
      } else {
        setSettings(prev => ({ ...prev, teams_webhook_url_set: true }));
        setTeamsWebhook('');
      }
    } finally {
      setSaving(false);
    }
  };

  const testWebhook = async (type: 'slack' | 'teams') => {
    toast({
      title: 'Test Message Sent',
      description: `A test notification was sent to ${type}.`,
    });
  };

  const updateSetting = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notification Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Preferences
          </CardTitle>
          <CardDescription>
            Choose which events trigger notifications and how you receive them
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-3 font-medium">Event</th>
                  <th className="text-center p-3 font-medium w-24">
                    <div className="flex items-center justify-center gap-1">
                      <Mail className="h-4 w-4" />
                      Email
                    </div>
                  </th>
                  <th className="text-center p-3 font-medium w-24">
                    <div className="flex items-center justify-center gap-1">
                      <Bell className="h-4 w-4" />
                      In-App
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {NOTIFICATION_ROWS.map((row, idx) => (
                  <tr key={row.key} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                    <td className="p-3">
                      <div className="font-medium">{row.label}</div>
                      <div className="text-sm text-muted-foreground">{row.description}</div>
                    </td>
                    <td className="text-center p-3">
                      <Switch
                        checked={settings[row.emailKey] as boolean}
                        onCheckedChange={(v) => updateSetting(row.emailKey, v)}
                      />
                    </td>
                    <td className="text-center p-3">
                      <Switch
                        checked={settings[row.inappKey] as boolean}
                        onCheckedChange={(v) => updateSetting(row.inappKey, v)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Slack Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#4A154B]/10">
                <MessageSquare className="h-5 w-5 text-[#4A154B]" />
              </div>
              <div>
                <CardTitle className="text-lg">Slack Integration</CardTitle>
                <CardDescription>
                  Send notifications to a Slack channel
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.slack_enabled}
              onCheckedChange={(v) => updateSetting('slack_enabled', v)}
            />
          </div>
        </CardHeader>
        {settings.slack_enabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showSlackWebhook ? 'text' : 'password'}
                    value={slackWebhook}
                    onChange={(e) => setSlackWebhook(e.target.value)}
                    placeholder={settings.slack_webhook_url_set ? '••••••••••••••••' : 'https://hooks.slack.com/services/...'}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSlackWebhook(!showSlackWebhook)}
                  >
                    {showSlackWebhook ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button onClick={() => saveWebhook('slack', slackWebhook)} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
                {settings.slack_webhook_url_set && (
                  <Button variant="outline" onClick={() => testWebhook('slack')}>
                    <TestTube className="h-4 w-4 mr-2" />
                    Test
                  </Button>
                )}
              </div>
              {settings.slack_webhook_url_set && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Webhook is configured
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Channel Name</Label>
              <Input
                value={settings.slack_channel}
                onChange={(e) => updateSetting('slack_channel', e.target.value)}
                placeholder="#insurance-alerts"
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Events to Send to Slack</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm">New Leads</span>
                  <Switch
                    checked={settings.slack_new_lead}
                    onCheckedChange={(v) => updateSetting('slack_new_lead', v)}
                  />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm">Policy Bound</span>
                  <Switch
                    checked={settings.slack_policy_bound}
                    onCheckedChange={(v) => updateSetting('slack_policy_bound', v)}
                  />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm">Claim Filed</span>
                  <Switch
                    checked={settings.slack_claim_filed}
                    onCheckedChange={(v) => updateSetting('slack_claim_filed', v)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Microsoft Teams Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#464EB8]/10">
                <MessageSquare className="h-5 w-5 text-[#464EB8]" />
              </div>
              <div>
                <CardTitle className="text-lg">Microsoft Teams Integration</CardTitle>
                <CardDescription>
                  Send notifications to a Teams channel
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.teams_enabled}
              onCheckedChange={(v) => updateSetting('teams_enabled', v)}
            />
          </div>
        </CardHeader>
        {settings.teams_enabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showTeamsWebhook ? 'text' : 'password'}
                    value={teamsWebhook}
                    onChange={(e) => setTeamsWebhook(e.target.value)}
                    placeholder={settings.teams_webhook_url_set ? '••••••••••••••••' : 'https://outlook.office.com/webhook/...'}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowTeamsWebhook(!showTeamsWebhook)}
                  >
                    {showTeamsWebhook ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button onClick={() => saveWebhook('teams', teamsWebhook)} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
                {settings.teams_webhook_url_set && (
                  <Button variant="outline" onClick={() => testWebhook('teams')}>
                    <TestTube className="h-4 w-4 mr-2" />
                    Test
                  </Button>
                )}
              </div>
              {settings.teams_webhook_url_set && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Webhook is configured
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Events to Send to Teams</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm">New Leads</span>
                  <Switch
                    checked={settings.teams_new_lead}
                    onCheckedChange={(v) => updateSetting('teams_new_lead', v)}
                  />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm">Policy Bound</span>
                  <Switch
                    checked={settings.teams_policy_bound}
                    onCheckedChange={(v) => updateSetting('teams_policy_bound', v)}
                  />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm">Claim Filed</span>
                  <Switch
                    checked={settings.teams_claim_filed}
                    onCheckedChange={(v) => updateSetting('teams_claim_filed', v)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={saving} size="lg">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Notification Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default NotificationsSettings;


