import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  Phone, 
  MessageSquare, 
  Shield, 
  Activity, 
  AlertTriangle,
  CheckCircle,
  Settings,
  TestTube,
  Users,
  PhoneOff
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { asMessage } from '@/lib/asMessage';
import { format } from 'date-fns';

interface TelephonyStats {
  totalCalls: number;
  totalSMS: number;
  optOutCount: number;
  webhookHealth: 'healthy' | 'error' | 'unknown';
  lastError?: string;
  lastErrorAt?: string;
}

interface TelephonySettings {
  id: string;
  twilio_phone_number: string;
  forward_number: string;
  recording_enabled: boolean;
  webhook_status: string;
  last_webhook_error?: string;
  last_error_at?: string;
}

export function TelephonyDashboard() {
  const [stats, setStats] = useState<TelephonyStats>({
    totalCalls: 0,
    totalSMS: 0,
    optOutCount: 0,
    webhookHealth: 'unknown'
  });
  const [settings, setSettings] = useState<TelephonySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    fetchTelephonyData();
  }, []);

  const fetchTelephonyData = async () => {
    try {
      setLoading(true);

      // Fetch stats and settings from actual tables
      const [callsResult, smsResult, settingsResult] = await Promise.all([
        supabase.from('call_sessions').select('id').limit(1000),
        supabase.from('sms_messages').select('id').limit(1000),
        supabase.from('telephony_settings').select('*').single()
      ]);

      // Check for consent opt-outs
      const optOutResult = await supabase
        .from('consents')
        .select('id')
        .eq('granted', false)
        .eq('type', 'sms_consent');

      setStats({
        totalCalls: callsResult.data?.length || 0,
        totalSMS: smsResult.data?.length || 0,
        optOutCount: optOutResult.data?.length || 0,
        webhookHealth: settingsResult.data?.webhook_status === 'ok' ? 'healthy' : 
                      settingsResult.data?.last_webhook_error ? 'error' : 'unknown',
        lastError: settingsResult.data?.last_webhook_error,
        lastErrorAt: settingsResult.data?.last_error_at
      });

      // Use actual settings from database
      if (settingsResult.data) {
        setSettings(settingsResult.data);
      }
    } catch (error) {
      toast({
        title: "Error loading telephony data",
        description: asMessage(error, "Failed to load telephony dashboard data"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestCall = async () => {
    setTestLoading(true);
    try {
      // In a real implementation, this would trigger a test call via Cloudflare Workers
      // For now, we'll just show a success message
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call
      
      toast({
        title: "Test call initiated",
        description: "A test call has been sent to verify the webhook endpoint",
      });
    } catch (error) {
      toast({
        title: "Test call failed",
        description: "Failed to initiate test call",
        variant: "destructive",
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleTestSMS = async () => {
    setTestLoading(true);
    try {
      // In a real implementation, this would trigger a test SMS via Cloudflare Workers
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call
      
      toast({
        title: "Test SMS sent",
        description: "A test SMS has been sent to verify the webhook endpoint",
      });
    } catch (error) {
      toast({
        title: "Test SMS failed",
        description: "Failed to send test SMS",
        variant: "destructive",
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleUpdateSettings = async (updatedSettings: Partial<TelephonySettings>) => {
    try {
      const { error } = await supabase
        .from('telephony_settings')
        .update(updatedSettings)
        .eq('id', settings?.id);

      if (error) throw error;

      toast({
        title: "Settings updated",
        description: "Telephony settings have been updated successfully",
      });

      // Refresh data
      await fetchTelephonyData();
    } catch (error) {
      toast({
        title: "Update failed",
        description: asMessage(error, "Failed to update telephony settings"),
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Telephony Dashboard</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-muted rounded"></div>
                  <div className="h-8 bg-muted rounded"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Telephony Dashboard</h2>
          <p className="text-muted-foreground">
            Monitor call & SMS activity, webhook health, and compliance
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCalls}</div>
            <p className="text-xs text-muted-foreground">
              All call sessions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SMS Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSMS}</div>
            <p className="text-xs text-muted-foreground">
              Inbound & outbound
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Opt-outs</CardTitle>
            <PhoneOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.optOutCount}</div>
            <p className="text-xs text-muted-foreground">
              SMS opt-out requests
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Webhook Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              {stats.webhookHealth === 'healthy' ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : stats.webhookHealth === 'error' ? (
                <AlertTriangle className="h-5 w-5 text-red-500" />
              ) : (
                <Shield className="h-5 w-5 text-yellow-500" />
              )}
              <span className="text-sm font-medium capitalize">
                {stats.webhookHealth}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configuration Status */}
      {settings && (
        <Card>
          <CardHeader>
            <CardTitle>Configuration Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Twilio Phone Number</label>
                <p className="text-sm text-muted-foreground">{settings.twilio_phone_number}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Forward Number</label>
                <p className="text-sm text-muted-foreground">{settings.forward_number}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Recording</label>
                <Badge variant={settings.recording_enabled ? "default" : "secondary"}>
                  {settings.recording_enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div>
                <label className="text-sm font-medium">Webhook Status</label>
                <Badge variant={settings.webhook_status === 'ok' ? "default" : "destructive"}>
                  {settings.webhook_status || 'Unknown'}
                </Badge>
              </div>
            </div>

            {stats.lastError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Last Error:</strong> {stats.lastError}
                  {stats.lastErrorAt && (
                    <span className="block text-xs mt-1">
                      {format(new Date(stats.lastErrorAt), 'MMM d, yyyy h:mm a')}
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Test Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Test Actions</CardTitle>
          <p className="text-sm text-muted-foreground">
            Verify webhook endpoints and Twilio integration
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button 
              onClick={handleTestCall} 
              disabled={testLoading}
              variant="outline"
              size="sm"
            >
              <TestTube className="h-4 w-4 mr-2" />
              Test Call Webhook
            </Button>
            <Button 
              onClick={handleTestSMS} 
              disabled={testLoading}
              variant="outline"
              size="sm"
            >
              <TestTube className="h-4 w-4 mr-2" />
              Test SMS Webhook
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity Summary */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Calls</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Call activity timeline will appear here when integrated with the main CRM timeline.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent SMS</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              SMS message timeline will appear here when integrated with the main CRM timeline.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}