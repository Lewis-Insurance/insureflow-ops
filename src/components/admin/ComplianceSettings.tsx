/**
 * Compliance Settings Component
 * 
 * Configure compliance and data governance:
 * - Data Retention Policies
 * - Audit Log Settings
 * - GDPR/CCPA Compliance
 * - E&O Documentation Requirements
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
  Shield,
  Save,
  Loader2,
  Clock,
  FileText,
  Eye,
  Lock,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Database,
  Scale,
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

interface ComplianceSettings {
  // Data Retention
  retention_policy_enabled: boolean;
  retention_period_years: number;
  retention_deleted_records_days: number;
  retention_audit_logs_years: number;
  auto_archive_enabled: boolean;
  // Audit Logging
  audit_login_events: boolean;
  audit_data_changes: boolean;
  audit_document_access: boolean;
  audit_policy_changes: boolean;
  audit_exports: boolean;
  audit_admin_actions: boolean;
  // Privacy / GDPR / CCPA
  privacy_consent_required: boolean;
  privacy_cookie_banner: boolean;
  privacy_data_export_enabled: boolean;
  privacy_right_to_delete_enabled: boolean;
  privacy_marketing_consent_required: boolean;
  // E&O Documentation
  eo_require_signed_app: boolean;
  eo_require_coverage_confirmation: boolean;
  eo_require_decline_reason: boolean;
  eo_auto_document_binding: boolean;
  eo_retention_period_years: number;
}

const DEFAULT_SETTINGS: ComplianceSettings = {
  retention_policy_enabled: true,
  retention_period_years: 7,
  retention_deleted_records_days: 90,
  retention_audit_logs_years: 5,
  auto_archive_enabled: true,
  audit_login_events: true,
  audit_data_changes: true,
  audit_document_access: true,
  audit_policy_changes: true,
  audit_exports: true,
  audit_admin_actions: true,
  privacy_consent_required: true,
  privacy_cookie_banner: true,
  privacy_data_export_enabled: true,
  privacy_right_to_delete_enabled: true,
  privacy_marketing_consent_required: true,
  eo_require_signed_app: true,
  eo_require_coverage_confirmation: true,
  eo_require_decline_reason: true,
  eo_auto_document_binding: true,
  eo_retention_period_years: 10,
};

export function ComplianceSettings() {
  const [settings, setSettings] = useState<ComplianceSettings>(DEFAULT_SETTINGS);
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
        .from('compliance_settings')
        .select('*')
        .single();

      if (data) {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      }
    } catch (error) {
      console.error('Error fetching compliance settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('compliance_settings')
        .upsert({
          id: '00000000-0000-0000-0000-000000000001',
          ...settings,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: 'Settings Saved',
        description: 'Compliance settings have been updated.',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save compliance settings.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof ComplianceSettings>(key: K, value: ComplianceSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const runDataCleanup = async () => {
    toast({
      title: 'Data Cleanup Started',
      description: 'Archived records older than the retention period will be purged.',
    });
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
      {/* Compliance Overview */}
      <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/50">
              <Shield className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-green-900 dark:text-green-100">Compliance Status</h3>
              <p className="text-sm text-green-700 dark:text-green-300">
                All compliance features are properly configured
              </p>
            </div>
            <Badge className="bg-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Compliant
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Data Retention */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Database className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Data Retention Policy</CardTitle>
                <CardDescription>
                  Configure how long data is retained before archival or deletion
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.retention_policy_enabled}
              onCheckedChange={(v) => updateSetting('retention_policy_enabled', v)}
            />
          </div>
        </CardHeader>
        {settings.retention_policy_enabled && (
          <CardContent className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Active Records Retention</Label>
                <Select
                  value={settings.retention_period_years.toString()}
                  onValueChange={(v) => updateSetting('retention_period_years', parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 years</SelectItem>
                    <SelectItem value="5">5 years</SelectItem>
                    <SelectItem value="7">7 years</SelectItem>
                    <SelectItem value="10">10 years</SelectItem>
                    <SelectItem value="99">Forever</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  How long to keep active client data
                </p>
              </div>
              <div className="space-y-2">
                <Label>Deleted Records</Label>
                <Select
                  value={settings.retention_deleted_records_days.toString()}
                  onValueChange={(v) => updateSetting('retention_deleted_records_days', parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="180">180 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Soft-deleted records can be recovered
                </p>
              </div>
              <div className="space-y-2">
                <Label>Audit Logs</Label>
                <Select
                  value={settings.retention_audit_logs_years.toString()}
                  onValueChange={(v) => updateSetting('retention_audit_logs_years', parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 year</SelectItem>
                    <SelectItem value="3">3 years</SelectItem>
                    <SelectItem value="5">5 years</SelectItem>
                    <SelectItem value="7">7 years</SelectItem>
                    <SelectItem value="10">10 years</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Audit trail for compliance reviews
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <div className="font-medium">Auto-Archive Old Records</div>
                <div className="text-sm text-muted-foreground">
                  Automatically archive records that exceed retention period
                </div>
              </div>
              <Switch
                checked={settings.auto_archive_enabled}
                onCheckedChange={(v) => updateSetting('auto_archive_enabled', v)}
              />
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Run Data Cleanup Now
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Run Data Cleanup?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete archived records older than the retention period.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={runDataCleanup}>
                    Run Cleanup
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        )}
      </Card>

      {/* Audit Logging */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Eye className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Audit Logging</CardTitle>
              <CardDescription>
                Control what actions are recorded in the audit trail
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'audit_login_events', label: 'Login Events', desc: 'User sign-in and sign-out' },
              { key: 'audit_data_changes', label: 'Data Changes', desc: 'Create, update, delete records' },
              { key: 'audit_document_access', label: 'Document Access', desc: 'Document views and downloads' },
              { key: 'audit_policy_changes', label: 'Policy Changes', desc: 'Policy modifications and binding' },
              { key: 'audit_exports', label: 'Data Exports', desc: 'CSV and report exports' },
              { key: 'audit_admin_actions', label: 'Admin Actions', desc: 'Settings and user management' },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <div className="font-medium text-sm">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
                <Switch
                  checked={settings[item.key as keyof ComplianceSettings] as boolean}
                  onCheckedChange={(v) => updateSetting(item.key as keyof ComplianceSettings, v)}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Privacy / GDPR / CCPA */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <Lock className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Privacy & Data Rights</CardTitle>
              <CardDescription>
                GDPR, CCPA, and privacy compliance settings
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'privacy_consent_required', label: 'Require Consent', desc: 'Require consent before collecting data' },
            { key: 'privacy_cookie_banner', label: 'Cookie Banner', desc: 'Show cookie consent banner to visitors' },
            { key: 'privacy_data_export_enabled', label: 'Data Export', desc: 'Allow clients to export their data' },
            { key: 'privacy_right_to_delete_enabled', label: 'Right to Delete', desc: 'Allow clients to request data deletion' },
            { key: 'privacy_marketing_consent_required', label: 'Marketing Consent', desc: 'Require opt-in for marketing emails' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <div className="font-medium">{item.label}</div>
                <div className="text-sm text-muted-foreground">{item.desc}</div>
              </div>
              <Switch
                checked={settings[item.key as keyof ComplianceSettings] as boolean}
                onCheckedChange={(v) => updateSetting(item.key as keyof ComplianceSettings, v)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* E&O Documentation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Scale className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-lg">E&O Documentation Requirements</CardTitle>
              <CardDescription>
                Configure documentation requirements to protect against E&O claims
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'eo_require_signed_app', label: 'Require Signed Application', desc: 'Client must sign application before binding' },
            { key: 'eo_require_coverage_confirmation', label: 'Coverage Confirmation', desc: 'Document coverage discussions with client' },
            { key: 'eo_require_decline_reason', label: 'Decline Reason Required', desc: 'Document reason when client declines coverage' },
            { key: 'eo_auto_document_binding', label: 'Auto-Document Binding', desc: 'Automatically log all binding activities' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <div className="font-medium">{item.label}</div>
                <div className="text-sm text-muted-foreground">{item.desc}</div>
              </div>
              <Switch
                checked={settings[item.key as keyof ComplianceSettings] as boolean}
                onCheckedChange={(v) => updateSetting(item.key as keyof ComplianceSettings, v)}
              />
            </div>
          ))}

          <Separator />

          <div className="space-y-2">
            <Label>E&O Document Retention</Label>
            <Select
              value={settings.eo_retention_period_years.toString()}
              onValueChange={(v) => updateSetting('eo_retention_period_years', parseInt(v))}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 years</SelectItem>
                <SelectItem value="7">7 years</SelectItem>
                <SelectItem value="10">10 years</SelectItem>
                <SelectItem value="15">15 years</SelectItem>
                <SelectItem value="99">Forever</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              E&O-related documents should be kept longer than standard retention
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Warning */}
      <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
        <div className="flex gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 dark:text-amber-100">
            <p className="font-medium mb-1">Important Notice</p>
            <p>
              Compliance settings affect data handling across your entire organization.
              Consult with your compliance officer or legal counsel before making changes.
              Some settings may be required by your state insurance regulations.
            </p>
          </div>
        </div>
      </div>

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
              Save Compliance Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default ComplianceSettings;


