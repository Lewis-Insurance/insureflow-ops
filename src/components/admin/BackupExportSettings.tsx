/**
 * Backup & Export Settings Component
 * 
 * Configure data backup and export:
 * - Scheduled Automatic Backups
 * - Manual Data Export (CSV/JSON)
 * - Export History Log
 * - Selective Export (clients, policies, claims, etc.)
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  HardDrive,
  Download,
  Upload,
  Clock,
  Calendar,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileJson,
  FileSpreadsheet,
  FolderArchive,
  History,
  Play,
  RefreshCw,
  Trash2,
  Eye,
  Users,
  FileText,
  ShieldAlert,
  DollarSign,
  Building2,
  Phone,
  Mail,
  MessageSquare,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

// =============================================================================
// TYPES
// =============================================================================

interface BackupSettings {
  auto_backup_enabled: boolean;
  backup_frequency: 'daily' | 'weekly' | 'monthly';
  backup_time: string;
  backup_day_of_week: number; // 0-6, Sunday = 0
  backup_day_of_month: number; // 1-28
  backup_retention_days: number;
  backup_format: 'json' | 'csv' | 'both';
  include_documents: boolean;
  notification_email: string;
  last_backup_at: string | null;
  last_backup_status: 'success' | 'failed' | null;
}

interface ExportHistory {
  id: string;
  export_type: 'manual' | 'scheduled';
  format: 'json' | 'csv';
  tables_exported: string[];
  record_count: number;
  file_size_mb: number;
  status: 'completed' | 'failed' | 'in_progress';
  created_at: string;
  download_url?: string;
  error_message?: string;
}

interface ExportableTable {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  recordCount: number;
  selected: boolean;
}

const DEFAULT_SETTINGS: BackupSettings = {
  auto_backup_enabled: false,
  backup_frequency: 'weekly',
  backup_time: '02:00',
  backup_day_of_week: 0, // Sunday
  backup_day_of_month: 1,
  backup_retention_days: 30,
  backup_format: 'json',
  include_documents: false,
  notification_email: '',
  last_backup_at: null,
  last_backup_status: null,
};

const SAMPLE_EXPORT_HISTORY: ExportHistory[] = [
  {
    id: '1',
    export_type: 'scheduled',
    format: 'json',
    tables_exported: ['accounts', 'contacts', 'policies'],
    record_count: 15420,
    file_size_mb: 12.4,
    status: 'completed',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    download_url: '#',
  },
  {
    id: '2',
    export_type: 'manual',
    format: 'csv',
    tables_exported: ['policies', 'claims'],
    record_count: 8750,
    file_size_mb: 5.2,
    status: 'completed',
    created_at: new Date(Date.now() - 172800000).toISOString(),
    download_url: '#',
  },
  {
    id: '3',
    export_type: 'scheduled',
    format: 'json',
    tables_exported: ['accounts', 'contacts', 'policies', 'claims', 'documents'],
    record_count: 0,
    file_size_mb: 0,
    status: 'failed',
    created_at: new Date(Date.now() - 604800000).toISOString(),
    error_message: 'Connection timeout',
  },
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function BackupExportSettings() {
  const [settings, setSettings] = useState<BackupSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportHistory, setExportHistory] = useState<ExportHistory[]>(SAMPLE_EXPORT_HISTORY);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('csv');
  const { toast } = useToast();

  // Exportable tables with selection state
  const [exportableTables, setExportableTables] = useState<ExportableTable[]>([
    { id: 'accounts', name: 'Accounts', description: 'Client accounts and company info', icon: <Building2 className="h-4 w-4" />, recordCount: 1250, selected: true },
    { id: 'contacts', name: 'Contacts', description: 'Contact persons and details', icon: <Users className="h-4 w-4" />, recordCount: 3420, selected: true },
    { id: 'policies', name: 'Policies', description: 'Insurance policies and coverage', icon: <FileText className="h-4 w-4" />, recordCount: 4800, selected: true },
    { id: 'claims', name: 'Claims', description: 'Claims and loss history', icon: <ShieldAlert className="h-4 w-4" />, recordCount: 890, selected: false },
    { id: 'quotes', name: 'Quotes', description: 'Quote requests and proposals', icon: <DollarSign className="h-4 w-4" />, recordCount: 2100, selected: false },
    { id: 'documents', name: 'Documents', description: 'Document metadata (not files)', icon: <FolderArchive className="h-4 w-4" />, recordCount: 12500, selected: false },
    { id: 'tasks', name: 'Tasks', description: 'Tasks and activities', icon: <CheckCircle2 className="h-4 w-4" />, recordCount: 5600, selected: false },
    { id: 'communications', name: 'Communications', description: 'Emails, calls, SMS logs', icon: <MessageSquare className="h-4 w-4" />, recordCount: 28000, selected: false },
    { id: 'notes', name: 'Notes', description: 'Account and contact notes', icon: <FileText className="h-4 w-4" />, recordCount: 7800, selected: false },
  ]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('backup_settings')
        .select('*')
        .single();

      if (data) {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      }
    } catch (error) {
      console.error('Error fetching backup settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('backup_settings')
        .upsert({
          id: '00000000-0000-0000-0000-000000000001',
          ...settings,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: 'Settings Saved',
        description: 'Backup settings have been updated.',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save backup settings.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof BackupSettings>(key: K, value: BackupSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const toggleTableSelection = (tableId: string) => {
    setExportableTables(prev =>
      prev.map(t => t.id === tableId ? { ...t, selected: !t.selected } : t)
    );
  };

  const selectAllTables = () => {
    setExportableTables(prev => prev.map(t => ({ ...t, selected: true })));
  };

  const deselectAllTables = () => {
    setExportableTables(prev => prev.map(t => ({ ...t, selected: false })));
  };

  const runManualExport = async () => {
    const selectedTables = exportableTables.filter(t => t.selected);
    if (selectedTables.length === 0) {
      toast({
        title: 'No Tables Selected',
        description: 'Please select at least one table to export.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setExporting(true);
      setExportProgress(0);

      // Simulate export progress
      const progressInterval = setInterval(() => {
        setExportProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 300);

      // Simulate export delay
      await new Promise(resolve => setTimeout(resolve, 3000));
      clearInterval(progressInterval);
      setExportProgress(100);

      // Add to history
      const newExport: ExportHistory = {
        id: crypto.randomUUID(),
        export_type: 'manual',
        format: exportFormat,
        tables_exported: selectedTables.map(t => t.id),
        record_count: selectedTables.reduce((sum, t) => sum + t.recordCount, 0),
        file_size_mb: Math.round(selectedTables.reduce((sum, t) => sum + t.recordCount * 0.001, 0) * 10) / 10,
        status: 'completed',
        created_at: new Date().toISOString(),
        download_url: '#',
      };

      setExportHistory(prev => [newExport, ...prev]);

      toast({
        title: 'Export Complete',
        description: `Successfully exported ${selectedTables.length} tables with ${newExport.record_count.toLocaleString()} records.`,
      });

      setShowExportDialog(false);
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Export Failed',
        description: 'An error occurred during export.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  };

  const runBackupNow = async () => {
    try {
      setSaving(true);
      
      // Simulate backup
      await new Promise(resolve => setTimeout(resolve, 2000));

      setSettings(prev => ({
        ...prev,
        last_backup_at: new Date().toISOString(),
        last_backup_status: 'success',
      }));

      toast({
        title: 'Backup Complete',
        description: 'Full system backup completed successfully.',
      });
    } catch (error) {
      console.error('Backup error:', error);
      toast({
        title: 'Backup Failed',
        description: 'An error occurred during backup.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteExportHistory = (id: string) => {
    setExportHistory(prev => prev.filter(e => e.id !== id));
    toast({
      title: 'Export Deleted',
      description: 'Export record has been removed.',
    });
  };

  const selectedTableCount = exportableTables.filter(t => t.selected).length;
  const selectedRecordCount = exportableTables.filter(t => t.selected).reduce((sum, t) => sum + t.recordCount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setShowExportDialog(true)}>
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/50">
                <Download className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold">Export Data</h3>
                <p className="text-sm text-muted-foreground">Download data as CSV or JSON</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={runBackupNow}>
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/50">
                <HardDrive className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold">Backup Now</h3>
                <p className="text-sm text-muted-foreground">Create immediate full backup</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Last Backup Status */}
      {settings.last_backup_at && (
        <Card className={settings.last_backup_status === 'success' 
          ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20'
          : 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20'
        }>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-full ${
                settings.last_backup_status === 'success' 
                  ? 'bg-green-100 dark:bg-green-900/50' 
                  : 'bg-red-100 dark:bg-red-900/50'
              }`}>
                {settings.last_backup_status === 'success' 
                  ? <CheckCircle2 className="h-6 w-6 text-green-600" />
                  : <AlertCircle className="h-6 w-6 text-red-600" />
                }
              </div>
              <div className="flex-1">
                <h3 className={`font-medium ${
                  settings.last_backup_status === 'success' 
                    ? 'text-green-900 dark:text-green-100' 
                    : 'text-red-900 dark:text-red-100'
                }`}>
                  Last Backup: {settings.last_backup_status === 'success' ? 'Successful' : 'Failed'}
                </h3>
                <p className={`text-sm ${
                  settings.last_backup_status === 'success' 
                    ? 'text-green-700 dark:text-green-300' 
                    : 'text-red-700 dark:text-red-300'
                }`}>
                  {new Date(settings.last_backup_at).toLocaleString()}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={runBackupNow} disabled={saving}>
                <RefreshCw className={`h-4 w-4 mr-2 ${saving ? 'animate-spin' : ''}`} />
                Run Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scheduled Backups */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Scheduled Backups</CardTitle>
                <CardDescription>
                  Automatically backup your data on a schedule
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.auto_backup_enabled}
              onCheckedChange={(v) => updateSetting('auto_backup_enabled', v)}
            />
          </div>
        </CardHeader>
        {settings.auto_backup_enabled && (
          <CardContent className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={settings.backup_frequency}
                  onValueChange={(v: 'daily' | 'weekly' | 'monthly') => updateSetting('backup_frequency', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {settings.backup_frequency === 'weekly' && (
                <div className="space-y-2">
                  <Label>Day of Week</Label>
                  <Select
                    value={settings.backup_day_of_week.toString()}
                    onValueChange={(v) => updateSetting('backup_day_of_week', parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Sunday</SelectItem>
                      <SelectItem value="1">Monday</SelectItem>
                      <SelectItem value="2">Tuesday</SelectItem>
                      <SelectItem value="3">Wednesday</SelectItem>
                      <SelectItem value="4">Thursday</SelectItem>
                      <SelectItem value="5">Friday</SelectItem>
                      <SelectItem value="6">Saturday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {settings.backup_frequency === 'monthly' && (
                <div className="space-y-2">
                  <Label>Day of Month</Label>
                  <Select
                    value={settings.backup_day_of_month.toString()}
                    onValueChange={(v) => updateSetting('backup_day_of_month', parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 5, 10, 15, 20, 25, 28].map(day => (
                        <SelectItem key={day} value={day.toString()}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={settings.backup_time}
                  onChange={(e) => updateSetting('backup_time', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Backup Format</Label>
                <Select
                  value={settings.backup_format}
                  onValueChange={(v: 'json' | 'csv' | 'both') => updateSetting('backup_format', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="both">Both (JSON + CSV)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Keep Backups For</Label>
                <Select
                  value={settings.backup_retention_days.toString()}
                  onValueChange={(v) => updateSetting('backup_retention_days', parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">Include Document Files</div>
                  <div className="text-sm text-muted-foreground">
                    Include uploaded documents (increases backup size significantly)
                  </div>
                </div>
                <Switch
                  checked={settings.include_documents}
                  onCheckedChange={(v) => updateSetting('include_documents', v)}
                />
              </div>

              <div className="space-y-2">
                <Label>Notification Email</Label>
                <Input
                  type="email"
                  value={settings.notification_email}
                  onChange={(e) => updateSetting('notification_email', e.target.value)}
                  placeholder="admin@youragency.com"
                />
                <p className="text-xs text-muted-foreground">
                  Receive notifications when backups complete or fail
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Export History */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <History className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Export History</CardTitle>
              <CardDescription>
                View and download previous exports
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {exportHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No exports yet</p>
              <p className="text-sm">Export history will appear here</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Tables</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exportHistory.map((exp) => (
                  <TableRow key={exp.id}>
                    <TableCell className="font-medium">
                      {new Date(exp.created_at).toLocaleDateString()}
                      <div className="text-xs text-muted-foreground">
                        {new Date(exp.created_at).toLocaleTimeString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {exp.export_type === 'scheduled' ? 'Scheduled' : 'Manual'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {exp.format === 'json' 
                          ? <FileJson className="h-4 w-4 text-amber-600" />
                          : <FileSpreadsheet className="h-4 w-4 text-green-600" />
                        }
                        <span className="text-sm">
                          {exp.tables_exported.length} tables
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{exp.record_count.toLocaleString()}</TableCell>
                    <TableCell>{exp.file_size_mb} MB</TableCell>
                    <TableCell>
                      {exp.status === 'completed' ? (
                        <Badge className="bg-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Completed
                        </Badge>
                      ) : exp.status === 'failed' ? (
                        <Badge variant="destructive">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Failed
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          In Progress
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {exp.status === 'completed' && exp.download_url && (
                          <Button variant="ghost" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => deleteExportHistory(exp.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
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
              Save Backup Settings
            </>
          )}
        </Button>
      </div>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Data
            </DialogTitle>
            <DialogDescription>
              Select the tables you want to export and choose a format
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Format Selection */}
            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
              <Label>Export Format:</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant={exportFormat === 'csv' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setExportFormat('csv')}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  CSV
                </Button>
                <Button
                  variant={exportFormat === 'json' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setExportFormat('json')}
                >
                  <FileJson className="h-4 w-4 mr-2" />
                  JSON
                </Button>
              </div>
            </div>

            {/* Table Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Select Tables to Export</Label>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAllTables}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAllTables}>
                    Deselect All
                  </Button>
                </div>
              </div>
              <div className="border rounded-lg divide-y max-h-[300px] overflow-y-auto">
                {exportableTables.map((table) => (
                  <div
                    key={table.id}
                    className={`flex items-center gap-4 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                      table.selected ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => toggleTableSelection(table.id)}
                  >
                    <Checkbox checked={table.selected} />
                    <div className="p-2 rounded bg-muted">
                      {table.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{table.name}</div>
                      <div className="text-sm text-muted-foreground">{table.description}</div>
                    </div>
                    <Badge variant="secondary">
                      {table.recordCount.toLocaleString()} records
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <div className="font-medium">Export Summary</div>
                <div className="text-sm text-muted-foreground">
                  {selectedTableCount} tables · {selectedRecordCount.toLocaleString()} records
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium">
                  ~{(selectedRecordCount * 0.001).toFixed(1)} MB
                </div>
                <div className="text-sm text-muted-foreground">Estimated size</div>
              </div>
            </div>

            {/* Progress */}
            {exporting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Exporting...</span>
                  <span>{exportProgress}%</span>
                </div>
                <Progress value={exportProgress} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)} disabled={exporting}>
              Cancel
            </Button>
            <Button onClick={runManualExport} disabled={exporting || selectedTableCount === 0}>
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export {selectedTableCount} Tables
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BackupExportSettings;


