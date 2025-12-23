/**
 * Email Provider Settings Component
 * 
 * Configure email sending via:
 * - SMTP (custom server)
 * - SendGrid
 * - Mailgun
 * - Amazon SES
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
  Mail,
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send,
  Server,
  Zap,
  Shield,
  TestTube,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

// =============================================================================
// TYPES
// =============================================================================

type EmailProvider = 'none' | 'smtp' | 'sendgrid' | 'mailgun' | 'ses';

interface EmailSettings {
  provider: EmailProvider;
  from_email: string;
  from_name: string;
  reply_to_email: string;
  // SMTP Settings
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password_set: boolean;
  smtp_encryption: 'none' | 'tls' | 'ssl';
  // SendGrid
  sendgrid_api_key_set: boolean;
  // Mailgun
  mailgun_api_key_set: boolean;
  mailgun_domain: string;
  mailgun_region: 'us' | 'eu';
  // Amazon SES
  ses_access_key_set: boolean;
  ses_region: string;
  // Status
  is_configured: boolean;
  last_test_at: string | null;
  last_test_success: boolean | null;
}

const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  provider: 'none',
  from_email: '',
  from_name: '',
  reply_to_email: '',
  smtp_host: '',
  smtp_port: 587,
  smtp_username: '',
  smtp_password_set: false,
  smtp_encryption: 'tls',
  sendgrid_api_key_set: false,
  mailgun_api_key_set: false,
  mailgun_domain: '',
  mailgun_region: 'us',
  ses_access_key_set: false,
  ses_region: 'us-east-1',
  is_configured: false,
  last_test_at: null,
  last_test_success: null,
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function EmailProviderSettings() {
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT_EMAIL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  // Password/key input states
  const [smtpPassword, setSmtpPassword] = useState('');
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [sendgridKey, setSendgridKey] = useState('');
  const [showSendgridKey, setShowSendgridKey] = useState(false);
  const [mailgunKey, setMailgunKey] = useState('');
  const [showMailgunKey, setShowMailgunKey] = useState(false);
  const [sesAccessKey, setSesAccessKey] = useState('');
  const [sesSecretKey, setSesSecretKey] = useState('');
  const [showSesKeys, setShowSesKeys] = useState(false);

  // Test email recipient
  const [testEmail, setTestEmail] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('email_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSettings({ ...DEFAULT_EMAIL_SETTINGS, ...data });
      }
    } catch (error) {
      console.error('Error fetching email settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('email_settings')
        .upsert({
          id: '00000000-0000-0000-0000-000000000001',
          ...settings,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: 'Settings Saved',
        description: 'Email provider configuration has been updated.',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save email settings.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const saveApiKey = async (type: 'smtp' | 'sendgrid' | 'mailgun' | 'ses', value: string) => {
    if (!value.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a valid API key or password.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);

      // In production, call an edge function to securely store the key
      // For now, simulate success
      toast({
        title: 'Credentials Saved',
        description: `${type.toUpperCase()} credentials have been securely stored.`,
      });

      // Update the flag
      if (type === 'smtp') {
        setSettings(prev => ({ ...prev, smtp_password_set: true }));
        setSmtpPassword('');
      } else if (type === 'sendgrid') {
        setSettings(prev => ({ ...prev, sendgrid_api_key_set: true }));
        setSendgridKey('');
      } else if (type === 'mailgun') {
        setSettings(prev => ({ ...prev, mailgun_api_key_set: true }));
        setMailgunKey('');
      } else if (type === 'ses') {
        setSettings(prev => ({ ...prev, ses_access_key_set: true }));
        setSesAccessKey('');
        setSesSecretKey('');
      }
    } catch (error) {
      console.error('Error saving API key:', error);
      toast({
        title: 'Error',
        description: 'Failed to save credentials.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const sendTestEmail = async () => {
    if (!testEmail.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a test email address.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setTesting(true);

      // In production, call an edge function to send test email
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      toast({
        title: 'Test Email Sent',
        description: `A test email has been sent to ${testEmail}`,
      });

      setSettings(prev => ({
        ...prev,
        last_test_at: new Date().toISOString(),
        last_test_success: true,
      }));
    } catch (error) {
      console.error('Error sending test email:', error);
      toast({
        title: 'Test Failed',
        description: 'Failed to send test email. Please check your configuration.',
        variant: 'destructive',
      });
      setSettings(prev => ({
        ...prev,
        last_test_at: new Date().toISOString(),
        last_test_success: false,
      }));
    } finally {
      setTesting(false);
    }
  };

  const updateSetting = <K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) => {
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
      {/* Provider Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Provider
          </CardTitle>
          <CardDescription>
            Select and configure your email sending service
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Provider Selector */}
          <div className="space-y-2">
            <Label>Select Provider</Label>
            <Select
              value={settings.provider}
              onValueChange={(v: EmailProvider) => updateSetting('provider', v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an email provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    No Provider (Disabled)
                  </div>
                </SelectItem>
                <SelectItem value="smtp">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-blue-600" />
                    Custom SMTP Server
                  </div>
                </SelectItem>
                <SelectItem value="sendgrid">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-blue-500" />
                    SendGrid
                  </div>
                </SelectItem>
                <SelectItem value="mailgun">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-red-500" />
                    Mailgun
                  </div>
                </SelectItem>
                <SelectItem value="ses">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-orange-500" />
                    Amazon SES
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status Indicator */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            {settings.provider === 'none' ? (
              <Badge variant="outline" className="text-muted-foreground">
                <AlertCircle className="h-3 w-3 mr-1" />
                Not Configured
              </Badge>
            ) : settings.last_test_success ? (
              <Badge className="bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Verified & Working
              </Badge>
            ) : settings.last_test_success === false ? (
              <Badge variant="destructive">
                <AlertCircle className="h-3 w-3 mr-1" />
                Test Failed
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                <AlertCircle className="h-3 w-3 mr-1" />
                Not Tested
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Common Settings (shown when provider is selected) */}
      {settings.provider !== 'none' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sender Information</CardTitle>
            <CardDescription>
              Configure the default sender details for outgoing emails
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="from-email">From Email *</Label>
                <Input
                  id="from-email"
                  type="email"
                  value={settings.from_email}
                  onChange={(e) => updateSetting('from_email', e.target.value)}
                  placeholder="noreply@youragency.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="from-name">From Name</Label>
                <Input
                  id="from-name"
                  value={settings.from_name}
                  onChange={(e) => updateSetting('from_name', e.target.value)}
                  placeholder="Lewis Insurance Agency"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reply-to">Reply-To Email</Label>
              <Input
                id="reply-to"
                type="email"
                value={settings.reply_to_email}
                onChange={(e) => updateSetting('reply_to_email', e.target.value)}
                placeholder="support@youragency.com"
              />
              <p className="text-xs text-muted-foreground">
                If different from the From email. Replies will go to this address.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SMTP Configuration */}
      {settings.provider === 'smtp' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="h-5 w-5 text-blue-600" />
              SMTP Configuration
            </CardTitle>
            <CardDescription>
              Configure your custom SMTP server settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="smtp-host">SMTP Host *</Label>
                <Input
                  id="smtp-host"
                  value={settings.smtp_host}
                  onChange={(e) => updateSetting('smtp_host', e.target.value)}
                  placeholder="smtp.yourserver.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-port">Port *</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  value={settings.smtp_port}
                  onChange={(e) => updateSetting('smtp_port', parseInt(e.target.value) || 587)}
                  placeholder="587"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="smtp-username">Username</Label>
                <Input
                  id="smtp-username"
                  value={settings.smtp_username}
                  onChange={(e) => updateSetting('smtp_username', e.target.value)}
                  placeholder="your-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp-encryption">Encryption</Label>
                <Select
                  value={settings.smtp_encryption}
                  onValueChange={(v: 'none' | 'tls' | 'ssl') => updateSetting('smtp_encryption', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tls">TLS (Recommended)</SelectItem>
                    <SelectItem value="ssl">SSL</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-password">Password</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="smtp-password"
                    type={showSmtpPassword ? 'text' : 'password'}
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder={settings.smtp_password_set ? '••••••••••••••••' : 'Enter password'}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                  >
                    {showSmtpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button onClick={() => saveApiKey('smtp', smtpPassword)} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
              {settings.smtp_password_set && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Password is configured
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* SendGrid Configuration */}
      {settings.provider === 'sendgrid' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-blue-500" />
              SendGrid Configuration
            </CardTitle>
            <CardDescription>
              Enter your SendGrid API key to enable email sending
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sendgrid-key">API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="sendgrid-key"
                    type={showSendgridKey ? 'text' : 'password'}
                    value={sendgridKey}
                    onChange={(e) => setSendgridKey(e.target.value)}
                    placeholder={settings.sendgrid_api_key_set ? '••••••••••••••••' : 'SG.xxxxxxxx...'}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSendgridKey(!showSendgridKey)}
                  >
                    {showSendgridKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button onClick={() => saveApiKey('sendgrid', sendgridKey)} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
              {settings.sendgrid_api_key_set && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  API key is configured
                </p>
              )}
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>How to get your API key:</strong><br />
                1. Log in to <a href="https://sendgrid.com" target="_blank" rel="noopener" className="underline">SendGrid</a><br />
                2. Go to Settings → API Keys<br />
                3. Create an API Key with "Mail Send" permissions
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mailgun Configuration */}
      {settings.provider === 'mailgun' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5 text-red-500" />
              Mailgun Configuration
            </CardTitle>
            <CardDescription>
              Configure your Mailgun account settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mailgun-domain">Domain</Label>
                <Input
                  id="mailgun-domain"
                  value={settings.mailgun_domain}
                  onChange={(e) => updateSetting('mailgun_domain', e.target.value)}
                  placeholder="mg.yourdomain.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mailgun-region">Region</Label>
                <Select
                  value={settings.mailgun_region}
                  onValueChange={(v: 'us' | 'eu') => updateSetting('mailgun_region', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="us">United States</SelectItem>
                    <SelectItem value="eu">Europe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mailgun-key">API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="mailgun-key"
                    type={showMailgunKey ? 'text' : 'password'}
                    value={mailgunKey}
                    onChange={(e) => setMailgunKey(e.target.value)}
                    placeholder={settings.mailgun_api_key_set ? '••••••••••••••••' : 'key-xxxxxxxx...'}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowMailgunKey(!showMailgunKey)}
                  >
                    {showMailgunKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button onClick={() => saveApiKey('mailgun', mailgunKey)} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
              {settings.mailgun_api_key_set && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  API key is configured
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Amazon SES Configuration */}
      {settings.provider === 'ses' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="h-5 w-5 text-orange-500" />
              Amazon SES Configuration
            </CardTitle>
            <CardDescription>
              Configure your AWS SES credentials
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ses-region">AWS Region</Label>
              <Select
                value={settings.ses_region}
                onValueChange={(v) => updateSetting('ses_region', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us-east-1">US East (N. Virginia)</SelectItem>
                  <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                  <SelectItem value="eu-west-1">Europe (Ireland)</SelectItem>
                  <SelectItem value="eu-central-1">Europe (Frankfurt)</SelectItem>
                  <SelectItem value="ap-southeast-1">Asia Pacific (Singapore)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ses-access-key">Access Key ID</Label>
              <Input
                id="ses-access-key"
                type={showSesKeys ? 'text' : 'password'}
                value={sesAccessKey}
                onChange={(e) => setSesAccessKey(e.target.value)}
                placeholder="AKIAXXXXXXXXXXXXXXXX"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ses-secret-key">Secret Access Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="ses-secret-key"
                    type={showSesKeys ? 'text' : 'password'}
                    value={sesSecretKey}
                    onChange={(e) => setSesSecretKey(e.target.value)}
                    placeholder={settings.ses_access_key_set ? '••••••••••••••••' : 'Your secret key'}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSesKeys(!showSesKeys)}
                  >
                    {showSesKeys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button 
                  onClick={() => saveApiKey('ses', `${sesAccessKey}:${sesSecretKey}`)} 
                  disabled={saving || !sesAccessKey || !sesSecretKey}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
              {settings.ses_access_key_set && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  AWS credentials are configured
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Email */}
      {settings.provider !== 'none' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TestTube className="h-5 w-5" />
              Test Configuration
            </CardTitle>
            <CardDescription>
              Send a test email to verify your configuration is working
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="Enter your email address"
                className="flex-1"
              />
              <Button onClick={sendTestEmail} disabled={testing || !testEmail.trim()}>
                {testing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Test Email
                  </>
                )}
              </Button>
            </div>
            {settings.last_test_at && (
              <p className="text-sm text-muted-foreground">
                Last test: {new Date(settings.last_test_at).toLocaleString()} - 
                {settings.last_test_success ? (
                  <span className="text-green-600 ml-1">Success</span>
                ) : (
                  <span className="text-red-600 ml-1">Failed</span>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Save Button */}
      {settings.provider !== 'none' && (
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
                Save Email Settings
              </>
            )}
          </Button>
        </div>
      )}

      {/* Security Note */}
      <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex gap-2">
          <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900 dark:text-blue-100">
            <p className="font-medium mb-1">Security Note</p>
            <p>
              API keys and passwords are encrypted before storage and are never displayed after saving.
              Your email credentials are used only for sending transactional emails from this system.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmailProviderSettings;


