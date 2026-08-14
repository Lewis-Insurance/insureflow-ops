import { useState } from 'react';
import { Upload, FileText, Loader2, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Chip } from '@/components/cc/Chip';
import {
  readExtractSnapshot,
  maskSnapshotForDisplay,
  type ExtractSnapshotV1,
} from '@/lib/extractSnapshot';

interface AnalysisResult {
  success: boolean;
  analysis_id: string;
  ocr_text: string;
  snapshot: ExtractSnapshotV1;
  total_pages: number;
  pages_analyzed: string;
  focus_region: string;
}

const FEE_TYPE_LABELS: Record<string, string> = {
  tax: 'Tax',
  broker: 'Broker fee',
  surplus_lines: 'Surplus lines',
  nima: 'NIMA',
  other: 'Other fee',
};

function formatCurrency(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatBooleanLabel(value: boolean | null, yesLabel: string, noLabel: string): string | null {
  if (value === null) return null;
  return value ? yesLabel : noLabel;
}

export function DocumentAnalysisUpload() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [focusRegion, setFocusRegion] = useState('smart');
  const [customRange, setCustomRange] = useState('');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showOcrText, setShowOcrText] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: 'No file selected',
        description: 'Please select a document to analyze',
        variant: 'destructive',
      });
      return;
    }

    if (focusRegion === 'custom' && !customRange) {
      toast({
        title: 'Custom range required',
        description: 'Please enter a page range (e.g., "2-5")',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    setAnalyzing(false);

    try {
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
          filename: file.name,
          storage_path: filePath,
          storage_bucket: 'documents',
          kind: 'insurance_document',
          size_bytes: file.size,
          mime_type: file.type,
          uploaded_by: userId,
        })
        .select()
        .single();

      if (docError) throw docError;

      setUploading(false);
      setAnalyzing(true);

      const { data: analysisData, error: analysisError } = await supabase.functions.invoke(
        'ai-document-analysis-simple',
        {
          body: {
            document_id: docData.id,
            file_name: file.name,
            account_id: null,
            user_id: userId,
          },
        }
      );

      if (analysisError) throw analysisError;

      if (!analysisData.success) {
        throw new Error(analysisData.error || 'Analysis failed');
      }

      const snapshot = maskSnapshotForDisplay(readExtractSnapshot(analysisData.analysis));

      const formattedResult: AnalysisResult = {
        success: true,
        analysis_id: analysisData.document_id,
        ocr_text: analysisData.ocr_text || '',
        snapshot,
        total_pages: analysisData.page_count,
        pages_analyzed: `1-${analysisData.page_count}`,
        focus_region: 'all',
      };

      setResult(formattedResult);
      setAnalyzing(false);

      toast({
        title: 'Analysis Complete',
        description: `Analyzed all ${analysisData.page_count} pages`,
      });
    } catch (error: unknown) {
      console.error('Upload/Analysis Error:', error);
      setUploading(false);
      setAnalyzing(false);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to analyze document',
        variant: 'destructive',
      });
    }
  };

  const snapshot = result?.snapshot;

  return (
    <div className="space-y-6">
      <Card className="border-cc-border bg-cc-surface">
        <CardHeader>
          <CardTitle className="text-cc-text">Upload Insurance Document</CardTitle>
          <CardDescription className="text-cc-text-muted">
            Upload a policy, quote, or declaration page for AI-powered analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Focus Region</Label>
            <Select value={focusRegion} onValueChange={setFocusRegion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="smart">Smart (Auto-detect important pages)</SelectItem>
                <SelectItem value="front">Front (Pages 1-10)</SelectItem>
                <SelectItem value="middle">Middle (Centered 10 pages)</SelectItem>
                <SelectItem value="end">End (Last 10 pages)</SelectItem>
                <SelectItem value="first_third">First Third</SelectItem>
                <SelectItem value="middle_third">Middle Third</SelectItem>
                <SelectItem value="last_third">Last Third</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-cc-text-muted">
              {focusRegion === 'smart' && 'Automatically detects pages with coverage, premium, and policy information'}
              {focusRegion === 'front' && 'Best for most insurance documents where declarations are at the start'}
              {focusRegion === 'middle' && 'For documents with coverage details in the middle'}
              {focusRegion === 'end' && 'For documents with important info at the end'}
              {focusRegion === 'first_third' && 'Analyzes the first third of the document'}
              {focusRegion === 'middle_third' && 'Analyzes the middle third of the document'}
              {focusRegion === 'last_third' && 'Analyzes the last third of the document'}
              {focusRegion === 'custom' && 'Specify exact page range to analyze'}
            </p>
          </div>

          {focusRegion === 'custom' && (
            <div className="space-y-2">
              <Label>Page Range</Label>
              <Input
                placeholder="e.g., 2-5 or 10-15"
                value={customRange}
                onChange={(e) => setCustomRange(e.target.value)}
              />
              <p className="text-xs text-cc-text-muted">
                Enter page numbers like "2-5" to analyze pages 2 through 5
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Document</Label>
            <Input
              type="file"
              accept=".pdf,.doc,.docx,image/*"
              onChange={handleFileChange}
              disabled={uploading || analyzing}
            />
            {file && (
              <p className="text-sm text-cc-text-muted">
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <Button
            onClick={handleUpload}
            disabled={!file || uploading || analyzing}
            className="w-full bg-cc-accent text-cc-accent-foreground hover:bg-cc-accent/90"
          >
            {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {analyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {!uploading && !analyzing && <Upload className="mr-2 h-4 w-4" />}
            {uploading && 'Uploading...'}
            {analyzing && 'Analyzing with AI...'}
            {!uploading && !analyzing && 'Upload & Analyze'}
          </Button>
        </CardContent>
      </Card>

      {result && snapshot && (
        <div className="space-y-4">
          <Card className="border-cc-border bg-cc-surface">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-cc-text">
                <CheckCircle2 className="h-5 w-5 text-success" />
                Analysis Complete
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-cc-text-muted">Total Pages</p>
                  <p className="font-semibold text-lg cc-num text-cc-text">{result.total_pages}</p>
                </div>
                <div>
                  <p className="text-cc-text-muted">Pages Analyzed</p>
                  <p className="font-semibold text-lg cc-num text-cc-text">{result.pages_analyzed}</p>
                </div>
                <div>
                  <p className="text-cc-text-muted">Focus Region</p>
                  <p className="font-semibold text-lg capitalize text-cc-text">{result.focus_region}</p>
                </div>
                <div>
                  <p className="text-cc-text-muted">Characters Extracted</p>
                  <p className="font-semibold text-lg cc-num text-cc-text">
                    {result.ocr_text.length.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-cc-border bg-cc-surface">
            <CardHeader>
              <CardTitle className="text-cc-text">Extracted Insurance Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(snapshot.policy_number || snapshot.insured_name || snapshot.carriers.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-cc-lg bg-cc-surface-overlay">
                  {snapshot.policy_number && (
                    <div>
                      <p className="text-sm text-cc-text-muted">Policy Number</p>
                      <p className="font-semibold text-cc-text">{snapshot.policy_number}</p>
                    </div>
                  )}
                  {snapshot.insured_name && (
                    <div>
                      <p className="text-sm text-cc-text-muted">Insured</p>
                      <p className="font-semibold text-cc-text">{snapshot.insured_name}</p>
                    </div>
                  )}
                  {snapshot.document_type && (
                    <div>
                      <p className="text-sm text-cc-text-muted">Document Type</p>
                      <p className="font-semibold capitalize text-cc-text">
                        {snapshot.document_type.replace(/_/g, ' ')}
                      </p>
                    </div>
                  )}
                  {snapshot.carriers.length > 0 && (
                    <div className="md:col-span-2">
                      <p className="text-sm text-cc-text-muted mb-2">Carriers</p>
                      <div className="flex flex-wrap gap-2">
                        {snapshot.carriers.map((carrier) => (
                          <Chip key={carrier}>{carrier}</Chip>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(snapshot.effective_date || snapshot.expiration_date) && (
                <div className="grid grid-cols-2 gap-4 p-4 rounded-cc-lg border border-cc-border">
                  {snapshot.effective_date && (
                    <div>
                      <p className="text-sm text-cc-text-muted">Effective Date</p>
                      <p className="font-semibold text-cc-text">{snapshot.effective_date}</p>
                    </div>
                  )}
                  {snapshot.expiration_date && (
                    <div>
                      <p className="text-sm text-cc-text-muted">Expiration Date</p>
                      <p className="font-semibold text-cc-text">{snapshot.expiration_date}</p>
                    </div>
                  )}
                </div>
              )}

              {(snapshot.claims_made !== null || snapshot.defense_inside_limits !== null) && (
                <div className="flex flex-wrap gap-2">
                  {formatBooleanLabel(snapshot.claims_made, 'Claims-made', 'Occurrence') && (
                    <Chip>{formatBooleanLabel(snapshot.claims_made, 'Claims-made', 'Occurrence')}</Chip>
                  )}
                  {formatBooleanLabel(
                    snapshot.defense_inside_limits,
                    'Defense inside limits',
                    'Defense outside limits',
                  ) && (
                    <Chip>
                      {formatBooleanLabel(
                        snapshot.defense_inside_limits,
                        'Defense inside limits',
                        'Defense outside limits',
                      )}
                    </Chip>
                  )}
                </div>
              )}

              {snapshot.premium.total !== null && (
                <div className="p-4 rounded-cc-lg bg-cc-surface-overlay">
                  <p className="text-sm text-cc-text-muted">Total Premium</p>
                  <p className="text-2xl font-bold cc-num text-cc-text">
                    {formatCurrency(snapshot.premium.total)}
                    {snapshot.premium.frequency && (
                      <span className="text-sm font-normal text-cc-text-muted ml-2">
                        / {snapshot.premium.frequency}
                      </span>
                    )}
                  </p>
                </div>
              )}

              {snapshot.fees.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-cc-text">Fees</h4>
                  <div className="space-y-2">
                    {snapshot.fees.map((fee, index) => (
                      <div
                        key={`${fee.type}-${index}`}
                        className="flex justify-between items-center p-3 rounded-cc-lg border border-cc-border"
                      >
                        <span className="text-cc-text-secondary">
                          {fee.label ?? FEE_TYPE_LABELS[fee.type] ?? fee.type}
                        </span>
                        <span className="font-semibold cc-num text-cc-text">
                          {formatCurrency(fee.amount) ?? '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {snapshot.commission && (snapshot.commission.percent !== null || snapshot.commission.amount !== null) && (
                <div className="p-4 rounded-cc-lg border border-cc-border">
                  <p className="text-sm text-cc-text-muted mb-1">Commission</p>
                  <div className="flex gap-6 text-cc-text">
                    {snapshot.commission.percent !== null && (
                      <span className="cc-num font-semibold">{snapshot.commission.percent}%</span>
                    )}
                    {snapshot.commission.amount !== null && (
                      <span className="cc-num font-semibold">{formatCurrency(snapshot.commission.amount)}</span>
                    )}
                  </div>
                </div>
              )}

              {snapshot.coverages.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-cc-text">Coverages</h4>
                  <div className="space-y-2">
                    {snapshot.coverages.map((coverage, index) => (
                      <div key={index} className="p-3 rounded-cc-lg border border-cc-border">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <p className="font-medium text-cc-text">{coverage.name}</p>
                            {coverage.parent_coverage && (
                              <p className="text-xs text-cc-text-muted mt-0.5">
                                Included in {coverage.parent_coverage}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-4 mt-1 text-sm text-cc-text-muted">
                              {coverage.limit && <span>Limit: {coverage.limit}</span>}
                              {coverage.deductible && <span>Deductible: {coverage.deductible}</span>}
                            </div>
                          </div>
                          {coverage.premium !== null && coverage.premium !== undefined && (
                            <p className="font-semibold cc-num text-cc-text shrink-0">
                              {typeof coverage.premium === 'number'
                                ? formatCurrency(coverage.premium)
                                : coverage.premium}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {snapshot.locations.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-cc-text">Locations</h4>
                  <div className="space-y-2">
                    {snapshot.locations.map((location, index) => (
                      <div key={index} className="p-3 rounded-cc-lg border border-cc-border">
                        {location.address && (
                          <p className="font-medium text-cc-text">{location.address}</p>
                        )}
                        {location.occupancy && (
                          <p className="text-sm text-cc-text-muted capitalize">{location.occupancy}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {snapshot.vehicles.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-cc-text">Vehicles</h4>
                  <div className="space-y-2">
                    {snapshot.vehicles.map((vehicle, index) => (
                      <div key={index} className="p-3 rounded-cc-lg border border-cc-border">
                        <p className="font-medium text-cc-text">
                          {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
                        </p>
                        {vehicle.vin && (
                          <p className="text-sm text-cc-text-muted">VIN: {vehicle.vin}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {snapshot.drivers.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-cc-text">Drivers</h4>
                  <div className="space-y-2">
                    {snapshot.drivers.map((driver, index) => (
                      <div key={index} className="p-3 rounded-cc-lg border border-cc-border">
                        {driver.name && <p className="font-medium text-cc-text">{driver.name}</p>}
                        <div className="flex flex-wrap gap-4 mt-1 text-sm text-cc-text-muted">
                          {driver.date_of_birth && <span>DOB: {driver.date_of_birth}</span>}
                          {driver.license_number && (
                            <span>
                              License: {driver.license_number}
                              {driver.license_state ? ` (${driver.license_state})` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {snapshot.key_details.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-cc-text">Key Details</h4>
                  <ul className="space-y-1 text-sm">
                    {snapshot.key_details.map((detail, index) => (
                      <li key={index} className="flex items-start gap-2 text-cc-text-secondary">
                        <span className="text-cc-text-muted">-</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-cc-border bg-cc-surface">
            <CardHeader
              className="cursor-pointer hover:bg-cc-surface-overlay transition-colors"
              onClick={() => setShowOcrText(!showOcrText)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-cc-text">
                  <FileText className="h-5 w-5" />
                  Extracted Text (OCR)
                  <span className="text-sm font-normal text-cc-text-muted">
                    - {result.ocr_text.length.toLocaleString()} characters
                  </span>
                </CardTitle>
                {showOcrText ? <ChevronUp /> : <ChevronDown />}
              </div>
            </CardHeader>
            {showOcrText && (
              <CardContent>
                <pre className="text-xs p-4 rounded-cc-lg bg-cc-surface-overlay overflow-auto max-h-96 whitespace-pre-wrap text-cc-text-secondary">
                  {result.ocr_text}
                </pre>
              </CardContent>
            )}
          </Card>

          <Card className="border-cc-border bg-cc-surface">
            <CardHeader
              className="cursor-pointer hover:bg-cc-surface-overlay transition-colors"
              onClick={() => setShowRawJson(!showRawJson)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-cc-text">Debug: Raw Analysis Data</CardTitle>
                {showRawJson ? <ChevronUp /> : <ChevronDown />}
              </div>
            </CardHeader>
            {showRawJson && (
              <CardContent>
                <pre className="text-xs p-4 rounded-cc-lg bg-cc-surface-overlay overflow-auto max-h-96 text-cc-text-secondary">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </CardContent>
            )}
          </Card>

          <Button
            onClick={() => {
              setFile(null);
              setResult(null);
              setFocusRegion('smart');
              setCustomRange('');
            }}
            variant="outline"
            className="w-full"
          >
            Analyze Another Document
          </Button>
        </div>
      )}
    </div>
  );
}
