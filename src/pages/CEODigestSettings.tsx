/**
 * CEO Digest Settings Page
 *
 * Allows admins to configure weekly CEO digest email settings.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Mail,
  Clock,
  Calendar,
  Globe,
  Shield,
  AlertTriangle,
  Plus,
  X,
  ArrowLeft,
  History,
  Play,
  Loader2,
  Save,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useCEODigestSettings,
  useCEODigestRuns,
  DAYS_OF_WEEK,
  TIMEZONES,
} from '@/hooks/useCEODigest';
import { useActiveAgency } from '@/hooks/useAgencyWorkspace';
import { Navigate } from 'react-router-dom';

export default function CEODigestSettings() {
  const navigate = useNavigate();
  const { profile, isAdmin, loading: authLoading } = useAuth();
  const { agency, isLoading: workspaceLoading } = useActiveAgency();

  const agencyId = agency?.id || null;

  const {
    settings,
    isLoading: settingsLoading,
    createSettings,
    updateSettings,
    isCreating,
    isUpdating,
  } = useCEODigestSettings(agencyId);

  const { triggerRun, isTriggering } = useCEODigestRuns(agencyId);

  // Local form state
  const [enabled, setEnabled] = useState(true);
  const [timezone, setTimezone] = useState('America/New_York');
  const [sendDayOfWeek, setSendDayOfWeek] = useState(1);
  const [sendTimeLocal, setSendTimeLocal] = useState('08:00');
  const [includePii, setIncludePii] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newRecipient, setNewRecipient] = useState('');
  const [thresholds, setThresholds] = useState({
    leads_drop_pct: 25,
    quotes_drop_pct: 25,
    overdue_tasks_critical: 10,
    aging_quotes_days: 7,
    canopy_reconnects_critical: 3,
    canopy_errors_critical: 5,
  });

  // Sync form state with fetched settings
  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setTimezone(settings.timezone);
      setSendDayOfWeek(settings.send_day_of_week);
      setSendTimeLocal(settings.send_time_local);
      setIncludePii(settings.include_pii);
      setRecipients(settings.recipients || []);
      if (settings.thresholds) {
        setThresholds(prev => ({ ...prev, ...settings.thresholds }));
      }
    }
  }, [settings]);

  // Loading state
  if (authLoading || workspaceLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect non-admin users
  if (!isAdmin && profile?.role !== 'admin' && profile?.role !== 'owner') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleAddRecipient = () => {
    const email = newRecipient.trim().toLowerCase();
    if (email && !recipients.includes(email) && email.includes('@')) {
      setRecipients([...recipients, email]);
      setNewRecipient('');
    }
  };

  const handleRemoveRecipient = (email: string) => {
    setRecipients(recipients.filter(r => r !== email));
  };

  const handleSave = () => {
    const payload = {
      enabled,
      timezone,
      send_day_of_week: sendDayOfWeek,
      send_time_local: sendTimeLocal,
      include_pii: includePii,
      recipients,
      thresholds,
    };

    if (settings) {
      updateSettings(payload);
    } else {
      createSettings(recipients);
    }
  };

  const handleTestRun = () => {
    triggerRun({ test: true });
  };

  const handleForceRun = () => {
    triggerRun({ force: true });
  };

  const isLoading = settingsLoading;
  const isSaving = isCreating || isUpdating;

  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">CEO Weekly Digest</h1>
              <p className="text-muted-foreground">
                Configure automated weekly performance reports
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate('/admin/digest-history')}
            >
              <History className="h-4 w-4 mr-2" />
              View History
            </Button>
            <Button
              variant="outline"
              onClick={handleTestRun}
              disabled={isTriggering || !settings}
            >
              {isTriggering ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Test Run
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Enable/Disable */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Digest Status
                </CardTitle>
                <CardDescription>
                  Enable or disable the weekly CEO digest email
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Weekly Digest Enabled</p>
                    <p className="text-sm text-muted-foreground">
                      {enabled
                        ? 'Digest will be sent on the scheduled day'
                        : 'Digest is currently disabled'}
                    </p>
                  </div>
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>
              </CardContent>
            </Card>

            {/* Schedule */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Schedule
                </CardTitle>
                <CardDescription>
                  When to send the weekly digest
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="timezone" className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Timezone
                    </Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger id="timezone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map(tz => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="day" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Day of Week
                    </Label>
                    <Select
                      value={sendDayOfWeek.toString()}
                      onValueChange={v => setSendDayOfWeek(parseInt(v))}
                    >
                      <SelectTrigger id="day">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map(day => (
                          <SelectItem key={day.value} value={day.value.toString()}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="time" className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Time (24h)
                    </Label>
                    <Input
                      id="time"
                      type="time"
                      value={sendTimeLocal}
                      onChange={e => setSendTimeLocal(e.target.value)}
                    />
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  The digest covers the previous full week (Monday-Sunday) and is sent on{' '}
                  {DAYS_OF_WEEK.find(d => d.value === sendDayOfWeek)?.label} at{' '}
                  {sendTimeLocal} {TIMEZONES.find(t => t.value === timezone)?.label}
                </p>
              </CardContent>
            </Card>

            {/* Recipients */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Recipients
                </CardTitle>
                <CardDescription>
                  Email addresses that will receive the weekly digest
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="ceo@company.com"
                    value={newRecipient}
                    onChange={e => setNewRecipient(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddRecipient()}
                  />
                  <Button type="button" onClick={handleAddRecipient}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>

                {recipients.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {recipients.map(email => (
                      <Badge key={email} variant="secondary" className="py-1 px-3">
                        {email}
                        <button
                          type="button"
                          className="ml-2 hover:text-destructive"
                          onClick={() => handleRemoveRecipient(email)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No recipients configured. Add at least one email address.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Privacy */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Privacy Settings
                </CardTitle>
                <CardDescription>
                  Control what data is included in the digest
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Include PII in Digest</p>
                    <p className="text-sm text-muted-foreground">
                      {includePii
                        ? 'Full names and identifiers will be included'
                        : 'Names will be anonymized (e.g., "J. Smith")'}
                    </p>
                  </div>
                  <Switch checked={includePii} onCheckedChange={setIncludePii} />
                </div>
              </CardContent>
            </Card>

            {/* Alert Thresholds */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Alert Thresholds
                </CardTitle>
                <CardDescription>
                  Configure when alerts are triggered in the digest
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Leads Drop Alert (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={thresholds.leads_drop_pct}
                      onChange={e =>
                        setThresholds(prev => ({
                          ...prev,
                          leads_drop_pct: parseInt(e.target.value) || 0,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Alert when new leads drop by this percentage vs previous week
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Quotes Drop Alert (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={thresholds.quotes_drop_pct}
                      onChange={e =>
                        setThresholds(prev => ({
                          ...prev,
                          quotes_drop_pct: parseInt(e.target.value) || 0,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Alert when quotes created drop by this percentage
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Critical Overdue Tasks</Label>
                    <Input
                      type="number"
                      min={0}
                      value={thresholds.overdue_tasks_critical}
                      onChange={e =>
                        setThresholds(prev => ({
                          ...prev,
                          overdue_tasks_critical: parseInt(e.target.value) || 0,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Critical alert when overdue tasks exceed this count
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Aging Quotes (Days)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={thresholds.aging_quotes_days}
                      onChange={e =>
                        setThresholds(prev => ({
                          ...prev,
                          aging_quotes_days: parseInt(e.target.value) || 7,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Flag quotes older than this many days
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Canopy Reconnects Critical</Label>
                    <Input
                      type="number"
                      min={0}
                      value={thresholds.canopy_reconnects_critical}
                      onChange={e =>
                        setThresholds(prev => ({
                          ...prev,
                          canopy_reconnects_critical: parseInt(e.target.value) || 0,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Critical alert when Canopy reconnects needed exceeds this count
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Canopy Errors Critical</Label>
                    <Input
                      type="number"
                      min={0}
                      value={thresholds.canopy_errors_critical}
                      onChange={e =>
                        setThresholds(prev => ({
                          ...prev,
                          canopy_errors_critical: parseInt(e.target.value) || 0,
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Warning when Canopy pull errors exceed this count
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-between items-center pt-4">
              <Button
                variant="outline"
                onClick={handleForceRun}
                disabled={isTriggering || !settings}
              >
                {isTriggering ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Force Send Now
              </Button>

              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Settings
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
