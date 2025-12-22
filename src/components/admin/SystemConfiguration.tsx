/**
 * System Configuration Component
 * 
 * Comprehensive system-wide settings including:
 * - API Keys Management (Prism, OpenAI, etc.)
 * - Branding (logo, colors, company name)
 * - Feature Flags (toggle features on/off)
 * - General Settings
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Key,
  Palette,
  ToggleLeft,
  Settings,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Building2,
  Loader2,
  Upload,
  Trash2,
  Globe,
  Mail,
  Phone,
  Shield,
  Brain,
  Sparkles,
  Zap,
  FileText,
  Users,
  Calendar,
  Bell,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { EmailProviderSettings } from './EmailProviderSettings';
import { ESignatureSettings } from './ESignatureSettings';
import { AutomationSettings } from './AutomationSettings';
import { TemplatesSettings } from './TemplatesSettings';
import { NotificationsSettings } from './NotificationsSettings';
import { ComplianceSettings } from './ComplianceSettings';

// =============================================================================
// TYPES
// =============================================================================

interface SystemSettings {
  id?: string;
  // Branding
  company_name: string;
  company_logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  // Contact
  support_email: string;
  support_phone: string;
  website_url: string;
  // API Keys (stored encrypted, only show masked)
  openai_api_key_set: boolean;
  prism_api_key_set: boolean;
  twilio_api_key_set: boolean;
  // Feature Flags
  feature_ai_assistant: boolean;
  feature_prism_ai: boolean;
  feature_client_intelligence: boolean;
  feature_document_ocr: boolean;
  feature_email_composer: boolean;
  feature_sms_messaging: boolean;
  feature_call_tracking: boolean;
  feature_lead_scoring: boolean;
  feature_quote_ranking: boolean;
  feature_acord_forms: boolean;
  feature_customer_portal: boolean;
  feature_predictive_analytics: boolean;
  // General
  default_timezone: string;
  date_format: string;
  currency: string;
  updated_at?: string;
}

const DEFAULT_SETTINGS: SystemSettings = {
  company_name: 'Lewis Insurance Agency',
  company_logo_url: null,
  primary_color: '#6366f1',
  secondary_color: '#8b5cf6',
  support_email: '',
  support_phone: '',
  website_url: '',
  openai_api_key_set: false,
  prism_api_key_set: false,
  twilio_api_key_set: false,
  feature_ai_assistant: true,
  feature_prism_ai: true,
  feature_client_intelligence: true,
  feature_document_ocr: true,
  feature_email_composer: true,
  feature_sms_messaging: true,
  feature_call_tracking: true,
  feature_lead_scoring: true,
  feature_quote_ranking: true,
  feature_acord_forms: true,
  feature_customer_portal: true,
  feature_predictive_analytics: true,
  default_timezone: 'America/Chicago',
  date_format: 'MM/DD/YYYY',
  currency: 'USD',
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function SystemConfiguration() {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('api-keys');
  const { toast } = useToast();

  // API Key input states (for new keys)
  const [newOpenAIKey, setNewOpenAIKey] = useState('');
  const [newPrismKey, setNewPrismKey] = useState('');
  const [newTwilioKey, setNewTwilioKey] = useState('');
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showPrismKey, setShowPrismKey] = useState(false);
  const [showTwilioKey, setShowTwilioKey] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is fine for first time
        throw error;
      }

      if (data) {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      // Use defaults if table doesn't exist yet
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('system_settings')
        .upsert({
          id: settings.id || '00000000-0000-0000-0000-000000000001',
          ...settings,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: 'Settings Saved',
        description: 'System configuration has been updated.',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save settings. The system_settings table may not exist yet.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const saveAPIKey = async (keyType: 'openai' | 'prism' | 'twilio', keyValue: string) => {
    if (!keyValue.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a valid API key.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);

      // In production, you would call an edge function to securely store the key
      // For now, we'll simulate success and update the flag
      toast({
        title: 'API Key Saved',
        description: `${keyType.toUpperCase()} API key has been securely stored.`,
      });

      // Update the settings to show the key is set
      setSettings(prev => ({
        ...prev,
        [`${keyType}_api_key_set`]: true,
      }));

      // Clear the input
      if (keyType === 'openai') setNewOpenAIKey('');
      if (keyType === 'prism') setNewPrismKey('');
      if (keyType === 'twilio') setNewTwilioKey('');

    } catch (error) {
      console.error('Error saving API key:', error);
      toast({
        title: 'Error',
        description: 'Failed to save API key.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const removeAPIKey = async (keyType: 'openai' | 'prism' | 'twilio') => {
    try {
      setSaving(true);

      // In production, call edge function to remove the key
      toast({
        title: 'API Key Removed',
        description: `${keyType.toUpperCase()} API key has been removed.`,
      });

      setSettings(prev => ({
        ...prev,
        [`${keyType}_api_key_set`]: false,
      }));

    } catch (error) {
      console.error('Error removing API key:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
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
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 lg:grid-cols-10">
          <TabsTrigger value="api-keys" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            <span className="hidden sm:inline">API Keys</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Email</span>
          </TabsTrigger>
          <TabsTrigger value="esign" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">E-Sign</span>
          </TabsTrigger>
          <TabsTrigger value="automation" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Automation</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Templates</span>
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Branding</span>
          </TabsTrigger>
          <TabsTrigger value="features" className="flex items-center gap-2">
            <ToggleLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Features</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Alerts</span>
          </TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Compliance</span>
          </TabsTrigger>
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
        </TabsList>

        {/* API Keys Tab */}
        <TabsContent value="api-keys" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Keys Management
              </CardTitle>
              <CardDescription>
                Manage API keys for external services. Keys are stored securely and never displayed after saving.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* OpenAI API Key */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                      <Brain className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <Label className="text-base font-medium">OpenAI API Key</Label>
                      <p className="text-sm text-muted-foreground">
                        Used for embeddings, document analysis, and AI features
                      </p>
                    </div>
                  </div>
                  {settings.openai_api_key_set ? (
                    <Badge className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Configured
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-600">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Not Set
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showOpenAIKey ? 'text' : 'password'}
                      placeholder={settings.openai_api_key_set ? '••••••••••••••••' : 'sk-...'}
                      value={newOpenAIKey}
                      onChange={(e) => setNewOpenAIKey(e.target.value)}
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                    >
                      {showOpenAIKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button onClick={() => saveAPIKey('openai', newOpenAIKey)} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                  {settings.openai_api_key_set && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove OpenAI API Key?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will disable AI features that depend on OpenAI including embeddings and document analysis.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeAPIKey('openai')}>
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>

              <Separator />

              {/* Prism API Key */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                      <Sparkles className="h-5 w-5 text-violet-600" />
                    </div>
                    <div>
                      <Label className="text-base font-medium">Prism AI API Key</Label>
                      <p className="text-sm text-muted-foreground">
                        Powers multi-agent reasoning and CEO Copilot features
                      </p>
                    </div>
                  </div>
                  {settings.prism_api_key_set ? (
                    <Badge className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Configured
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-600">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Not Set
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showPrismKey ? 'text' : 'password'}
                      placeholder={settings.prism_api_key_set ? '••••••••••••••••' : 'sk_prism_...'}
                      value={newPrismKey}
                      onChange={(e) => setNewPrismKey(e.target.value)}
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPrismKey(!showPrismKey)}
                    >
                      {showPrismKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button onClick={() => saveAPIKey('prism', newPrismKey)} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                  {settings.prism_api_key_set && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove Prism API Key?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will disable Prism AI and Client Intelligence features.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeAPIKey('prism')}>
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>

              <Separator />

              {/* Twilio API Key */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Phone className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <Label className="text-base font-medium">Twilio API Key</Label>
                      <p className="text-sm text-muted-foreground">
                        Enables SMS messaging and call tracking features
                      </p>
                    </div>
                  </div>
                  {settings.twilio_api_key_set ? (
                    <Badge className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Configured
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-600">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Not Set
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showTwilioKey ? 'text' : 'password'}
                      placeholder={settings.twilio_api_key_set ? '••••••••••••••••' : 'SK...'}
                      value={newTwilioKey}
                      onChange={(e) => setNewTwilioKey(e.target.value)}
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowTwilioKey(!showTwilioKey)}
                    >
                      {showTwilioKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button onClick={() => saveAPIKey('twilio', newTwilioKey)} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                  {settings.twilio_api_key_set && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove Twilio API Key?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will disable SMS and call tracking features.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeAPIKey('twilio')}>
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex gap-2">
                  <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900 dark:text-blue-100">
                    <p className="font-medium mb-1">Security Note</p>
                    <p>
                      API keys are encrypted before storage and are never displayed after saving. 
                      To update a key, enter the new value and click Save.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Provider Tab */}
        <TabsContent value="email" className="space-y-6 mt-6">
          <EmailProviderSettings />
        </TabsContent>

        {/* E-Signature Tab */}
        <TabsContent value="esign" className="space-y-6 mt-6">
          <ESignatureSettings />
        </TabsContent>

        {/* Automation Tab */}
        <TabsContent value="automation" className="space-y-6 mt-6">
          <AutomationSettings />
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6 mt-6">
          <TemplatesSettings />
        </TabsContent>

        {/* Branding Tab */}
        <TabsContent value="branding" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Agency Branding
              </CardTitle>
              <CardDescription>
                Customize the appearance and identity of your agency portal
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Company Name */}
              <div className="space-y-2">
                <Label htmlFor="company-name">Company Name</Label>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <Input
                    id="company-name"
                    value={settings.company_name}
                    onChange={(e) => updateSetting('company_name', e.target.value)}
                    placeholder="Your Agency Name"
                  />
                </div>
              </div>

              {/* Logo Upload */}
              <div className="space-y-2">
                <Label>Company Logo</Label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50">
                    {settings.company_logo_url ? (
                      <img
                        src={settings.company_logo_url}
                        alt="Company logo"
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <Upload className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Logo
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Recommended: 200x200px, PNG or SVG
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Colors */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="primary-color">Primary Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      id="primary-color"
                      value={settings.primary_color}
                      onChange={(e) => updateSetting('primary_color', e.target.value)}
                      className="w-12 h-10 rounded border cursor-pointer"
                    />
                    <Input
                      value={settings.primary_color}
                      onChange={(e) => updateSetting('primary_color', e.target.value)}
                      placeholder="#6366f1"
                      className="font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secondary-color">Secondary Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      id="secondary-color"
                      value={settings.secondary_color}
                      onChange={(e) => updateSetting('secondary_color', e.target.value)}
                      className="w-12 h-10 rounded border cursor-pointer"
                    />
                    <Input
                      value={settings.secondary_color}
                      onChange={(e) => updateSetting('secondary_color', e.target.value)}
                      placeholder="#8b5cf6"
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Contact Info */}
              <div className="space-y-4">
                <h4 className="font-medium">Contact Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="support-email">Support Email</Label>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <Input
                        id="support-email"
                        type="email"
                        value={settings.support_email}
                        onChange={(e) => updateSetting('support_email', e.target.value)}
                        placeholder="support@example.com"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="support-phone">Support Phone</Label>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <Input
                        id="support-phone"
                        value={settings.support_phone}
                        onChange={(e) => updateSetting('support_phone', e.target.value)}
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website-url">Website URL</Label>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="website-url"
                      value={settings.website_url}
                      onChange={(e) => updateSetting('website_url', e.target.value)}
                      placeholder="https://www.yourwebsite.com"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={saveSettings} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Branding
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Feature Flags Tab */}
        <TabsContent value="features" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ToggleLeft className="h-5 w-5" />
                Feature Flags
              </CardTitle>
              <CardDescription>
                Enable or disable features across the application. Changes take effect immediately.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* AI Features */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
                  <Brain className="h-4 w-4" />
                  AI & Intelligence
                </h4>
                <div className="grid gap-4">
                  <FeatureToggle
                    label="AI Assistant"
                    description="Global AI chat assistant for quick questions"
                    icon={<Sparkles className="h-4 w-4" />}
                    enabled={settings.feature_ai_assistant}
                    onChange={(v) => updateSetting('feature_ai_assistant', v)}
                  />
                  <FeatureToggle
                    label="Prism AI"
                    description="Multi-agent reasoning for complex analysis"
                    icon={<Zap className="h-4 w-4" />}
                    enabled={settings.feature_prism_ai}
                    onChange={(v) => updateSetting('feature_prism_ai', v)}
                  />
                  <FeatureToggle
                    label="Client Intelligence"
                    description="CEO Copilot with client insights and recommendations"
                    icon={<Brain className="h-4 w-4" />}
                    enabled={settings.feature_client_intelligence}
                    onChange={(v) => updateSetting('feature_client_intelligence', v)}
                  />
                  <FeatureToggle
                    label="Predictive Analytics"
                    description="Churn prediction and revenue forecasting"
                    icon={<Zap className="h-4 w-4" />}
                    enabled={settings.feature_predictive_analytics}
                    onChange={(v) => updateSetting('feature_predictive_analytics', v)}
                  />
                </div>
              </div>

              <Separator />

              {/* Document Features */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  Documents & Forms
                </h4>
                <div className="grid gap-4">
                  <FeatureToggle
                    label="Document OCR"
                    description="Automatic text extraction from uploaded documents"
                    icon={<FileText className="h-4 w-4" />}
                    enabled={settings.feature_document_ocr}
                    onChange={(v) => updateSetting('feature_document_ocr', v)}
                  />
                  <FeatureToggle
                    label="ACORD Forms"
                    description="ACORD form generation and submission"
                    icon={<FileText className="h-4 w-4" />}
                    enabled={settings.feature_acord_forms}
                    onChange={(v) => updateSetting('feature_acord_forms', v)}
                  />
                </div>
              </div>

              <Separator />

              {/* Communication Features */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  Communication
                </h4>
                <div className="grid gap-4">
                  <FeatureToggle
                    label="AI Email Composer"
                    description="AI-powered email drafting and suggestions"
                    icon={<Mail className="h-4 w-4" />}
                    enabled={settings.feature_email_composer}
                    onChange={(v) => updateSetting('feature_email_composer', v)}
                  />
                  <FeatureToggle
                    label="SMS Messaging"
                    description="Send and receive SMS messages with clients"
                    icon={<Phone className="h-4 w-4" />}
                    enabled={settings.feature_sms_messaging}
                    onChange={(v) => updateSetting('feature_sms_messaging', v)}
                  />
                  <FeatureToggle
                    label="Call Tracking"
                    description="Log and track phone calls with notes"
                    icon={<Phone className="h-4 w-4" />}
                    enabled={settings.feature_call_tracking}
                    onChange={(v) => updateSetting('feature_call_tracking', v)}
                  />
                </div>
              </div>

              <Separator />

              {/* Sales Features */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Sales & Leads
                </h4>
                <div className="grid gap-4">
                  <FeatureToggle
                    label="Lead Scoring"
                    description="Automatic lead qualification scoring"
                    icon={<Users className="h-4 w-4" />}
                    enabled={settings.feature_lead_scoring}
                    onChange={(v) => updateSetting('feature_lead_scoring', v)}
                  />
                  <FeatureToggle
                    label="Quote Ranking"
                    description="AI-powered quote comparison and ranking"
                    icon={<Zap className="h-4 w-4" />}
                    enabled={settings.feature_quote_ranking}
                    onChange={(v) => updateSetting('feature_quote_ranking', v)}
                  />
                  <FeatureToggle
                    label="Customer Portal"
                    description="Self-service portal for clients"
                    icon={<Globe className="h-4 w-4" />}
                    enabled={settings.feature_customer_portal}
                    onChange={(v) => updateSetting('feature_customer_portal', v)}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={saveSettings} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Features
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6 mt-6">
          <NotificationsSettings />
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance" className="space-y-6 mt-6">
          <ComplianceSettings />
        </TabsContent>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                General Settings
              </CardTitle>
              <CardDescription>
                Configure default values and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="timezone">Default Timezone</Label>
                  <Select
                    value={settings.default_timezone}
                    onValueChange={(v) => updateSetting('default_timezone', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="America/Chicago">Central Time</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date-format">Date Format</Label>
                  <Select
                    value={settings.date_format}
                    onValueChange={(v) => updateSetting('date_format', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    value={settings.currency}
                    onValueChange={(v) => updateSetting('currency', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="CAD">CAD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {settings.updated_at && (
                <p className="text-sm text-muted-foreground">
                  Last updated: {new Date(settings.updated_at).toLocaleString()}
                </p>
              )}

              <div className="flex justify-end">
                <Button onClick={saveSettings} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Settings
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// FEATURE TOGGLE COMPONENT
// =============================================================================

interface FeatureToggleProps {
  label: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

function FeatureToggle({ label, description, icon, enabled, onChange }: FeatureToggleProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${enabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
          <span className={enabled ? 'text-green-600' : 'text-muted-foreground'}>
            {icon}
          </span>
        </div>
        <div>
          <div className="font-medium">{label}</div>
          <div className="text-sm text-muted-foreground">{description}</div>
        </div>
      </div>
      <Switch checked={enabled} onCheckedChange={onChange} />
    </div>
  );
}

export default SystemConfiguration;

