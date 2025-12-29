import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle2,
  X,
  Download,
  RotateCcw,
  Users,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { useBulkImport, ImportStep } from '@/hooks/useBulkImport';

interface BulkImportProps {
  onImportComplete?: () => void;
  className?: string;
}

const STEP_LABELS: Record<ImportStep, string> = {
  upload: 'Upload Files',
  preview: 'Preview Data',
  validation: 'Review Validation',
  processing: 'Import Progress',
  complete: 'Complete',
  failed: 'Failed',
};

export function BulkImport({ onImportComplete, className }: BulkImportProps) {
  const {
    state,
    reset,
    setStep,
    parseFiles,
    validateRecords,
    runImport,
    rollback,
    downloadErrorReport,
    downloadResultReport,
  } = useBulkImport();

  const [contactsFile, setContactsFile] = useState<File | null>(null);
  const [policiesFile, setPoliciesFile] = useState<File | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const contactsInputRef = useRef<HTMLInputElement>(null);
  const policiesInputRef = useRef<HTMLInputElement>(null);

  const handleContactsFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        return;
      }
      setContactsFile(file);
    }
  };

  const handlePoliciesFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        return;
      }
      setPoliciesFile(file);
    }
  };

  const handleParse = async () => {
    const parsedFiles = await parseFiles(contactsFile, policiesFile);
    if (parsedFiles) {
      // Automatically validate after parsing, passing the parsed files directly
      await validateRecords(skipDuplicates, parsedFiles);
    }
  };

  const handleStartImport = async () => {
    const success = await runImport();
    if (success && onImportComplete) {
      onImportComplete();
    }
  };

  const handleReset = () => {
    setContactsFile(null);
    setPoliciesFile(null);
    reset();
  };

  const renderStepIndicator = () => {
    const steps: ImportStep[] = ['upload', 'preview', 'validation', 'processing', 'complete'];
    const currentIdx = steps.indexOf(state.step === 'failed' ? 'processing' : state.step);

    return (
      <div className="flex items-center justify-center mb-6">
        {steps.map((step, idx) => (
          <div key={step} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                idx < currentIdx
                  ? 'bg-green-500 text-white'
                  : idx === currentIdx
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {idx < currentIdx ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
            </div>
            {idx < steps.length - 1 && (
              <div className={`w-12 h-0.5 mx-1 ${idx < currentIdx ? 'bg-green-500' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderUploadStep = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contacts File */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              Contacts File (Required)
            </CardTitle>
            <CardDescription>
              CSV with customer data: master_id, contact_type, names, email, phone, address
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={contactsInputRef}
              type="file"
              accept=".csv"
              onChange={handleContactsFileSelect}
              className="hidden"
            />
            {contactsFile ? (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">{contactsFile.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setContactsFile(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full h-20 border-dashed"
                onClick={() => contactsInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                Select Contacts CSV
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Policies File */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              Policies File (Optional)
            </CardTitle>
            <CardDescription>
              CSV with policy data: policy_id, customer_id, carrier, dates, premium
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={policiesInputRef}
              type="file"
              accept=".csv"
              onChange={handlePoliciesFileSelect}
              className="hidden"
            />
            {policiesFile ? (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">{policiesFile.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPoliciesFile(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full h-20 border-dashed"
                onClick={() => policiesInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                Select Policies CSV
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Import Options</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={(e) => setSkipDuplicates(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Skip non-primary records (where is_primary = false)</span>
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleParse}
          disabled={!contactsFile}
        >
          Parse & Validate
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  const renderValidationStep = () => {
    const { validation } = state;
    if (!validation.contacts) return null;

    const totalValid = (validation.contacts?.valid.length || 0) + (validation.policies?.valid.length || 0);
    const totalInvalid = (validation.contacts?.invalid.length || 0) + (validation.policies?.invalid.length || 0);
    const totalSkipped = (validation.contacts?.skipped || 0) + (validation.policies?.skipped || 0);

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-500">{totalValid}</div>
              <div className="text-sm text-muted-foreground">Valid Records</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-500">{totalInvalid}</div>
              <div className="text-sm text-muted-foreground">Invalid Records</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-500">{totalSkipped}</div>
              <div className="text-sm text-muted-foreground">Skipped (Duplicates)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {validation.contacts.valid.length} / {validation.policies?.valid.length || 0}
              </div>
              <div className="text-sm text-muted-foreground">Contacts / Policies</div>
            </CardContent>
          </Card>
        </div>

        {/* Contacts Validation */}
        {validation.contacts && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contacts Validation</CardTitle>
              <CardDescription>
                {validation.contacts.valid.length} valid, {validation.contacts.invalid.length} invalid, {validation.contacts.skipped} skipped
              </CardDescription>
            </CardHeader>
            {validation.contacts.invalid.length > 0 && (
              <CardContent>
                <div className="max-h-48 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Name/ID</TableHead>
                        <TableHead>Errors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validation.contacts.invalid.slice(0, 10).map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {String(item.record?.master_id || 'N/A').substring(0, 20)}
                          </TableCell>
                          <TableCell className="text-red-500 text-xs">
                            {item.errors.join('; ')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {validation.contacts.invalid.length > 10 && (
                    <div className="text-sm text-muted-foreground mt-2">
                      ... and {validation.contacts.invalid.length - 10} more errors
                    </div>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Policies Validation */}
        {validation.policies && validation.policies.valid.length + validation.policies.invalid.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Policies Validation</CardTitle>
              <CardDescription>
                {validation.policies.valid.length} valid, {validation.policies.invalid.length} invalid, {validation.policies.skipped} skipped
              </CardDescription>
            </CardHeader>
            {validation.policies.invalid.length > 0 && (
              <CardContent>
                <div className="max-h-48 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Policy ID</TableHead>
                        <TableHead>Errors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validation.policies.invalid.slice(0, 10).map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {String(item.record?.policy_id || 'N/A').substring(0, 20)}
                          </TableCell>
                          <TableCell className="text-red-500 text-xs">
                            {item.errors.join('; ')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        <div className="flex justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Start Over
            </Button>
            {totalInvalid > 0 && (
              <Button variant="outline" onClick={downloadErrorReport}>
                <Download className="w-4 h-4 mr-2" />
                Download Errors
              </Button>
            )}
          </div>
          <Button
            onClick={handleStartImport}
            disabled={totalValid === 0}
          >
            Import {totalValid} Records
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  };

  const renderProcessingStep = () => {
    const { progress } = state;
    if (!progress) return null;

    const percentComplete = progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : 0;

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {progress.phase === 'contacts' ? 'Importing Contacts...' : 'Importing Policies...'}
            </CardTitle>
            <CardDescription>
              Batch {progress.currentBatch} of {progress.totalBatches}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={percentComplete} className="h-2" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{progress.processed} of {progress.total} processed</span>
              <span>{percentComplete}%</span>
            </div>

            <Separator />

            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-500">{progress.accountsCreated}</div>
                <div className="text-xs text-muted-foreground">Accounts</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-500">{progress.contactsCreated}</div>
                <div className="text-xs text-muted-foreground">Contacts</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-500">{progress.policiesCreated}</div>
                <div className="text-xs text-muted-foreground">Policies</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-500">{progress.errors}</div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  };

  const renderCompleteStep = () => {
    const { result } = state;
    if (!result) return null;

    return (
      <div className="space-y-6">
        <Alert className={result.success ? 'border-green-500' : 'border-yellow-500'}>
          {result.success ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : (
            <AlertCircle className="w-4 h-4 text-yellow-500" />
          )}
          <AlertTitle>
            {result.success ? 'Import Complete' : 'Import Complete with Errors'}
          </AlertTitle>
          <AlertDescription>
            {result.success
              ? 'All records have been successfully imported.'
              : `${result.errors.length} record(s) failed to import.`
            }
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-green-500">{result.accountsCreated}</div>
              <div className="text-sm text-muted-foreground">Accounts Created</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-blue-500">{result.contactsCreated}</div>
              <div className="text-sm text-muted-foreground">Contacts Created</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-purple-500">{result.policiesCreated}</div>
              <div className="text-sm text-muted-foreground">Policies Created</div>
            </CardContent>
          </Card>
        </div>

        {result.errors.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-red-500">Import Errors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.errors.slice(0, 10).map((err, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{err.rowNumber}</TableCell>
                        <TableCell className="font-mono text-xs">{err.sourceId}</TableCell>
                        <TableCell className="text-red-500 text-xs">{err.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadResultReport}>
              <Download className="w-4 h-4 mr-2" />
              Download Report
            </Button>
            {result.batchId && (
              <Button variant="destructive" onClick={rollback}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Rollback Import
              </Button>
            )}
          </div>
          <Button onClick={handleReset}>
            Import More Records
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  };

  const renderFailedStep = () => (
    <div className="space-y-6">
      <Alert variant="destructive">
        <AlertCircle className="w-4 h-4" />
        <AlertTitle>Import Failed</AlertTitle>
        <AlertDescription>{state.error || 'An unknown error occurred'}</AlertDescription>
      </Alert>

      {state.result?.batchId && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-4">
              Some records may have been imported before the failure. You can rollback to undo all changes.
            </p>
            <Button variant="destructive" onClick={rollback}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Rollback Import
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={handleReset}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Start Over
        </Button>
      </div>
    </div>
  );

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle>Bulk Import</CardTitle>
          <CardDescription>
            Import customers and policies from CSV files
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renderStepIndicator()}

          {state.step === 'upload' && renderUploadStep()}
          {(state.step === 'preview' || state.step === 'validation') && renderValidationStep()}
          {state.step === 'processing' && renderProcessingStep()}
          {state.step === 'complete' && renderCompleteStep()}
          {state.step === 'failed' && renderFailedStep()}
        </CardContent>
      </Card>
    </div>
  );
}
