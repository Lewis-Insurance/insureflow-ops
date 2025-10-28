import React, { useState } from 'react';
import { Upload, FileText, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDocumentUploadAndAnalysis, AnalysisMode, useDocumentAnalysisQuery } from '@/hooks/useDocumentAnalysis';
import { DocumentAnalysisDisplay } from './DocumentAnalysisDisplay';

interface DocumentUploadWithAnalysisProps {
  accountId?: string;
  onComplete?: (result: any) => void;
}

export const DocumentUploadWithAnalysis: React.FC<DocumentUploadWithAnalysisProps> = ({
  accountId,
  onComplete
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedAnalysisId, setCompletedAnalysisId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  
  const { 
    uploadAndAnalyze, 
    isUploading, 
    uploadProgress, 
    isAnalyzing, 
    analysisProgress,
    isProcessing 
  } = useDocumentUploadAndAnalysis();

  // Fetch analysis results after completion
  const { data: analysisData, isLoading: isLoadingAnalysis } = useDocumentAnalysisQuery(completedAnalysisId);

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
    const fileName = selectedFile.name;
    setUploadedFileName(fileName);

    try {
      const result = await uploadAndAnalyze({
        file: selectedFile,
        accountId: accountId,
        analysisMode: analysisMode,
        workflowContext: {
          source: 'manual_upload',
          account_id: accountId
        }
      });

      console.log('Upload result:', result);
      console.log('Analysis object:', result.analysis);
      console.log('Analysis ID:', result.analysis?.analysis_id);

      // Set the analysis ID to trigger results display
      if (result.analysis?.analysis_id) {
        setCompletedAnalysisId(result.analysis.analysis_id);
      }

      if (onComplete) {
        onComplete(result);
      }

      setSelectedFile(null);
    } catch (error: any) {
      console.error('Upload error:', error);
      
      let errorText = 'An unknown error occurred';
      
      if (error?.message) {
        errorText = error.message;
      } else if (typeof error === 'string') {
        errorText = error;
      } else if (error?.error) {
        errorText = error.error;
      }
      
      setErrorMessage(errorText);
    }
  };

  const handleNewUpload = () => {
    setCompletedAnalysisId(null);
    setSelectedFile(null);
    setErrorMessage(null);
    setUploadedFileName('');
  };

  const getProgressMessage = () => {
    if (isUploading) {
      if (uploadProgress < 30) return 'Uploading document...';
      if (uploadProgress < 80) return 'Storing in secure storage...';
      return 'Upload complete!';
    }
    if (isAnalyzing) {
      if (analysisProgress < 40) return 'Extracting text with OCR...';
      if (analysisProgress < 80) return 'Analyzing with AI...';
      return 'Finalizing analysis...';
    }
    if (completedAnalysisId && isLoadingAnalysis) {
      return 'Loading results...';
    }
    return '';
  };

  const totalProgress = isUploading 
    ? uploadProgress 
    : isAnalyzing 
    ? analysisProgress 
    : 0;

  // Show results if analysis is complete
  if (completedAnalysisId && analysisData) {
    // Parse analysis_result from JSONB
    const analysisResult = typeof analysisData.analysis_result === 'object' && analysisData.analysis_result !== null
      ? analysisData.analysis_result as any
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
        </Card>
        
        <DocumentAnalysisDisplay
          analysisResult={analysisResult}
          ocrText={analysisData.ocr_text || ''}
          fileName={uploadedFileName || analysisData.file_name || 'Document'}
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
      <CardContent className="space-y-4">
        {errorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Analysis Error</AlertTitle>
            <AlertDescription className="mt-2 text-sm whitespace-pre-wrap">
              {errorMessage}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">Analysis Mode</label>
          <Select
            value={analysisMode}
            onValueChange={(value) => setAnalysisMode(value as AnalysisMode)}
            disabled={isProcessing}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Complete Analysis (Recommended)</SelectItem>
              <SelectItem value="parse">Parse Data Only</SelectItem>
              <SelectItem value="summarize">Summarize Document</SelectItem>
              <SelectItem value="classify">Classify Document</SelectItem>
              <SelectItem value="insights">Generate Insights</SelectItem>
              <SelectItem value="workflow">Workflow Automation</SelectItem>
            </SelectContent>
          </Select>
        </div>

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
              <span className="font-semibold">{totalProgress}%</span>
            </div>
            <Progress value={totalProgress} className="h-2" />
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
