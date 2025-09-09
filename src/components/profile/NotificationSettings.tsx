import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, Mail, MessageSquare, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface NotificationPreferences {
  notification_email: boolean;
  notification_sms: boolean;
  timezone: string;
  locale: string;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
}

const timezones = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
];

const locales = [
  { value: 'en', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
];

export function NotificationSettings() {
  const { user, profile } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    notification_email: true,
    notification_sms: false,
    timezone: 'UTC',
    locale: 'en',
  });
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (profile) {
      setPreferences({
        notification_email: typeof profile.notification_email === 'boolean' 
          ? profile.notification_email 
          : profile.notification_email === 'true',
        notification_sms: typeof profile.notification_sms === 'boolean' 
          ? profile.notification_sms 
          : profile.notification_sms === 'true',
        timezone: profile.timezone ?? 'UTC',
        locale: profile.locale ?? 'en',
      });
    }
  }, [profile]);

  const updatePreference = (key: keyof NotificationPreferences, value: boolean | string) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const savePreferences = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          notification_email: preferences.notification_email.toString(),
          notification_sms: preferences.notification_sms.toString(),
          timezone: preferences.timezone,
          locale: preferences.locale,
        })
        .eq('id', user.id);

      if (error) throw error;

      setHasChanges(false);
      toast({
        title: "Preferences saved",
        description: "Your notification preferences have been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error saving preferences",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetPreferences = () => {
    if (profile) {
      setPreferences({
        notification_email: typeof profile.notification_email === 'boolean' 
          ? profile.notification_email 
          : profile.notification_email === 'true',
        notification_sms: typeof profile.notification_sms === 'boolean' 
          ? profile.notification_sms 
          : profile.notification_sms === 'true',
        timezone: profile.timezone ?? 'UTC',
        locale: profile.locale ?? 'en',
      });
      setHasChanges(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Preferences
        </CardTitle>
        <CardDescription>
          Manage how and when you receive notifications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email Notifications */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Notifications
          </h4>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Policy Renewals</Label>
                <p className="text-sm text-muted-foreground">
                  Get notified about upcoming policy renewals
                </p>
              </div>
              <Switch
                checked={preferences.notification_email}
                onCheckedChange={(checked) => updatePreference('notification_email', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Task Assignments</Label>
                <p className="text-sm text-muted-foreground">
                  Receive emails when tasks are assigned to you
                </p>
              </div>
              <Switch
                checked={preferences.notification_email}
                  onCheckedChange={(checked) => updatePreference('notification_email', checked === true)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Security Alerts</Label>
                <p className="text-sm text-muted-foreground">
                  Important security notifications and login alerts
                </p>
              </div>
              <Switch
                checked={true}
                disabled
              />
            </div>
          </div>
        </div>

        {/* SMS Notifications */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            SMS Notifications
          </h4>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Emergency Alerts</Label>
                <p className="text-sm text-muted-foreground">
                  Critical notifications via SMS
                </p>
              </div>
              <Switch
                checked={preferences.notification_sms}
                onCheckedChange={(checked) => updatePreference('notification_sms', checked === true)}
                disabled={!profile?.phone_verified}
              />
            </div>

            {!profile?.phone_verified && (
              <p className="text-xs text-muted-foreground">
                SMS notifications require a verified phone number
              </p>
            )}
          </div>
        </div>

        {/* Timing & Locale */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Timing & Language
          </h4>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select
                value={preferences.timezone}
                onValueChange={(value) => updatePreference('timezone', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map(tz => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Language</Label>
              <Select
                value={preferences.locale}
                onValueChange={(value) => updatePreference('locale', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {locales.map(locale => (
                    <SelectItem key={locale.value} value={locale.value}>
                      {locale.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {hasChanges && (
          <div className="flex gap-2 pt-4 border-t">
            <Button 
              onClick={savePreferences} 
              disabled={loading}
            >
              {loading ? "Saving..." : "Save Preferences"}
            </Button>
            <Button 
              variant="outline" 
              onClick={resetPreferences}
              disabled={loading}
            >
              Reset
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}