import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, CheckCircle2, AlertCircle, Clock, Download, Trash2, Eye } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ImportBatch, ImportStaging, DataExportRequest } from '@/types/crm-enhanced-clean';

// Type guard for validation_errors
function isValidationErrorArray(value: unknown): value is any[] {
  return Array.isArray(value);
}

interface AdvancedImportSystemProps {
  onImportComplete?: () => void;
}

export function AdvancedImportSystem({ onImportComplete }: AdvancedImportSystemProps) {
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [exportRequests, setExportRequests] = useState<DataExportRequest[]>([]);
  const [stagingData, setStagingData] = useState<ImportStaging[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showBatchDetail, setShowBatchDetail] = useState(false);
  const [showStagingPreview, setShowStagingPreview] = useState(false);
  const [importType, setImportType] = useState<'accounts' | 'contacts'>('accounts');
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  
  const { toast } = useToast();

  const fetchImportData = async () => {
    try {
      // Fetch import batches
      const { data: batchData, error: batchError } = await supabase
        .from('import_batches')
        .select('*')
        .order('created_at', { ascending: false });

      if (batchError) throw batchError;

      // Fetch export requests
      const { data: exportData, error: exportError } = await supabase
        .from('data_export_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (exportError) throw exportError;

      setImportBatches(batchData || []);
      setExportRequests(exportData || []);
    } catch (error) {
      console.error('Error fetching import data:', error);
      toast({
        title: "Error loading import data",
        description: "Failed to fetch import history.",
        variant: "destructive",
      });
    }
  };

  React.useEffect(() => {
    fetchImportData();
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV file.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      setUploadProgress(0);

      // Parse CSV file
      const text = await file.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const rows = lines.slice(1).filter(line => line.trim());

      // Create import batch
      const { data: batch, error: batchError } = await supabase
        .from('import_batches')
        .insert({
          import_type: importType,
          filename: file.name,
          total_rows: rows.length,
          status: 'staging',
          imported_by: (await supabase.auth.getUser()).data.user?.id || '',
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Insert staging data
      const stagingRows = rows.map((row, index) => {
        const values = row.split(',').map(v => v.trim().replace(/"/g, ''));
        const rowData: Record<string, any> = {};
        headers.forEach((header, i) => {
          rowData[header] = values[i] || '';
        });

        return {
          batch_id: batch.id,
          row_number: index + 1,
          raw_data: rowData,
          validation_status: 'pending' as const,
        };
      });

      // Insert in chunks to avoid payload limits
      const chunkSize = 100;
      for (let i = 0; i < stagingRows.length; i += chunkSize) {
        const chunk = stagingRows.slice(i, i + chunkSize);
        const { error: stagingError } = await supabase
          .from('import_staging')
          .insert(chunk);

        if (stagingError) throw stagingError;
        
        setUploadProgress(Math.min(100, ((i + chunkSize) / stagingRows.length) * 100));
      }

      toast({
        title: "File uploaded successfully",
        description: `${rows.length} rows staged for import. Review and process when ready.`,
      });

      fetchImportData();
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: "Upload failed",
        description: "Failed to process the CSV file.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  }, [importType, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/csv': ['.csv'],
    },
    multiple: false,
  });

  const processBatch = async (batchId: string) => {
    try {
      setLoading(true);
      
      // Call the RPC function to process the batch
      const { data, error } = await supabase.rpc('process_csv_batch', {
        batch_id: batchId,
        import_type: importType,
        field_mapping: fieldMapping,
      });

      if (error) throw error;

      toast({
        title: "Batch processed successfully",
        description: `Processed ${(data).processed_rows} rows with ${(data).successful_rows} successes.`,
      });

      fetchImportData();
      onImportComplete?.();
    } catch (error) {
      console.error('Error processing batch:', error);
      toast({
        title: "Processing failed",
        description: "Failed to process the import batch.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const previewStagingData = async (batch: ImportBatch) => {
    try {
      const { data, error } = await supabase
        .from('import_staging')
        .select('*')
        .eq('batch_id', batch.id)
        .order('row_number')
        .limit(10);

      if (error) throw error;

      setStagingData(data || []);
      setSelectedBatch(batch);
      setShowStagingPreview(true);
    } catch (error) {
      console.error('Error fetching staging data:', error);
      toast({
        title: "Error loading preview",
        description: "Failed to load staging data preview.",
        variant: "destructive",
      });
    }
  };

  const requestDataExport = async (exportType: string) => {
    try {
      console.log('Requesting data export:', exportType);
      
      // Call the edge function to process the export
      const { data, error } = await supabase.functions.invoke('process-data-export', {
        body: { request_type: exportType }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      console.log('Export request response:', data);

      toast({
        title: "Export Started",
        description: "Policy data export will be available for download shortly.",
      });

      // Refresh the export requests list
      fetchImportData();
    } catch (error: any) {
      console.error('Error requesting export:', error);
      toast({
        title: "Export request failed",
        description: error.message || "Failed to submit export request.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'staging':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Staging</Badge>;
      case 'processing':
        return <Badge variant="default"><Upload className="h-3 w-3 mr-1" />Processing</Badge>;
      case 'completed':
        return <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Advanced Import/Export System
          </CardTitle>
          <CardDescription>
            Import data from CSV files and export system data with comprehensive tracking
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="import" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="import">Import Data</TabsTrigger>
              <TabsTrigger value="history">Import History</TabsTrigger>
              <TabsTrigger value="export">Data Export</TabsTrigger>
            </TabsList>

            <TabsContent value="import" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Import Type</label>
                  <Select value={importType} onValueChange={(value: 'accounts' | 'contacts') => setImportType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="accounts">Accounts</SelectItem>
                      <SelectItem value="contacts">Contacts</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">
                  {isDragActive ? 'Drop the CSV file here' : 'Drag & drop a CSV file here'}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  or click to select a file
                </p>
                <Button disabled={loading}>
                  Select CSV File
                </Button>
              </div>

              {loading && uploadProgress > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Uploading...</span>
                    <span>{Math.round(uploadProgress)}%</span>
                  </div>
                  <Progress value={uploadProgress} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="history">
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {importBatches.map((batch) => (
                    <div key={batch.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4" />
                        <div>
                          <div className="font-medium">{batch.filename}</div>
                          <div className="text-sm text-muted-foreground">
                            {batch.import_type} • {batch.total_rows} rows • 
                            {new Date(batch.created_at).toLocaleDateString()}
                          </div>
                          {batch.status === 'completed' && (
                            <div className="text-xs text-muted-foreground">
                              {batch.successful_rows} successful, {batch.error_rows} errors
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(batch.status)}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => previewStagingData(batch)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {batch.status === 'staging' && (
                          <Button
                            size="sm"
                            onClick={() => processBatch(batch.id)}
                            disabled={loading}
                          >
                            Process
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {importBatches.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No import history found</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="export" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button onClick={() => requestDataExport('accounts')}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Accounts
                </Button>
                <Button onClick={() => requestDataExport('contacts')}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Contacts
                </Button>
                <Button onClick={() => requestDataExport('policies')}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Policies
                </Button>
                <Button onClick={() => requestDataExport('full')}>
                  <Download className="h-4 w-4 mr-2" />
                  Full Data Export
                </Button>
                <Button onClick={() => requestDataExport('audit_logs')}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Audit Logs
                </Button>
              </div>

              <div className="space-y-2">
                <h3 className="font-medium">Export Requests</h3>
                {exportRequests.map((request) => (
                  <div key={request.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{request.request_type}</div>
                      <div className="text-sm text-muted-foreground">
                        Requested: {new Date(request.requested_at).toLocaleString()}
                        {request.completed_at && ` • Completed: ${new Date(request.completed_at).toLocaleString()}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(request.status)}
                      {request.export_url && (
                        <Button size="sm" asChild>
                          <a href={request.export_url} download>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {exportRequests.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    <p>No export requests found</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Staging Data Preview Dialog */}
      <Dialog open={showStagingPreview} onOpenChange={setShowStagingPreview}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Staging Data Preview</DialogTitle>
            <DialogDescription>
              Preview of the first 10 rows from {selectedBatch?.filename}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {stagingData.map((row) => (
                <div key={row.id} className="p-3 border rounded">
                  <div className="text-sm font-medium">Row {row.row_number}</div>
                  <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                    {JSON.stringify(row.raw_data, null, 2)}
                  </pre>
                  {row.validation_errors && isValidationErrorArray(row.validation_errors) && row.validation_errors.length > 0 && (
                    <div className="text-xs text-destructive mt-1">
                      Errors: {JSON.stringify(row.validation_errors)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}