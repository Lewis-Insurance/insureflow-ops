import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, FileText, AlertCircle, CheckCircle2, X, Download, Eye } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface ImportBatch {
  id: string;
  import_type: 'accounts' | 'contacts';
  filename: string;
  total_rows: number;
  processed_rows: number;
  successful_rows: number;
  error_rows: number;
  status: 'staging' | 'processing' | 'completed' | 'failed';
  field_mapping?: Record<string, string>;
  validation_errors: any[];
  created_at: string;
}

interface ImportRow {
  id: string;
  row_number: number;
  raw_data: Record<string, any>;
  validation_status: 'pending' | 'valid' | 'invalid';
  validation_errors: string[];
}

interface CSVImportProps {
  onImportComplete?: () => void;
  className?: string;
}

export function CSVImport({ onImportComplete, className }: CSVImportProps) {
  const [importType, setImportType] = useState<'accounts' | 'contacts'>('accounts');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [currentBatch, setCurrentBatch] = useState<ImportBatch | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'processing' | 'complete'>('upload');
  const [loading, setLoading] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const accountFields = [
    { key: 'name', label: 'Account Name *', required: true },
    { key: 'type', label: 'Type (household/business)', required: false },
    { key: 'email', label: 'Email Address', required: false },
    { key: 'phone', label: 'Phone Number', required: false },
    { key: 'address_line1', label: 'Street Address', required: false },
    { key: 'city', label: 'City', required: false },
    { key: 'state', label: 'State', required: false },
    { key: 'zip_code', label: 'ZIP Code', required: false },
    { key: 'source', label: 'Source', required: false },
  ];

  const contactFields = [
    { key: 'first_name', label: 'First Name *', required: true },
    { key: 'last_name', label: 'Last Name *', required: true },
    { key: 'email', label: 'Email Address', required: false },
    { key: 'phone', label: 'Phone Number', required: false },
    { key: 'date_of_birth', label: 'Date of Birth', required: false },
    { key: 'role', label: 'Role', required: false },
    { key: 'source', label: 'Source', required: false },
  ];

  const availableFields = importType === 'accounts' ? accountFields : contactFields;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file extension (case-insensitive) and MIME type
    const fileName = file.name.toLowerCase();
    const validExtensions = ['.csv'];
    const validMimeTypes = ['text/csv', 'application/csv', 'text/plain'];
    
    const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
    const hasValidMimeType = validMimeTypes.includes(file.type);
    
    if (!hasValidExtension && !hasValidMimeType) {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV file (.csv extension or text/csv MIME type).",
        variant: "destructive",
      });
      return;
    }

    setCsvFile(file);
    
    // Parse CSV (simplified - in real implementation use a proper CSV parser)
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const data = lines.slice(1).map((line, index) => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const row: Record<string, string | number | boolean | null> = { _row_number: index + 2 };
        headers.forEach((header, i) => {
          row[header] = values[i] || '';
        });
        return row;
      });
      
      setCsvHeaders(headers);
      setCsvData(data);
      setStep('mapping');
    };
    reader.readAsText(file);
  };

  const handleFieldMapping = (csvField: string, dbField: string) => {
    setFieldMapping(prev => ({
      ...prev,
      [csvField]: dbField
    }));
  };

  const runDryRun = async () => {
    setLoading(true);
    try {
      // Validate field mapping
      const requiredFields = availableFields.filter(f => f.required);
      const mappedRequiredFields = requiredFields.filter(field =>
        Object.values(fieldMapping).includes(field.key)
      );

      if (mappedRequiredFields.length < requiredFields.length) {
        toast({
          title: "Missing required fields",
          description: "Please map all required fields before proceeding.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Real validation of CSV data
      const validatedRows: ImportRow[] = csvData.map((row, index) => {
        const errors: string[] = [];
        const mappedData: Record<string, any> = {};

        // Map CSV fields to database fields
        for (const [csvField, dbField] of Object.entries(fieldMapping)) {
          if (dbField && row[csvField] !== undefined) {
            mappedData[dbField] = row[csvField];
          }
        }

        // Validate required fields
        for (const field of requiredFields) {
          const value = mappedData[field.key];
          if (!value || String(value).trim() === '') {
            errors.push(`${field.label.replace(' *', '')} is required`);
          }
        }

        // Validate email format
        if (mappedData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mappedData.email)) {
          errors.push('Invalid email format');
        }

        // Validate phone format (basic check)
        if (mappedData.phone && !/^[\d\s\-()+ ]+$/.test(mappedData.phone)) {
          errors.push('Invalid phone format');
        }

        // Validate date of birth format
        if (mappedData.date_of_birth) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(mappedData.date_of_birth)) {
            errors.push('Date of birth should be YYYY-MM-DD format');
          }
        }

        return {
          id: `row-${index}`,
          row_number: (row._row_number as number) || index + 2,
          raw_data: { ...row, _mapped: mappedData },
          validation_status: errors.length === 0 ? 'valid' : 'invalid',
          validation_errors: errors
        };
      });

      setImportRows(validatedRows);

      const validCount = validatedRows.filter(r => r.validation_status === 'valid').length;
      const errorCount = validatedRows.filter(r => r.validation_status === 'invalid').length;

      const batch: ImportBatch = {
        id: crypto.randomUUID(),
        import_type: importType,
        filename: csvFile?.name || 'unknown.csv',
        total_rows: csvData.length,
        processed_rows: csvData.length,
        successful_rows: validCount,
        error_rows: errorCount,
        status: 'staging',
        field_mapping: fieldMapping,
        validation_errors: [],
        created_at: new Date().toISOString()
      };

      setCurrentBatch(batch);
      setStep('preview');

      toast({
        title: "Validation completed",
        description: `${validCount} rows valid, ${errorCount} rows have errors.`,
      });
    } catch (error) {
      toast({
        title: "Error during validation",
        description: error instanceof Error ? error.message : "Please check your file and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const executeImport = async () => {
    if (!currentBatch) return;

    setLoading(true);
    setStep('processing');

    try {
      // Get valid rows only
      const validRows = importRows.filter(r => r.validation_status === 'valid');

      if (validRows.length === 0) {
        throw new Error('No valid rows to import');
      }

      // Get the current user's account
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Get user's account membership
      const { data: membership } = await supabase
        .from('account_memberships')
        .select('account_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      const accountId = membership?.account_id;

      let successCount = 0;
      let errorCount = 0;

      if (importType === 'accounts') {
        // Import accounts
        const accountRecords = validRows.map(row => {
          const mapped = row.raw_data._mapped || {};
          return {
            name: mapped.name,
            type: mapped.type || 'household',
            email: mapped.email || null,
            phone: mapped.phone || null,
            address_line1: mapped.address_line1 || null,
            city: mapped.city || null,
            state: mapped.state || null,
            zip_code: mapped.zip_code || null,
            source: mapped.source || 'csv_import',
            created_by: user.id,
          };
        });

        // Insert in batches of 100
        for (let i = 0; i < accountRecords.length; i += 100) {
          const batch = accountRecords.slice(i, i + 100);
          const { data, error } = await supabase
            .from('accounts')
            .insert(batch)
            .select('id');

          if (error) {
            console.error('Batch insert error:', error);
            errorCount += batch.length;
          } else {
            successCount += data?.length || 0;
          }
        }
      } else if (importType === 'contacts') {
        // Import contacts
        const contactRecords = validRows.map(row => {
          const mapped = row.raw_data._mapped || {};
          return {
            first_name: mapped.first_name,
            last_name: mapped.last_name,
            email: mapped.email || null,
            phone: mapped.phone || null,
            date_of_birth: mapped.date_of_birth || null,
            role: mapped.role || null,
            source: mapped.source || 'csv_import',
            account_id: accountId,
            created_by: user.id,
          };
        });

        // Insert in batches of 100
        for (let i = 0; i < contactRecords.length; i += 100) {
          const batch = contactRecords.slice(i, i + 100);
          const { data, error } = await supabase
            .from('contacts')
            .insert(batch)
            .select('id');

          if (error) {
            console.error('Batch insert error:', error);
            errorCount += batch.length;
          } else {
            successCount += data?.length || 0;
          }
        }
      }

      setCurrentBatch(prev => prev ? {
        ...prev,
        status: 'completed',
        successful_rows: successCount,
        error_rows: errorCount,
      } : null);

      setStep('complete');
      onImportComplete?.();

      toast({
        title: "Import completed",
        description: `Successfully imported ${successCount} ${importType}${errorCount > 0 ? `. ${errorCount} failed.` : '.'}`,
      });
    } catch (error) {
      console.error('Import error:', error);
      setCurrentBatch(prev => prev ? {
        ...prev,
        status: 'failed'
      } : null);

      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Please check the errors and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetImport = () => {
    setCsvFile(null);
    setCsvData([]);
    setCsvHeaders([]);
    setFieldMapping({});
    setCurrentBatch(null);
    setImportRows([]);
    setStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const downloadTemplate = () => {
    const fields = importType === 'accounts' ? accountFields : contactFields;
    const headers = fields.map(f => f.key).join(',');
    const sampleRow = fields.map(f => {
      if (f.key === 'name') return 'John Doe Insurance';
      if (f.key === 'first_name') return 'John';
      if (f.key === 'last_name') return 'Doe';
      if (f.key === 'email') return 'example@email.com';
      if (f.key === 'phone') return '555-123-4567';
      if (f.key === 'type') return 'household';
      if (f.key === 'address_line1') return '123 Main St';
      if (f.key === 'city') return 'Anytown';
      if (f.key === 'state') return 'CA';
      if (f.key === 'zip_code') return '12345';
      if (f.key === 'date_of_birth') return '1990-01-01';
      if (f.key === 'role') return 'Primary Contact';
      if (f.key === 'source') return 'Website';
      return '';
    }).join(',');
    
    const csvContent = `${headers}\n${sampleRow}`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${importType}_template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    toast({
      title: 'Template downloaded',
      description: `${importType} CSV template has been downloaded.`,
    });
  };

  const errorRows = importRows.filter(row => row.validation_status === 'invalid');

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            CSV Data Import
          </CardTitle>
          <CardDescription>
            Import accounts and contacts from CSV files with validation and error reporting
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Progress Steps */}
          <div className="flex items-center justify-between">
            {['upload', 'mapping', 'preview', 'processing', 'complete'].map((stepName, index) => (
              <div key={stepName} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  step === stepName ? 'bg-primary text-primary-foreground' :
                  ['upload', 'mapping', 'preview'].indexOf(step) > index ? 'bg-green-600 text-white' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {['upload', 'mapping', 'preview'].indexOf(step) > index ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                {index < 4 && (
                  <div className={`w-12 h-0.5 mx-2 ${
                    ['upload', 'mapping', 'preview'].indexOf(step) > index ? 'bg-green-600' : 'bg-muted'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="import-type">Import Type</Label>
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
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="csv-file">CSV File</Label>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={downloadTemplate}
                    type="button"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Template
                  </Button>
                </div>
                <Input
                  ref={fileInputRef}
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Upload a CSV file with {importType} data. First row should contain column headers.
                </p>
              </div>
              
              {csvFile && (
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-medium">{csvFile.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {csvData.length} rows found
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 2: Field Mapping */}
          {step === 'mapping' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium">Map CSV Columns to Database Fields</h3>
                <p className="text-sm text-muted-foreground">
                  Map your CSV columns to the appropriate database fields. Required fields are marked with *.
                </p>
              </div>
              
              <div className="grid gap-4">
                {csvHeaders.map((header) => (
                  <div key={header} className="grid grid-cols-2 gap-4 items-center">
                    <div>
                      <Label className="font-medium">{header}</Label>
                      <p className="text-sm text-muted-foreground">
                        Sample: "{csvData[0]?.[header] || 'N/A'}"
                      </p>
                    </div>
                    <Select
                      value={fieldMapping[header] || '__skip__'}
                      onValueChange={(value) => handleFieldMapping(header, value === '__skip__' ? '' : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select field..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip__">-- Skip this column --</SelectItem>
                        {availableFields.map((field) => (
                          <SelectItem key={field.key} value={field.key}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-2">
                <Button onClick={runDryRun} disabled={loading}>
                  {loading ? 'Validating...' : 'Run Dry Run'}
                </Button>
                <Button variant="outline" onClick={resetImport}>
                  Start Over
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Preview & Validation */}
          {step === 'preview' && currentBatch && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium">Import Preview</h3>
                <p className="text-sm text-muted-foreground">
                  Review the validation results before proceeding with the import.
                </p>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <div className="text-2xl font-bold text-green-600">{currentBatch.successful_rows}</div>
                    <p className="text-sm text-muted-foreground">Valid Rows</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <div className="text-2xl font-bold text-red-600">{currentBatch.error_rows}</div>
                    <p className="text-sm text-muted-foreground">Error Rows</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <div className="text-2xl font-bold">{currentBatch.total_rows}</div>
                    <p className="text-sm text-muted-foreground">Total Rows</p>
                  </CardContent>
                </Card>
              </div>
              
              {errorRows.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      Validation Errors
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setPreviewDialogOpen(true)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Error Details
                    </Button>
                  </CardContent>
                </Card>
              )}
              
              <div className="flex gap-2">
                <Button 
                  onClick={executeImport} 
                  disabled={loading || currentBatch.successful_rows === 0}
                >
                  Import {currentBatch.successful_rows} Valid Rows
                </Button>
                <Button variant="outline" onClick={() => setStep('mapping')}>
                  Back to Mapping
                </Button>
                <Button variant="outline" onClick={resetImport}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Processing */}
          {step === 'processing' && currentBatch && (
            <div className="space-y-4 text-center">
              <div>
                <h3 className="text-lg font-medium">Processing Import</h3>
                <p className="text-sm text-muted-foreground">
                  Please wait while we import your data...
                </p>
              </div>
              
              <div className="space-y-2">
                <Progress value={75} className="w-full" />
                <p className="text-sm text-muted-foreground">
                  Importing {currentBatch.successful_rows} records...
                </p>
              </div>
            </div>
          )}

          {/* Step 5: Complete */}
          {step === 'complete' && currentBatch && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <CheckCircle2 className="h-16 w-16 text-green-600" />
              </div>
              
              <div>
                <h3 className="text-lg font-medium">Import Completed Successfully!</h3>
                <p className="text-sm text-muted-foreground">
                  {currentBatch.successful_rows} {importType} have been imported successfully.
                </p>
              </div>
              
              <Button onClick={resetImport}>
                Import Another File
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error Details Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Validation Errors</DialogTitle>
            <DialogDescription>
              The following rows have validation errors and will be skipped during import.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errorRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.row_number}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {Object.entries(row.raw_data).slice(0, 3).map(([key, value]) => (
                          <div key={key}>
                            <span className="font-medium">{key}:</span> {String(value)}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {row.validation_errors.map((error, errorIndex) => (
                          <Badge key={`${row.id}-error-${errorIndex}`} variant="destructive" className="text-xs">
                            {error}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}