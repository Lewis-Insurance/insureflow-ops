/**
 * AUTO-OWNERS RENEWAL TRACKING - IMPORT WIZARD (UPDATED FOR LEWIS & LEWIS FORMAT)
 * 
 * Excel/CSV import wizard specifically configured for Auto-Owners Renewal Report format
 * Automatically handles the special header structure from Auto-Owners reports
 */

import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  XCircle,
  Download,
  ArrowRight,
  ArrowLeft,
  Info,
} from "lucide-react";
import { useImportAORenewals, type AORenewal } from "@/hooks/useAORenewals";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type ImportStep = "upload" | "preview" | "import" | "complete";

export const AOImportWizard = () => {
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [mappedData, setMappedData] = useState<Partial<AORenewal>[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importStats, setImportStats] = useState<{
    total: number;
    successful: number;
    failed: number;
    duplicates: number;
  } | null>(null);

  const importMutation = useImportAORenewals();

  // Step 1: File Upload and Parsing
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const validTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ];

    if (!validTypes.includes(selectedFile.type) && 
        !selectedFile.name.match(/\.(xlsx?|csv)$/i)) {
      toast.error("Please upload an Excel (.xlsx, .xls) or CSV file");
      return;
    }

    setFile(selectedFile);

    // Parse the file
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: "binary", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON - this gets all rows
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          raw: false,
          dateNF: 'yyyy-mm-dd'
        });

        if (jsonData.length === 0) {
          toast.error("The file appears to be empty");
          return;
        }

        // Auto-Owners Renewal Report has special structure:
        // Row 0: "Renewal Report", "Start Date", "End Date"
        // Row 1: Agency info and date range
        // Row 2: Actual column headers (NAMED INSURED, POL TYPE, etc.)
        // Row 3+: Data

        let headerRowIndex = -1;
        let dataStartIndex = -1;

        // Find the header row (contains "NAMED INSURED")
        for (let i = 0; i < Math.min(10, jsonData.length); i++) {
          const row: any = jsonData[i];
          if (Array.isArray(row) && row.some((cell: any) => 
            String(cell).trim().toUpperCase() === 'NAMED INSURED'
          )) {
            headerRowIndex = i;
            dataStartIndex = i + 1;
            break;
          }
        }

        if (headerRowIndex === -1) {
          toast.error("Could not find column headers. Please ensure this is an Auto-Owners Renewal Report.");
          return;
        }

        // Extract headers
        const headers = (jsonData[headerRowIndex] || []).map((h: any) => String(h).trim());
        
        // Extract data rows
        const dataRows = jsonData.slice(dataStartIndex);
        
        // Parse data with Auto-Owners specific column mapping
        const parsedData: Partial<AORenewal>[] = [];
        
        dataRows.forEach((row: any) => {
          if (!Array.isArray(row) || row.length === 0) return;
          
          const renewal: Partial<AORenewal> = {
            status: "pending",
            priority: "normal",
            current_carrier: "Auto-Owners",
            custom_data: {}
          };

          headers.forEach((header, index) => {
            const value = row[index];
            if (value === null || value === undefined || value === '') return;

            const headerUpper = header.toUpperCase();

            // Map columns to fields
            if (headerUpper === 'NAMED INSURED') {
              renewal.customer_name = String(value).trim();
            } else if (headerUpper === 'POL TYPE') {
              renewal.policy_type = String(value).trim();
            } else if (headerUpper === 'POL #' || headerUpper === 'POLICY #') {
              renewal.policy_number = String(value).trim();
            } else if (headerUpper === 'EXP DATE' || headerUpper === 'EXPIRATION DATE') {
              // Handle date formats
              if (value instanceof Date) {
                renewal.renewal_date = value.toISOString().split('T')[0];
              } else if (typeof value === 'string') {
                // Try to parse the date
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                  renewal.renewal_date = date.toISOString().split('T')[0];
                }
              } else if (typeof value === 'number') {
                // Excel date serial number
                const date = XLSX.SSF.parse_date_code(value);
                renewal.renewal_date = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
              }
            } else if (headerUpper === 'EXP PREM' || headerUpper === 'PREMIUM') {
              const premium = parseFloat(String(value).replace(/[$,]/g, ''));
              if (!isNaN(premium)) {
                renewal.current_premium = premium;
              }
            } else if (headerUpper.includes('3 YR') && headerUpper.includes('LOSS')) {
              const losses = parseInt(String(value));
              if (!isNaN(losses)) {
                renewal.losses_3yr = losses;
              }
            } else if (headerUpper.includes('OLDEST IN HOUSEHOLD')) {
              const age = parseInt(String(value));
              if (!isNaN(age)) {
                renewal.oldest_in_household = age;
              }
            } else if (headerUpper.includes('LOSS')) {
              if (!renewal.custom_data) renewal.custom_data = {};
              renewal.custom_data.loss_count = String(value);
            } else if (headerUpper.includes('DISC') || headerUpper.includes('DISCOUNT')) {
              if (!renewal.custom_data) renewal.custom_data = {};
              renewal.custom_data.potential_discount = String(value);
            } else if (headerUpper.includes('SUPPORTING') || headerUpper.includes('HULA')) {
              if (!renewal.custom_data) renewal.custom_data = {};
              renewal.custom_data.supporting_policies = String(value);
            } else if (headerUpper.includes('SCORE')) {
              if (!renewal.custom_data) renewal.custom_data = {};
              renewal.custom_data.insurance_score = String(value);
            }
          });

          // Only add if we have required fields
          if (renewal.customer_name && renewal.policy_number && renewal.renewal_date) {
            // Auto-set priority based on premium and date
            if (renewal.current_premium && renewal.current_premium > 5000) {
              renewal.priority = "high";
            } else if (renewal.current_premium && renewal.current_premium > 2500) {
              renewal.priority = "normal";
            } else {
              renewal.priority = "normal";
            }

            // Check if renewal is coming up soon
            if (renewal.renewal_date) {
              const daysUntil = Math.floor(
                (new Date(renewal.renewal_date).getTime() - new Date().getTime()) / 
                (1000 * 60 * 60 * 24)
              );
              if (daysUntil <= 7) {
                renewal.priority = "urgent";
              } else if (daysUntil <= 30) {
                renewal.priority = "high";
              }
            }

            parsedData.push(renewal);
          }
        });

        if (parsedData.length === 0) {
          toast.error("No valid renewals found in the file");
          return;
        }

        setMappedData(parsedData);
        toast.success(`Loaded ${parsedData.length} renewals from ${selectedFile.name}`);
        setStep("preview");
      } catch (error) {
        console.error("Error parsing file:", error);
        toast.error("Failed to parse the file. Please check the format.");
      }
    };

    reader.readAsBinaryString(selectedFile);
  }, []);

  // Step 2: Start Import
  const startImport = async () => {
    setStep("import");
    setImportProgress(0);

    try {
      const result = await importMutation.mutateAsync({
        data: mappedData,
        filename: file?.name || "renewal_report.xls",
        importType: "initial",
      });

      setImportProgress(100);
      setImportStats({
        total: mappedData.length,
        successful: result.successful,
        failed: result.failed,
        duplicates: result.duplicates,
      });
      setStep("complete");
      
      if (result.failed === 0) {
        toast.success(`All ${result.successful} renewals imported successfully! 🎉`);
      } else {
        toast.warning(
          `Imported ${result.successful} renewals with ${result.failed} errors`,
          {
            description: result.duplicates > 0 
              ? `${result.duplicates} duplicates found`
              : undefined,
          }
        );
      }
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Import failed. Please try again.");
      setStep("preview");
    }
  };

  const resetWizard = () => {
    setStep("upload");
    setFile(null);
    setMappedData([]);
    setImportProgress(0);
    setImportStats(null);
  };

  const formatCurrency = (value: number | undefined) => {
    if (!value) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (date: string | undefined) => {
    if (!date) return "-";
    try {
      return new Date(date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return date;
    }
  };

  const totalPremium = mappedData.reduce((sum, r) => sum + (r.current_premium || 0), 0);

  return (
    <div className="space-y-4">
      {/* Progress Indicator */}
      <Card>
        <CardHeader>
          <CardTitle>Import Auto-Owners Renewals</CardTitle>
          <CardDescription>
            Upload your Auto-Owners Renewal Report (Excel or CSV)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            {["upload", "preview", "import", "complete"].map((s, index) => (
              <div key={s} className="flex items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                    step === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : index < ["upload", "preview", "import", "complete"].indexOf(step)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted bg-muted text-muted-foreground"
                  }`}
                >
                  {index + 1}
                </div>
                <span className="ml-2 text-sm font-medium capitalize">{s}</span>
                {index < 3 && (
                  <ArrowRight className="mx-4 h-4 w-4 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Auto-Owners Renewal Report</CardTitle>
            <CardDescription>
              Select your Excel (.xls, .xlsx) or CSV file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Auto-Detection Enabled</AlertTitle>
              <AlertDescription>
                This wizard automatically detects the Auto-Owners Renewal Report format and maps all columns correctly.
                No manual mapping needed!
              </AlertDescription>
            </Alert>

            <div className="flex items-center justify-center border-2 border-dashed rounded-lg p-12">
              <label className="flex flex-col items-center cursor-pointer">
                <FileSpreadsheet className="h-16 w-16 text-muted-foreground mb-4" />
                <span className="text-sm font-medium mb-2">
                  Click to upload or drag and drop
                </span>
                <span className="text-xs text-muted-foreground">
                  Auto-Owners Renewal Report (Excel or CSV)
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                />
              </label>
            </div>

            {file && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>File Selected</AlertTitle>
                <AlertDescription>
                  {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </AlertDescription>
              </Alert>
            )}

            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground mb-2">
                Expected columns in your file:
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  "NAMED INSURED",
                  "POL TYPE",
                  "POL #",
                  "EXP DATE",
                  "EXP PREM",
                  "3 YR # of LOSSES",
                  "SUPPORTING POLS",
                  "OLDEST IN HOUSEHOLD",
                  "INS SCORE"
                ].map((col) => (
                  <Badge key={col} variant="outline" className="text-xs">
                    {col}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && (
        <Card>
          <CardHeader>
            <CardTitle>Preview Import</CardTitle>
            <CardDescription>
              Review the renewals before importing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Total Renewals</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mappedData.length}</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Total Premium</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totalPremium)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Date Range</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm">
                    {mappedData.length > 0 && (
                      <>
                        {formatDate(Math.min(...mappedData.map(r => new Date(r.renewal_date || '').getTime())).toString())}
                        <br />to<br />
                        {formatDate(Math.max(...mappedData.map(r => new Date(r.renewal_date || '').getTime())).toString())}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Avg Premium</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(totalPremium / mappedData.length)}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="border rounded-lg overflow-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Policy #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Renewal Date</TableHead>
                    <TableHead>Premium</TableHead>
                    <TableHead>Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappedData.slice(0, 10).map((renewal, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {renewal.customer_name}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {renewal.policy_number}
                      </TableCell>
                      <TableCell className="text-sm">{renewal.policy_type}</TableCell>
                      <TableCell>{formatDate(renewal.renewal_date)}</TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(renewal.current_premium)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            renewal.priority === "urgent"
                              ? "destructive"
                              : renewal.priority === "high"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {renewal.priority}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {mappedData.length > 10 && (
              <p className="text-sm text-muted-foreground text-center">
                Showing 10 of {mappedData.length} renewals
              </p>
            )}

            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setStep("upload")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={startImport} disabled={importMutation.isPending}>
                {importMutation.isPending ? "Importing..." : "Start Import"}
                <Upload className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "import" && (
        <Card>
          <CardHeader>
            <CardTitle>Importing...</CardTitle>
            <CardDescription>
              Please wait while we import your renewal data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center py-12">
              <div className="w-full max-w-md space-y-4">
                <Progress value={importProgress} className="h-2" />
                <p className="text-center text-sm text-muted-foreground">
                  Importing {mappedData.length} renewals...
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "complete" && (
        <Card>
          <CardHeader>
            <CardTitle>Import Complete!</CardTitle>
            <CardDescription>
              Your renewal data has been successfully imported
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
              <h3 className="text-lg font-medium mb-2">Successfully imported!</h3>
              <p className="text-muted-foreground text-center">
                All renewal data is now available in the system
              </p>
            </div>

            {importStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Total</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{importStats.total}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-green-600">Success</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{importStats.successful}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-red-600">Failed</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{importStats.failed}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-yellow-600">Duplicates</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-600">{importStats.duplicates}</div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="flex justify-center gap-4 pt-4 border-t">
              <Button variant="outline" onClick={resetWizard}>
                Import Another File
              </Button>
              <Button onClick={() => window.location.href = "/ao-renewals"}>
                View Renewals
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
