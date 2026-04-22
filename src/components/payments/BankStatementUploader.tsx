import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { format } from 'date-fns';
import { todayLocalDate } from '@/lib/date/localDate';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useBankAccounts } from '@/hooks/useBankAccounts';
import { useImportStatement } from '@/hooks/useBankStatements';

interface BankStatementUploaderProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function BankStatementUploader({ onSuccess, onCancel }: BankStatementUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [bankAccountId, setBankAccountId] = useState('');
  const [statementDate, setStatementDate] = useState(todayLocalDate());
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [beginningBalance, setBeginningBalance] = useState('');
  const [endingBalance, setEndingBalance] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<string[][]>([]);

  const { data: bankAccounts = [] } = useBankAccounts();
  const importStatement = useImportStatement();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const uploadedFile = acceptedFiles[0];
    if (uploadedFile) {
      setFile(uploadedFile);

      // Parse CSV for preview
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const rows = text.split('\n').slice(0, 6).map((row) => {
          const values: string[] = [];
          let current = '';
          let inQuotes = false;
          for (const char of row) {
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          values.push(current.trim());
          return values;
        });
        setPreviewData(rows);
        setShowPreview(true);
      };
      reader.readAsText(uploadedFile);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });

  const handleImport = async () => {
    if (!file || !bankAccountId) return;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bank_account_id', bankAccountId);
      formData.append('statement_date', statementDate);
      formData.append('period_start', periodStart || statementDate);
      formData.append('period_end', periodEnd || statementDate);
      formData.append('beginning_balance', beginningBalance || '0');
      formData.append('ending_balance', endingBalance || '0');

      await importStatement.mutateAsync(formData);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to import statement:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Bank Account Selection */}
      <div className="space-y-2">
        <Label>Bank Account</Label>
        <Select value={bankAccountId} onValueChange={setBankAccountId}>
          <SelectTrigger>
            <SelectValue placeholder="Select bank account" />
          </SelectTrigger>
          <SelectContent>
            {bankAccounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.account_name} - {account.bank_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* File Upload */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary'}
          ${file ? 'bg-green-50 border-green-300' : ''}
        `}
      >
        <input {...getInputProps()} />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileSpreadsheet className="h-8 w-8 text-green-600" />
            <div className="text-left">
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
                setPreviewData([]);
              }}
            >
              Remove
            </Button>
          </div>
        ) : (
          <>
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-1">
              {isDragActive ? 'Drop the file here' : 'Drag & drop CSV file'}
            </p>
            <p className="text-sm text-muted-foreground">or click to browse</p>
          </>
        )}
      </div>

      {/* Statement Details */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Statement Date</Label>
          <Input
            type="date"
            value={statementDate}
            onChange={(e) => setStatementDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Period Start</Label>
          <Input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Period End</Label>
          <Input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </div>
        <div></div>
        <div className="space-y-2">
          <Label>Beginning Balance</Label>
          <Input
            type="number"
            step="0.01"
            value={beginningBalance}
            onChange={(e) => setBeginningBalance(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label>Ending Balance</Label>
          <Input
            type="number"
            step="0.01"
            value={endingBalance}
            onChange={(e) => setEndingBalance(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          disabled={!file || !bankAccountId || importStatement.isPending}
        >
          {importStatement.isPending ? 'Importing...' : 'Import Statement'}
        </Button>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>CSV Preview</DialogTitle>
            <DialogDescription>
              Showing first 5 rows of your file. Make sure the columns look correct.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {previewData.map((row, i) => (
                  <tr key={i} className={i === 0 ? 'font-medium bg-muted' : ''}>
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1 border">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowPreview(false)}>Close Preview</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Result */}
      {importStatement.isSuccess && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <p className="font-medium text-green-800">Statement imported successfully!</p>
            </div>
          </CardContent>
        </Card>
      )}

      {importStatement.isError && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <p className="font-medium text-red-800">
                Failed to import statement. Please check the file format.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
