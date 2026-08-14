import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface DocumentAnalysisUploadProps {
  hideWhenAnalysisId?: boolean;
}

export function DocumentAnalysisUpload({ hideWhenAnalysisId }: DocumentAnalysisUploadProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [focusRegion, setFocusRegion] = useState('smart');
  const [customRange, setCustomRange] = useState('');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  if (hideWhenAnalysisId) {
    return null;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
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

      setAnalyzing(false);

      toast({
        title: analysisData.partial_extraction ? 'Partial Analysis' : 'Analysis Complete',
        description: analysisData.partial_extraction
          ? `Analyzed ${analysisData.chunks_analyzed ?? analysisData.page_count} of ${analysisData.chunk_count ?? analysisData.page_count} chunks. Some pages may be missing from the extract.`
          : `Analyzed all ${analysisData.page_count} pages`,
        variant: analysisData.partial_extraction ? 'destructive' : 'default',
      });

      const analysisId = analysisData.analysis_id;
      if (analysisId) {
        navigate(`/analyze-documents/${analysisId}`);
      } else {
        throw new Error('Analysis completed but no analysis ID was returned');
      }
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
    </div>
  );
}
