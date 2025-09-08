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

    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV file.",
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
        const row: any = { _row_number: index + 2 };
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

      // Simulate dry run processing
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock validation results
      const mockRows: ImportRow[] = csvData.slice(0, 10).map((row, index) => ({
        id: `row-${index}`,
        row_number: index + 2,
        raw_data: row,
        validation_status: Math.random() > 0.8 ? 'invalid' : 'valid',
        validation_errors: Math.random() > 0.8 ? ['Invalid email format'] : []
      }));
      
      setImportRows(mockRows);
      
      const mockBatch: ImportBatch = {
        id: 'batch-1',
        import_type: importType,
        filename: csvFile?.name || 'unknown.csv',
        total_rows: csvData.length,
        processed_rows: csvData.length,
        successful_rows: mockRows.filter(r => r.validation_status === 'valid').length,
        error_rows: mockRows.filter(r => r.validation_status === 'invalid').length,
        status: 'staging',
        field_mapping: fieldMapping,
        validation_errors: [],
        created_at: new Date().toISOString()
      };
      
      setCurrentBatch(mockBatch);
      setStep('preview');
      
      toast({
        title: "Dry run completed",
        description: `${mockBatch.successful_rows} rows valid, ${mockBatch.error_rows} rows have errors.`,
      });
    } catch (error) {
      toast({
        title: "Error during dry run",
        description: "Please check your file and try again.",
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
      // Simulate import processing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      setCurrentBatch(prev => prev ? {
        ...prev,
        status: 'completed'
      } : null);
      
      setStep('complete');
      onImportComplete?.();
      
      toast({
        title: "Import completed",
        description: `Successfully imported ${currentBatch.successful_rows} records.`,
      });
    } catch (error) {
      setCurrentBatch(prev => prev ? {
        ...prev,
        status: 'failed'
      } : null);
      
      toast({
        title: "Import failed",
        description: "Please check the errors and try again.",
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
              
              <div>
                <Label htmlFor="csv-file">CSV File</Label>
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
                      value={fieldMapping[header] || ''}
                      onValueChange={(value) => handleFieldMapping(header, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select field..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">-- Skip this column --</SelectItem>
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
                        {row.validation_errors.map((error, index) => (
                          <Badge key={index} variant="destructive" className="text-xs">
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