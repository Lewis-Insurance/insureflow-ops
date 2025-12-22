/**
 * Automation Settings Component
 * 
 * Configure automated workflows:
 * - Renewal Reminders
 * - Follow-up Rules
 * - Birthday Emails
 * - Policy Expiration Alerts
 * - Claim Status Updates
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
  Zap,
  Save,
  Loader2,
  Calendar,
  Clock,
  Mail,
  Bell,
  RefreshCw,
  Gift,
  FileWarning,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger_days: number;
  action_type: 'email' | 'task' | 'notification';
  template_id?: string;
}

interface AutomationSettings {
  // Renewal Reminders
  renewal_reminders_enabled: boolean;
  renewal_reminder_days: number[];
  renewal_reminder_template: string;
  // Follow-up Rules
  lead_followup_enabled: boolean;
  lead_followup_days: number;
  quote_followup_enabled: boolean;
  quote_followup_days: number;
  // Birthday Emails
  birthday_emails_enabled: boolean;
  birthday_email_template: string;
  birthday_send_time: string;
  // Policy Expiration Alerts
  expiration_alerts_enabled: boolean;
  expiration_alert_days: number[];
  // Claim Updates
  claim_updates_enabled: boolean;
  claim_status_notifications: boolean;
}

const DEFAULT_SETTINGS: AutomationSettings = {
  renewal_reminders_enabled: true,
  renewal_reminder_days: [90, 60, 30, 14, 7],
  renewal_reminder_template: 'default',
  lead_followup_enabled: true,
  lead_followup_days: 2,
  quote_followup_enabled: true,
  quote_followup_days: 3,
  birthday_emails_enabled: false,
  birthday_email_template: 'default',
  birthday_send_time: '09:00',
  expiration_alerts_enabled: true,
  expiration_alert_days: [30, 14, 7, 1],
  claim_updates_enabled: true,
  claim_status_notifications: true,
};

export function AutomationSettings() {
  const [settings, setSettings] = useState<AutomationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('automation_settings')
        .select('*')
        .single();

      if (data) {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      }
    } catch (error) {
      console.error('Error fetching automation settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('automation_settings')
        .upsert({
          id: '00000000-0000-0000-0000-000000000001',
          ...settings,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: 'Settings Saved',
        description: 'Automation settings have been updated.',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save automation settings.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof AutomationSettings>(key: K, value: AutomationSettings[K]) => {
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
      {/* Renewal Reminders */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <RefreshCw className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Renewal Reminders</CardTitle>
                <CardDescription>
                  Automatically remind clients about upcoming policy renewals
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.renewal_reminders_enabled}
              onCheckedChange={(v) => updateSetting('renewal_reminders_enabled', v)}
            />
          </div>
        </CardHeader>
        {settings.renewal_reminders_enabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Send reminders at these intervals (days before renewal)</Label>
              <div className="flex flex-wrap gap-2">
                {[90, 60, 45, 30, 21, 14, 7, 3, 1].map((day) => (
                  <Button
                    key={day}
                    variant={settings.renewal_reminder_days.includes(day) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const days = settings.renewal_reminder_days.includes(day)
                        ? settings.renewal_reminder_days.filter(d => d !== day)
                        : [...settings.renewal_reminder_days, day].sort((a, b) => b - a);
                      updateSetting('renewal_reminder_days', days);
                    }}
                  >
                    {day} days
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email Template</Label>
              <Select
                value={settings.renewal_reminder_template}
                onValueChange={(v) => updateSetting('renewal_reminder_template', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default Renewal Reminder</SelectItem>
                  <SelectItem value="friendly">Friendly Reminder</SelectItem>
                  <SelectItem value="urgent">Urgent - Final Notice</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Lead & Quote Follow-ups */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <Clock className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Follow-up Rules</CardTitle>
              <CardDescription>
                Automatically create tasks for lead and quote follow-ups
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Lead Follow-up */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div>
                <div className="font-medium">New Lead Follow-up</div>
                <div className="text-sm text-muted-foreground">
                  Create task to follow up on new leads
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">After</span>
                <Input
                  type="number"
                  value={settings.lead_followup_days}
                  onChange={(e) => updateSetting('lead_followup_days', parseInt(e.target.value) || 2)}
                  className="w-16"
                  min={1}
                  max={14}
                  disabled={!settings.lead_followup_enabled}
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
              <Switch
                checked={settings.lead_followup_enabled}
                onCheckedChange={(v) => updateSetting('lead_followup_enabled', v)}
              />
            </div>
          </div>

          {/* Quote Follow-up */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div>
                <div className="font-medium">Quote Follow-up</div>
                <div className="text-sm text-muted-foreground">
                  Create task when quote hasn't been accepted
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">After</span>
                <Input
                  type="number"
                  value={settings.quote_followup_days}
                  onChange={(e) => updateSetting('quote_followup_days', parseInt(e.target.value) || 3)}
                  className="w-16"
                  min={1}
                  max={30}
                  disabled={!settings.quote_followup_enabled}
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
              <Switch
                checked={settings.quote_followup_enabled}
                onCheckedChange={(v) => updateSetting('quote_followup_enabled', v)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Birthday Emails */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-pink-100 dark:bg-pink-900/30">
                <Gift className="h-5 w-5 text-pink-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Birthday Emails</CardTitle>
                <CardDescription>
                  Send automated birthday greetings to clients
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.birthday_emails_enabled}
              onCheckedChange={(v) => updateSetting('birthday_emails_enabled', v)}
            />
          </div>
        </CardHeader>
        {settings.birthday_emails_enabled && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Send Time</Label>
                <Input
                  type="time"
                  value={settings.birthday_send_time}
                  onChange={(e) => updateSetting('birthday_send_time', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Email Template</Label>
                <Select
                  value={settings.birthday_email_template}
                  onValueChange={(v) => updateSetting('birthday_email_template', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default Birthday</SelectItem>
                    <SelectItem value="corporate">Corporate Style</SelectItem>
                    <SelectItem value="fun">Fun & Friendly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Policy Expiration Alerts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <FileWarning className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Policy Expiration Alerts</CardTitle>
                <CardDescription>
                  Alert agents about expiring policies
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.expiration_alerts_enabled}
              onCheckedChange={(v) => updateSetting('expiration_alerts_enabled', v)}
            />
          </div>
        </CardHeader>
        {settings.expiration_alerts_enabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Alert at these intervals (days before expiration)</Label>
              <div className="flex flex-wrap gap-2">
                {[60, 45, 30, 21, 14, 7, 3, 1].map((day) => (
                  <Button
                    key={day}
                    variant={settings.expiration_alert_days.includes(day) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      const days = settings.expiration_alert_days.includes(day)
                        ? settings.expiration_alert_days.filter(d => d !== day)
                        : [...settings.expiration_alert_days, day].sort((a, b) => b - a);
                      updateSetting('expiration_alert_days', days);
                    }}
                  >
                    {day} days
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Claim Status Updates */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Bell className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Claim Status Updates</CardTitle>
                <CardDescription>
                  Notify clients when their claim status changes
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.claim_updates_enabled}
              onCheckedChange={(v) => updateSetting('claim_updates_enabled', v)}
            />
          </div>
        </CardHeader>
        {settings.claim_updates_enabled && (
          <CardContent>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <div className="font-medium">Email on Status Change</div>
                <div className="text-sm text-muted-foreground">
                  Send email when claim moves to a new status
                </div>
              </div>
              <Switch
                checked={settings.claim_status_notifications}
                onCheckedChange={(v) => updateSetting('claim_status_notifications', v)}
              />
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
              Save Automation Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default AutomationSettings;

