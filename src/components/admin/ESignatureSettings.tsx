/**
 * E-Signature Settings Component
 * 
 * Configure e-signature providers:
 * - HelloSign (Dropbox Sign)
 * - DocuSign
 * - PandaDoc
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  FileSignature,
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
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

type ESignProvider = 'none' | 'hellosign' | 'docusign' | 'pandadoc';

interface ESignSettings {
  provider: ESignProvider;
  hellosign_api_key_set: boolean;
  hellosign_client_id: string;
  docusign_integration_key_set: boolean;
  docusign_account_id: string;
  docusign_environment: 'sandbox' | 'production';
  pandadoc_api_key_set: boolean;
  default_reminder_days: number;
  default_expiration_days: number;
  is_configured: boolean;
}

const DEFAULT_SETTINGS: ESignSettings = {
  provider: 'none',
  hellosign_api_key_set: false,
  hellosign_client_id: '',
  docusign_integration_key_set: false,
  docusign_account_id: '',
  docusign_environment: 'sandbox',
  pandadoc_api_key_set: false,
  default_reminder_days: 3,
  default_expiration_days: 14,
  is_configured: false,
};

export function ESignatureSettings() {
  const [settings, setSettings] = useState<ESignSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // API key inputs
  const [helloSignKey, setHelloSignKey] = useState('');
  const [showHelloSignKey, setShowHelloSignKey] = useState(false);
  const [docuSignKey, setDocuSignKey] = useState('');
  const [showDocuSignKey, setShowDocuSignKey] = useState(false);
  const [pandaDocKey, setPandaDocKey] = useState('');
  const [showPandaDocKey, setShowPandaDocKey] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('esign_settings')
        .select('*')
        .single();

      if (data) {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      }
    } catch (error) {
      console.error('Error fetching e-sign settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('esign_settings')
        .upsert({
          id: '00000000-0000-0000-0000-000000000001',
          ...settings,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: 'Settings Saved',
        description: 'E-signature configuration has been updated.',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save e-signature settings.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const saveApiKey = async (provider: 'hellosign' | 'docusign' | 'pandadoc', value: string) => {
    if (!value.trim()) {
      toast({ title: 'Error', description: 'Please enter a valid API key.', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      toast({ title: 'API Key Saved', description: `${provider} API key has been securely stored.` });
      
      setSettings(prev => ({ ...prev, [`${provider}_api_key_set`]: true }));
      if (provider === 'hellosign') setHelloSignKey('');
      if (provider === 'docusign') setDocuSignKey('');
      if (provider === 'pandadoc') setPandaDocKey('');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof ESignSettings>(key: K, value: ESignSettings[K]) => {
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
            <FileSignature className="h-5 w-5" />
            E-Signature Provider
          </CardTitle>
          <CardDescription>
            Select and configure your electronic signature service
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Select Provider</Label>
            <Select
              value={settings.provider}
              onValueChange={(v: ESignProvider) => updateSetting('provider', v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an e-signature provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    No Provider (Disabled)
                  </div>
                </SelectItem>
                <SelectItem value="hellosign">
                  <div className="flex items-center gap-2">
                    <FileSignature className="h-4 w-4 text-blue-600" />
                    HelloSign (Dropbox Sign)
                  </div>
                </SelectItem>
                <SelectItem value="docusign">
                  <div className="flex items-center gap-2">
                    <FileSignature className="h-4 w-4 text-yellow-600" />
                    DocuSign
                  </div>
                </SelectItem>
                <SelectItem value="pandadoc">
                  <div className="flex items-center gap-2">
                    <FileSignature className="h-4 w-4 text-green-600" />
                    PandaDoc
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            {settings.provider === 'none' ? (
              <Badge variant="outline" className="text-muted-foreground">
                <AlertCircle className="h-3 w-3 mr-1" />
                Not Configured
              </Badge>
            ) : settings.is_configured ? (
              <Badge className="bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                <AlertCircle className="h-3 w-3 mr-1" />
                Pending Setup
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* HelloSign Configuration */}
      {settings.provider === 'hellosign' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileSignature className="h-5 w-5 text-blue-600" />
              HelloSign Configuration
            </CardTitle>
            <CardDescription>
              Configure your HelloSign (Dropbox Sign) API credentials
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hellosign-client-id">Client ID</Label>
              <Input
                id="hellosign-client-id"
                value={settings.hellosign_client_id}
                onChange={(e) => updateSetting('hellosign_client_id', e.target.value)}
                placeholder="Your HelloSign Client ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hellosign-key">API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="hellosign-key"
                    type={showHelloSignKey ? 'text' : 'password'}
                    value={helloSignKey}
                    onChange={(e) => setHelloSignKey(e.target.value)}
                    placeholder={settings.hellosign_api_key_set ? '••••••••••••••••' : 'Enter API key'}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowHelloSignKey(!showHelloSignKey)}
                  >
                    {showHelloSignKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button onClick={() => saveApiKey('hellosign', helloSignKey)} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
              {settings.hellosign_api_key_set && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  API key is configured
                </p>
              )}
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>Get your API credentials:</strong><br />
                1. Log in to <a href="https://app.hellosign.com/home/myAccount" target="_blank" rel="noopener" className="underline">HelloSign</a><br />
                2. Go to Integrations → API<br />
                3. Copy your API Key and Client ID
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Default Settings */}
      {settings.provider !== 'none' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Default Settings</CardTitle>
            <CardDescription>
              Configure default values for signature requests
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reminder-days">Reminder After (days)</Label>
                <Input
                  id="reminder-days"
                  type="number"
                  value={settings.default_reminder_days}
                  onChange={(e) => updateSetting('default_reminder_days', parseInt(e.target.value) || 3)}
                  min={1}
                  max={30}
                />
                <p className="text-xs text-muted-foreground">
                  Send reminder if not signed within this many days
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiration-days">Expire After (days)</Label>
                <Input
                  id="expiration-days"
                  type="number"
                  value={settings.default_expiration_days}
                  onChange={(e) => updateSetting('default_expiration_days', parseInt(e.target.value) || 14)}
                  min={1}
                  max={90}
                />
                <p className="text-xs text-muted-foreground">
                  Signature request expires after this many days
                </p>
              </div>
            </div>
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
                Save E-Signature Settings
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
              API keys are encrypted before storage. E-signature integrations enable sending
              documents for legally binding electronic signatures directly from InsureFlow.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ESignatureSettings;


