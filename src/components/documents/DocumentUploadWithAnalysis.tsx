import React, { useState, useEffect } from 'react';
import { Upload, FileText, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DocumentAnalysisDisplay } from './DocumentAnalysisDisplay';
import { DocumentFocusSelector } from './DocumentFocusSelector';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

interface DocumentUploadWithAnalysisProps {
  accountId?: string;
  onComplete?: (result: any) => void;
}

export const DocumentUploadWithAnalysis: React.FC<DocumentUploadWithAnalysisProps> = ({
  accountId,
  onComplete
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedAnalysisId, setCompletedAnalysisId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [focusRegion, setFocusRegion] = useState<string>('smart');
  const [customPageRange, setCustomPageRange] = useState<string>('');

  // Load saved focus region preference from localStorage
  useEffect(() => {
    const savedFocusRegion = localStorage.getItem('document_focus_region');
    if (savedFocusRegion) {
      setFocusRegion(savedFocusRegion);
    }
  }, []);

  // Save focus region preference to localStorage
  useEffect(() => {
    localStorage.setItem('document_focus_region', focusRegion);
  }, [focusRegion]);

  // Fetch analysis data when completedAnalysisId is set
  useEffect(() => {
    const fetchAnalysisData = async () => {
      if (!completedAnalysisId) return;

      logger.debug('Fetching analysis data for ID:', completedAnalysisId);
      setIsLoadingAnalysis(true);

      try {
        const { data, error } = await supabase
          .from('document_analysis')
          .select('*')
          .eq('id', completedAnalysisId)
          .maybeSingle();

        if (error) {
          logger.error('Error fetching analysis:', error);
          setErrorMessage(`Failed to load analysis: ${error.message}`);
          return;
        }

        if (!data) {
          logger.warn('No analysis data found for ID:', completedAnalysisId);
          setErrorMessage('Analysis not found. Please try again.');
          return;
        }

        logger.debug('Analysis data loaded:', data);
        setAnalysisData(data);
      } catch (err) {
        logger.error('Fetch error:', err);
        setErrorMessage(`Failed to load results: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsLoadingAnalysis(false);
      }
    };

    fetchAnalysisData();
  }, [completedAnalysisId]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setErrorMessage(null);
    setCompletedAnalysisId(null);
    setIsProcessing(true);
    setUploadProgress(0);
    const fileName = selectedFile.name;
    setUploadedFileName(fileName);

    try {
      logger.debug('=== STARTING UPLOAD ===');
      setUploadProgress(20);
      
      // Step 1: Upload to Supabase Storage
      const filePath = `${Date.now()}-${fileName}`;
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('documents')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      setUploadProgress(40);
      
      // Step 2: Get public URL
      const { data: { publicUrl } } = supabase
        .storage
        .from('documents')
        .getPublicUrl(filePath);

      logger.debug('File uploaded:', publicUrl);
      setUploadProgress(50);

      // Step 3: Get current user
      const { data: { user } } = await supabase.auth.getUser();

      setUploadProgress(60);

      // Step 4: Create document record in database
      const { data: documentRecord, error: docError } = await supabase
        .from('documents')
        .insert({
          filename: fileName,
          kind: 'insurance_document',
          storage_path: uploadData.path,
          storage_bucket: 'documents',
          account_id: accountId || null,
          uploaded_by: user?.id,
          mime_type: selectedFile.type,
          size_bytes: selectedFile.size,
          file_size: selectedFile.size
        })
        .select()
        .single();

      if (docError) throw docError;

      logger.debug('Document record created:', documentRecord.id);
      setUploadProgress(70);

      // Step 5: Call Azure analysis with proper document UUID
      logger.debug('Calling ai-document-analysis-azure...');
      setUploadProgress(80);
      
      const { data: analysisResult, error: analysisError } = await supabase.functions.invoke(
        'ai-document-analysis-azure',
        {
          body: {
            document_url: publicUrl,
            document_id: documentRecord.id,
            file_name: fileName,
            account_id: accountId || null,
            user_id: user?.id,
            focus_region: focusRegion,
            page_range: focusRegion === 'custom' ? customPageRange : null
          }
        }
      );

      logger.debug('Analysis result:', analysisResult);

      if (analysisError) throw analysisError;

      setUploadProgress(100);

      if (analysisResult?.analysis_id) {
        logger.debug('Setting analysis ID:', analysisResult.analysis_id);
        setCompletedAnalysisId(analysisResult.analysis_id);
      } else {
        throw new Error('No analysis_id returned');
      }

      if (onComplete) {
        onComplete(analysisResult);
      }

      setSelectedFile(null);
    } catch (error) {
      logger.error('Upload error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNewUpload = () => {
    setCompletedAnalysisId(null);
    setSelectedFile(null);
    setErrorMessage(null);
    setUploadedFileName('');
    setFocusRegion('smart');
    setCustomPageRange('');
  };

  const getProgressMessage = () => {
    if (isProcessing) {
      if (uploadProgress < 30) return 'Uploading document...';
      if (uploadProgress < 50) return 'Storing in secure storage...';
      if (uploadProgress < 70) return 'Extracting text with OCR...';
      if (uploadProgress < 90) return 'Analyzing with AI...';
      return 'Finalizing analysis...';
    }
    if (completedAnalysisId && isLoadingAnalysis) {
      return 'Loading results...';
    }
    return '';
  };

  // Show results if analysis is complete
  if (completedAnalysisId && analysisData) {
    // Parse analysis_result from JSONB
    const analysisResult = typeof analysisData.analysis_result === 'object' && analysisData.analysis_result !== null
      ? analysisData.analysis_result
      : {};

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Analysis Complete</CardTitle>
              <Button onClick={handleNewUpload} variant="outline">
                Analyze Another Document
              </Button>
            </div>
          </CardHeader>
          {(analysisData.total_pages || analysisData.pages_analyzed) && (
            <CardContent>
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Analyzed pages <span className="font-semibold text-foreground">{analysisData.pages_analyzed || 'N/A'}</span> of <span className="font-semibold text-foreground">{analysisData.total_pages || 'N/A'}</span> total pages
                </span>
              </div>
            </CardContent>
          )}
        </Card>
        
        <DocumentAnalysisDisplay
          analysisResult={analysisResult}
          ocrText={analysisData.ocr_text || ''}
          fileName={uploadedFileName || analysisData.file_name || 'Document'}
          totalPages={analysisData.total_pages}
          pagesAnalyzed={analysisData.pages_analyzed}
        />
      </div>
    );
  }

  // Show loading state while fetching results
  if (completedAnalysisId && isLoadingAnalysis) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading analysis results...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload & Analyze Document</CardTitle>
        <CardDescription>
          Upload insurance documents for AI-powered analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {errorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Analysis Error</AlertTitle>
            <AlertDescription className="mt-2 text-sm whitespace-pre-wrap">
              {errorMessage}
            </AlertDescription>
          </Alert>
        )}

        <DocumentFocusSelector
          value={focusRegion}
          onChange={setFocusRegion}
          customRange={customPageRange}
          onCustomRangeChange={setCustomPageRange}
          disabled={isProcessing}
        />

        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          {selectedFile ? (
            <div className="space-y-4">
              <FileText className="h-12 w-12 mx-auto text-blue-500" />
              <div>
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                onClick={() => setSelectedFile(null)}
                variant="outline"
                size="sm"
                disabled={isProcessing}
              >
                Change File
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <label htmlFor="file-upload" className="cursor-pointer">
                  <span className="text-blue-600 hover:text-blue-700 font-medium">
                    Choose a file
                  </span>
                  <span className="text-muted-foreground"> or drag and drop</span>
                </label>
                <input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.docx"
                  onChange={handleFileSelect}
                  disabled={isProcessing}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                PDF, JPEG, PNG, DOCX (max 50MB)
              </p>
            </div>
          )}
        </div>

        {isProcessing && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-medium">
                {getProgressMessage()}
              </span>
              <span className="font-semibold">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">
              This may take 30-60 seconds for large documents
            </p>
          </div>
        )}

        <Button
          onClick={handleUpload}
          disabled={!selectedFile || isProcessing}
          className="w-full"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {getProgressMessage()}
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload & Analyze
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
