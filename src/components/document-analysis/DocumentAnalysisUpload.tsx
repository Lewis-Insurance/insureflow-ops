import { useState } from 'react';
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface AnalysisResult {
  success: boolean;
  analysis_id: string;
  ocr_text: string;
  structured_data: any;
  total_pages: number;
  pages_analyzed: string;
  focus_region: string;
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
      // Step 1: Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      // Step 2: Create document record
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

      // Step 3: Call Azure analysis edge function
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke(
        'ai-document-analysis-azure',
        {
          body: {
            document_url: publicUrl,
            document_id: docData.id,
            file_name: file.name,
            user_id: userId,
            focus_region: focusRegion,
            page_range: focusRegion === 'custom' ? customRange : null,
          },
        }
      );

      if (analysisError) throw analysisError;

      if (!analysisData.success) {
        throw new Error(analysisData.error || 'Analysis failed');
      }

      setResult(analysisData);
      setAnalyzing(false);

      toast({
        title: 'Analysis Complete',
        description: `Analyzed ${analysisData.pages_analyzed} of ${analysisData.total_pages} pages`,
      });

    } catch (error: any) {
      console.error('Upload/Analysis Error:', error);
      setUploading(false);
      setAnalyzing(false);
      toast({
        title: 'Error',
        description: error.message || 'Failed to analyze document',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Insurance Document</CardTitle>
          <CardDescription>
            Upload a policy, quote, or declaration page for AI-powered analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Focus Region Selector */}
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
            <p className="text-xs text-muted-foreground">
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

          {/* Custom Range Input */}
          {focusRegion === 'custom' && (
            <div className="space-y-2">
              <Label>Page Range</Label>
              <Input
                placeholder="e.g., 2-5 or 10-15"
                value={customRange}
                onChange={(e) => setCustomRange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter page numbers like "2-5" to analyze pages 2 through 5
              </p>
            </div>
          )}

          {/* File Upload */}
          <div className="space-y-2">
            <Label>Document</Label>
            <Input
              type="file"
              accept=".pdf,.doc,.docx,image/*"
              onChange={handleFileChange}
              disabled={uploading || analyzing}
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {/* Upload Button */}
          <Button
            onClick={handleUpload}
            disabled={!file || uploading || analyzing}
            className="w-full"
          >
            {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {analyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {!uploading && !analyzing && <Upload className="mr-2 h-4 w-4" />}
            {uploading && 'Uploading...'}
            {analyzing && 'Analyzing with Azure AI...'}
            {!uploading && !analyzing && 'Upload & Analyze'}
          </Button>
        </CardContent>
      </Card>

      {/* Results Section */}
      {result && (
        <div className="space-y-4">
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Analysis Complete
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Pages</p>
                  <p className="font-semibold text-lg">{result.total_pages}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pages Analyzed</p>
                  <p className="font-semibold text-lg">{result.pages_analyzed}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Focus Region</p>
                  <p className="font-semibold text-lg capitalize">{result.focus_region}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Characters Extracted</p>
                  <p className="font-semibold text-lg">{result.ocr_text.length.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Structured Data Card */}
          <Card>
            <CardHeader>
              <CardTitle>Extracted Insurance Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Policy Details */}
              {result.structured_data.policy_number && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Policy Number</p>
                    <p className="font-semibold">{result.structured_data.policy_number}</p>
                  </div>
                  {result.structured_data.carrier && (
                    <div>
                      <p className="text-sm text-muted-foreground">Carrier</p>
                      <p className="font-semibold">{result.structured_data.carrier}</p>
                    </div>
                  )}
                  {result.structured_data.insured_name && (
                    <div>
                      <p className="text-sm text-muted-foreground">Insured</p>
                      <p className="font-semibold">{result.structured_data.insured_name}</p>
                    </div>
                  )}
                  {result.structured_data.document_type && (
                    <div>
                      <p className="text-sm text-muted-foreground">Document Type</p>
                      <p className="font-semibold capitalize">{result.structured_data.document_type.replace('_', ' ')}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Premium */}
              {result.structured_data.premium?.total && (
                <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <p className="text-sm text-muted-foreground">Total Premium</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    ${result.structured_data.premium.total.toLocaleString()}
                    {result.structured_data.premium.frequency && (
                      <span className="text-sm font-normal text-muted-foreground ml-2">
                        / {result.structured_data.premium.frequency}
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* Coverages */}
              {result.structured_data.coverages && result.structured_data.coverages.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Coverages</h4>
                  <div className="space-y-2">
                    {result.structured_data.coverages.map((coverage: any, index: number) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{coverage.name}</p>
                            <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                              {coverage.limit && <span>Limit: {coverage.limit}</span>}
                              {coverage.deductible && <span>Deductible: {coverage.deductible}</span>}
                            </div>
                          </div>
                          {coverage.premium && (
                            <p className="font-semibold">${coverage.premium}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vehicles */}
              {result.structured_data.vehicles && result.structured_data.vehicles.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Vehicles</h4>
                  <div className="space-y-2">
                    {result.structured_data.vehicles.map((vehicle: any, index: number) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <p className="font-medium">
                          {vehicle.year} {vehicle.make} {vehicle.model}
                        </p>
                        {vehicle.vin && (
                          <p className="text-sm text-muted-foreground">VIN: {vehicle.vin}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Property */}
              {result.structured_data.property?.address && (
                <div>
                  <h4 className="font-semibold mb-2">Property</h4>
                  <div className="p-3 border rounded-lg">
                    <p className="font-medium">{result.structured_data.property.address}</p>
                    {result.structured_data.property.type && (
                      <p className="text-sm text-muted-foreground capitalize">
                        {result.structured_data.property.type}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Key Details */}
              {result.structured_data.key_details && result.structured_data.key_details.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Key Details</h4>
                  <ul className="space-y-1 text-sm">
                    {result.structured_data.key_details.map((detail: string, index: number) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-muted-foreground">•</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* OCR Text (Collapsible) */}
          <Card>
            <CardHeader 
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setShowOcrText(!showOcrText)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Extracted Text (OCR)
                  <span className="text-sm font-normal text-muted-foreground">
                    - {result.ocr_text.length.toLocaleString()} characters
                  </span>
                </CardTitle>
                {showOcrText ? <ChevronUp /> : <ChevronDown />}
              </div>
            </CardHeader>
            {showOcrText && (
              <CardContent>
                <pre className="text-xs p-4 bg-muted rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">
                  {result.ocr_text}
                </pre>
              </CardContent>
            )}
          </Card>

          {/* Raw JSON Debug (Collapsible) */}
          <Card>
            <CardHeader 
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setShowRawJson(!showRawJson)}
            >
              <div className="flex items-center justify-between">
                <CardTitle>Debug: Raw Analysis Data</CardTitle>
                {showRawJson ? <ChevronUp /> : <ChevronDown />}
              </div>
            </CardHeader>
            {showRawJson && (
              <CardContent>
                <pre className="text-xs p-4 bg-muted rounded-lg overflow-auto max-h-96">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </CardContent>
            )}
          </Card>

          {/* Analyze Another Button */}
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
